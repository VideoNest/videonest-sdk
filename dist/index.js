'use strict';

Object.defineProperty(exports, '__esModule', { value: true });

var debugModule = require('debug');
var React = require('react');

function _interopDefaultLegacy (e) { return e && typeof e === 'object' && 'default' in e ? e : { 'default': e }; }

function _interopNamespace(e) {
    if (e && e.__esModule) return e;
    var n = Object.create(null);
    if (e) {
        Object.keys(e).forEach(function (k) {
            if (k !== 'default') {
                var d = Object.getOwnPropertyDescriptor(e, k);
                Object.defineProperty(n, k, d.get ? d : {
                    enumerable: true,
                    get: function () { return e[k]; }
                });
            }
        });
    }
    n["default"] = e;
    return Object.freeze(n);
}

var debugModule__default = /*#__PURE__*/_interopDefaultLegacy(debugModule);
var React__namespace = /*#__PURE__*/_interopNamespace(React);

// src/utils/debug.ts
// Debug mode configuration (disabled by default)
let isDebugEnabled = false;
// Initialize debug module but don't enable by default
const debugInstance = debugModule__default["default"]('videonest-sdk');
/**
 * Enable or disable debug mode for the SDK
 * @param enable Whether to enable debugging (true) or disable it (false)
 */
function setDebugMode(enable) {
    isDebugEnabled = enable;
    if (enable) {
        // Enable debug module
        debugModule__default["default"].enable('videonest-sdk');
        // Set localStorage if in browser environment
        if (typeof window !== 'undefined') {
            window.localStorage.setItem('debug', 'videonest-sdk');
        }
        console.log('[videonest-sdk] Debug mode enabled');
    }
    else {
        // Disable debug module
        debugModule__default["default"].disable();
        // Clear localStorage if in browser environment
        if (typeof window !== 'undefined') {
            window.localStorage.removeItem('debug');
        }
    }
}
/**
 * Get current debug mode status
 * @returns Boolean indicating if debug mode is enabled
 */
function isDebugModeEnabled() {
    return isDebugEnabled;
}
/**
 * Log messages only when debug mode is enabled
 */
const log = function (message, ...args) {
    if (isDebugEnabled) {
        debugInstance(message, ...args);
    }
};
/**
 * Log messages that should always appear in console when debug mode is enabled,
 * or stay silent when debug mode is disabled
 */
function forceLog(message, ...args) {
    if (isDebugEnabled) {
        console.log(`[videonest-sdk] ${message}`, ...args);
        debugInstance(message, ...args);
    }
}

function generateUUID() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
        const r = Math.random() * 16 | 0;
        const v = c === 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
    });
}

// uploadOptimizationManager.ts
function calculateOptimalChunkSize(fileSize, connectionSpeed = null) {
    let baseChunkSize;
    // MUCH LARGER base sizes for single file uploads
    if (fileSize < 50 * 1024 * 1024) { // < 50MB
        baseChunkSize = 5 * 1024 * 1024; // 5MB
    }
    else if (fileSize < 500 * 1024 * 1024) { // < 500MB  
        baseChunkSize = 15 * 1024 * 1024; // 15MB
    }
    else if (fileSize < 2 * 1024 * 1024 * 1024) { // < 2GB
        baseChunkSize = 35 * 1024 * 1024; // 35MB
    }
    else {
        baseChunkSize = 75 * 1024 * 1024; // 75MB
    }
    // AGGRESSIVE speed-based adjustments for single file
    if (connectionSpeed) {
        if (connectionSpeed > 50) { // > 50 Mbps - blazing fast
            baseChunkSize = Math.min(baseChunkSize * 3, 150 * 1024 * 1024); // Up to 150MB chunks!
        }
        else if (connectionSpeed > 15) { // > 15 Mbps - fast connection  
            baseChunkSize = Math.min(baseChunkSize * 2, 100 * 1024 * 1024); // Up to 100MB chunks
        }
        else if (connectionSpeed > 8) { // > 8 Mbps - decent connection
            baseChunkSize = Math.min(baseChunkSize * 1.5, 50 * 1024 * 1024);
        }
        else if (connectionSpeed < 3) { // < 3 Mbps - slow connection  
            baseChunkSize = Math.max(baseChunkSize * 0.3, 1024 * 1024); // Min 1MB
        }
    }
    return Math.floor(baseChunkSize);
}
class ConnectionSpeedDetector {
    constructor() {
        this.samples = [];
        this.avgSpeed = null;
    }
    recordChunkUpload(chunkSize, uploadTime) {
        const speedMbps = (chunkSize * 8) / (uploadTime / 1000) / 1000000;
        this.samples.push(speedMbps);
        // Keep only last 3 samples for FASTER reaction
        if (this.samples.length > 3) {
            this.samples.shift();
        }
        this.avgSpeed = this.samples.reduce((a, b) => a + b) / this.samples.length;
        return this.avgSpeed;
    }
    shouldAdjustConcurrency() {
        return this.samples.length >= 2; // Adjust after just 2 samples
    }
}
class UploadOptimizationManager {
    constructor(file, metadata, config) {
        this.maxPossibleConcurrency = 12; // Aggressive for single file
        this.uploadQueue = [];
        this.activeUploads = new Map();
        this.completedChunks = new Set();
        this.failedChunks = new Set();
        this.speedDetector = new ConnectionSpeedDetector();
        this.uploadId = '';
        // Track bytes uploaded per chunk
        this.chunkBytesUploaded = new Map();
        this.totalBytesUploaded = 0;
        // Track worker promises for dynamic scaling
        this.workerPromises = [];
        this.file = file;
        this.metadata = metadata;
        this.config = config;
        // Start aggressive for single file uploads
        this.maxConcurrency = 6;
        // Calculate chunk size ONCE and stick with it
        this.chunkSize = calculateOptimalChunkSize(file.size);
        this.totalChunks = Math.ceil(file.size / this.chunkSize);
    }
    async upload(onProgress) {
        const uploadId = generateUUID();
        this.uploadId = uploadId;
        // Initialize bytes tracking for each chunk
        for (let i = 0; i < this.totalChunks; i++) {
            this.chunkBytesUploaded.set(i, 0);
        }
        // Create upload queue with FIXED chunk calculations
        for (let i = 0; i < this.totalChunks; i++) {
            this.uploadQueue.push({
                index: i,
                uploadId,
                retries: 0,
                maxRetries: 2
            });
        }
        // Start initial concurrent uploads
        for (let i = 0; i < this.maxConcurrency; i++) {
            const workerPromise = this.uploadWorker(onProgress);
            this.workerPromises.push(workerPromise);
        }
        // Wait for all uploads to complete
        await Promise.all(this.workerPromises);
        if (this.failedChunks.size > 0) {
            throw new Error(`Failed to upload ${this.failedChunks.size} chunks`);
        }
        return { uploadId, totalChunks: this.totalChunks };
    }
    async uploadWorker(onProgress) {
        while (this.uploadQueue.length > 0 || this.activeUploads.size > 0) {
            // Get next chunk to upload
            const chunkInfo = this.uploadQueue.shift();
            if (!chunkInfo) {
                // Wait for active uploads to finish
                await new Promise(resolve => setTimeout(resolve, 100));
                continue;
            }
            try {
                await this.uploadChunk(chunkInfo, onProgress);
            }
            catch (error) {
                console.error(`Chunk ${chunkInfo.index} upload failed:`, error);
                if (chunkInfo.retries < chunkInfo.maxRetries) {
                    chunkInfo.retries++;
                    this.uploadQueue.push(chunkInfo); // Retry
                }
                else {
                    this.failedChunks.add(chunkInfo.index);
                }
            }
        }
    }
    async uploadChunk(chunkInfo, onProgress) {
        const { index, uploadId } = chunkInfo;
        // Use FIXED chunk size calculations - no dynamic changes
        const start = index * this.chunkSize;
        const end = Math.min(start + this.chunkSize, this.file.size);
        const chunk = this.file.slice(start, end);
        const chunkSize = chunk.size; // Actual chunk size
        if (chunkSize === 0) {
            throw new Error(`Empty chunk detected for index ${index}`);
        }
        this.activeUploads.set(index, chunkInfo);
        const formData = new FormData();
        formData.append('chunk', chunk);
        formData.append('uploadId', uploadId);
        formData.append('chunkIndex', index.toString());
        formData.append('totalChunks', this.totalChunks.toString());
        formData.append('fileName', this.file.name);
        formData.append('fileSize', this.file.size.toString());
        // Add metadata to first chunk
        if (index === 0) {
            formData.append('channelId', this.metadata.channelId.toString());
            if (this.metadata.title)
                formData.append('title', this.metadata.title);
            if (this.metadata.description)
                formData.append('description', this.metadata.description);
            if (this.metadata.tags) {
                // Handle tags that could be either string or array
                const tagsValue = Array.isArray(this.metadata.tags)
                    ? this.metadata.tags.join(',')
                    : this.metadata.tags;
                if (tagsValue && tagsValue.length > 0) {
                    formData.append('tags', tagsValue);
                }
            }
        }
        const startTime = Date.now();
        const baseUrl = this.config.baseUrl || 'https://api1.videonest.co';
        // Use XMLHttpRequest instead of fetch to track progress during upload
        return new Promise((resolve, reject) => {
            const xhr = new XMLHttpRequest();
            // Track progress during upload
            xhr.upload.onprogress = (event) => {
                if (event.lengthComputable) {
                    // Update progress for this specific chunk
                    const chunkProgress = event.loaded;
                    this.chunkBytesUploaded.set(index, chunkProgress);
                    // Calculate total bytes across all chunks
                    this.totalBytesUploaded = Array.from(this.chunkBytesUploaded.values())
                        .reduce((sum, bytes) => sum + bytes, 0);
                    // Report progress as percentage
                    const progressPercentage = (this.totalBytesUploaded / this.file.size) * 100;
                    onProgress(progressPercentage);
                }
            };
            xhr.open('POST', `${baseUrl}/sdk/${this.config.channelId}/upload-chunk`);
            xhr.setRequestHeader('Authorization', `Bearer ${this.config.apiKey}`);
            xhr.onload = () => {
                if (xhr.status >= 200 && xhr.status < 300) {
                    try {
                        const result = JSON.parse(xhr.responseText);
                        if (!result.success) {
                            reject(new Error(result.message || 'Chunk upload failed'));
                        }
                        else {
                            const uploadTime = Date.now() - startTime;
                            // Record upload time for speed calculation
                            const currentSpeed = this.speedDetector.recordChunkUpload(chunkSize, uploadTime);
                            // Mark this chunk as completed
                            this.activeUploads.delete(index);
                            this.completedChunks.add(index);
                            // Set final chunk size when completed
                            this.chunkBytesUploaded.set(index, chunkSize);
                            // ONLY adjust concurrency, NOT chunk size
                            if (this.speedDetector.shouldAdjustConcurrency() && index < this.totalChunks * 0.7) {
                                this.adjustConcurrency(currentSpeed);
                            }
                            resolve(result);
                        }
                    }
                    catch (e) {
                        reject(new Error('Invalid response from server'));
                    }
                }
                else {
                    reject(new Error('HTTP error: ' + xhr.status));
                }
            };
            xhr.onerror = () => reject(new Error('Network error during upload'));
            xhr.send(formData);
        });
    }
    adjustConcurrency(currentSpeed) {
        const oldConcurrency = this.maxConcurrency;
        // AGGRESSIVE scaling for single-file uploads
        if (currentSpeed > 50 && this.maxConcurrency < this.maxPossibleConcurrency) {
            this.maxConcurrency = Math.min(this.maxConcurrency + 2, this.maxPossibleConcurrency);
            console.log(`🚀 SDK: Boosting concurrency to ${this.maxConcurrency} (${currentSpeed.toFixed(1)} Mbps)`);
        }
        else if (currentSpeed > 25 && this.maxConcurrency < 10) {
            this.maxConcurrency = Math.min(this.maxConcurrency + 1, 10);
            console.log(`⚡ SDK: Increasing concurrency to ${this.maxConcurrency} (${currentSpeed.toFixed(1)} Mbps)`);
        }
        else if (currentSpeed > 15 && this.maxConcurrency < 8) {
            this.maxConcurrency = Math.min(this.maxConcurrency + 1, 8);
            console.log(`⚡ SDK: Moderate increase to ${this.maxConcurrency} (${currentSpeed.toFixed(1)} Mbps)`);
        }
        else if (currentSpeed < 5 && this.maxConcurrency > 2) {
            this.maxConcurrency = Math.max(this.maxConcurrency - 1, 2);
            console.log(`🐌 SDK: Reducing concurrency to ${this.maxConcurrency} (${currentSpeed.toFixed(1)} Mbps)`);
        }
        else if (currentSpeed < 1 && this.maxConcurrency > 1) {
            this.maxConcurrency = 1;
            console.log(`🚨 SDK: Emergency single thread (${currentSpeed.toFixed(1)} Mbps)`);
        }
        // Start additional workers if concurrency increased
        if (this.maxConcurrency > oldConcurrency) {
            const additionalWorkers = this.maxConcurrency - oldConcurrency;
            for (let i = 0; i < additionalWorkers; i++) {
                const workerPromise = this.uploadWorker(() => { }); // Empty progress callback for additional workers
                this.workerPromises.push(workerPromise);
            }
        }
    }
}

class VideonestClient {
    constructor(config) {
        this.config = config;
        log('VideonestClient initialized with channelId:', config.channelId);
    }
    async uploadVideo(file, options) {
        var _a;
        const sessionId = generateUUID();
        const startTime = Date.now();
        forceLog('Starting optimized video upload process');
        forceLog(`File: ${file.name}, size: ${file.size} bytes`);
        // Track upload start
        await this.trackVideoUpload('start', {
            sessionId,
            userId: 'SDK',
            filename: file.name,
            fileSize: file.size,
            chunksCount: 0, // Will be calculated
            startTime,
            status: 'in_progress'
        });
        try {
            const { metadata, onProgress = () => { }, thumbnail } = options;
            // Check if thumbnail is provided
            if (!thumbnail) {
                forceLog('Error: Thumbnail is required');
                throw new Error('Thumbnail is required for video upload');
            }
            forceLog('Upload options:', {
                metadata,
                hasThumbnail: !!thumbnail
            });
            // Make sure channelId is included in metadata
            const uploadMetadata = {
                ...metadata,
                channelId: this.config.channelId,
            };
            forceLog('Upload metadata:', uploadMetadata);
            // Create upload optimization manager
            const uploadManager = new UploadOptimizationManager(file, uploadMetadata, this.config);
            // Upload with optimization
            const { uploadId, totalChunks } = await uploadManager.upload(onProgress);
            forceLog(`All chunks uploaded. Finalizing upload... (uploadId: ${uploadId}, totalChunks: ${totalChunks})`);
            // Finalize the upload
            const finalData = {
                fileName: file.name,
                uploadId: uploadId,
                totalChunks: totalChunks.toString()
            };
            forceLog('Finalize request data:', finalData);
            const finalizeResponse = await fetch(`https://api1.videonest.co/sdk/${this.config.channelId}/finalize`, {
                method: 'POST',
                body: JSON.stringify(finalData),
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${this.config.apiKey}`
                },
            });
            forceLog(`Finalize response status: ${finalizeResponse.status}`);
            const finalizeResult = await finalizeResponse.json();
            forceLog('Finalize response data:', finalizeResult);
            if (!finalizeResult.success) {
                forceLog(`Finalization failed: ${finalizeResult.message}`);
                throw new Error(finalizeResult.message || 'Upload finalization failed');
            }
            forceLog('Upload successfully finalized');
            // Upload the provided thumbnail
            forceLog('Uploading user-provided thumbnail');
            await this.uploadThumbnail(thumbnail, finalizeResult.video.id);
            forceLog('Upload process completed successfully');
            // Track successful completion
            await this.trackVideoUpload('complete', {
                sessionId,
                userId: 'SDK',
                videoId: ((_a = finalizeResult.video) === null || _a === void 0 ? void 0 : _a.id) || 0,
                filename: file.name,
                fileSize: file.size,
                chunksCount: totalChunks,
                startTime,
                status: 'completed'
            });
            return finalizeResult;
        }
        catch (error) {
            forceLog(`Upload error: ${error instanceof Error ? error.message : 'Unknown error'}`, error);
            // Track failed upload
            await this.trackVideoUpload('failed', {
                sessionId,
                userId: 'SDK',
                videoId: 0,
                filename: file.name,
                fileSize: file.size,
                chunksCount: 0,
                startTime,
                status: 'failed'
            });
            return {
                success: false,
                message: error instanceof Error ? error.message : 'An unexpected error occurred during upload'
            };
        }
    }
    async trackVideoUpload(action, sessionData) {
        log("Tracking video upload:", action, sessionData);
        try {
            let endpoint = '';
            let method = 'POST';
            let requestBody;
            const baseUrl = 'https://api1.videonest.co';
            if (action === 'start') {
                // CREATE new session
                endpoint = '/video-stats/upload-sessions';
                method = 'POST';
                requestBody = {
                    session_id: sessionData.sessionId,
                    user_id: sessionData.userId,
                    video_id: sessionData.videoId || 0, // Will be updated later
                    filename: sessionData.filename,
                    file_size: sessionData.fileSize,
                    chunks_count: sessionData.chunksCount || 0,
                    status: 'in_progress'
                    // start_time will default to NOW() in the API
                };
            }
            else if (action === 'complete' || action === 'failed') {
                // UPDATE existing session
                endpoint = `/video-stats/upload-sessions/${sessionData.sessionId}`;
                method = 'POST'; // API uses POST for updates
                requestBody = {
                    video_id: sessionData.videoId,
                    end_time: new Date().toISOString(),
                    status: sessionData.status
                };
                if (sessionData.startTime) {
                    const duration = Date.now() - sessionData.startTime;
                    requestBody.total_duration = `${Math.floor(duration / 1000)} seconds`;
                    // Calculate average speed in Mbps
                    if (sessionData.fileSize && duration > 0) {
                        const speedBps = (sessionData.fileSize * 8) / (duration / 1000); // bits per second
                        requestBody.avg_speed_mbps = parseFloat((speedBps / 1000000).toFixed(2)); // Convert to Mbps
                    }
                }
            }
            const url = `${baseUrl}${endpoint}`;
            log("Upload session request:", { action, url, method, body: requestBody });
            const headers = {
                'Content-Type': 'application/json',
            };
            // Add authentication headers
            if (this.config.apiKey) {
                headers['X-API-Key'] = this.config.apiKey;
            }
            if (this.config.channelId) {
                headers['X-Channel-ID'] = this.config.channelId.toString();
            }
            const response = await fetch(url, {
                method,
                headers,
                body: JSON.stringify(requestBody),
            });
            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                log('Failed to track upload session:', errorData);
                return { success: false, error: 'Failed to track upload session' };
            }
            const data = await response.json();
            return { success: true, ...data };
        }
        catch (error) {
            log('Error tracking upload session:', error instanceof Error ? error.message : String(error));
            return { success: false, error: error instanceof Error ? error.message : 'Failed to track upload session' };
        }
    }
    async uploadThumbnail(thumbnailFile, videoId) {
        const formData = new FormData();
        formData.append('thumbnail', thumbnailFile);
        try {
            const response = await fetch(`https://api1.videonest.co/sdk/${this.config.channelId}/videos/${videoId}/send-thumbnail`, {
                method: 'POST',
                body: formData,
                headers: {
                    'Authorization': `Bearer ${this.config.apiKey}`
                },
            });
            const result = await response.json();
            if (!result.success) {
                throw new Error(result.message || 'Thumbnail upload failed');
            }
            return result;
        }
        catch (error) {
            throw new Error(error instanceof Error ? error.message : 'Failed to upload thumbnail');
        }
    }
    async getVideoStatus(videoId) {
        try {
            const response = await fetch(`https://api1.videonest.co/sdk/${this.config.channelId}/videos/${videoId}/status`, {
                method: 'GET',
                headers: {
                    'Authorization': `Bearer ${this.config.apiKey}`
                },
            });
            const result = await response.json();
            if (!result.success) {
                throw new Error(result.message || 'Failed to get video status');
            }
            return result;
        }
        catch (error) {
            throw new Error(error instanceof Error ? error.message : 'Failed to get video status');
        }
    }
    async listVideos() {
        try {
            const response = await fetch(`https://api1.videonest.co/sdk/${this.config.channelId}/videos`, {
                method: 'GET',
                headers: {
                    'Authorization': `Bearer ${this.config.apiKey}`
                },
            });
            log(`Videos list response status: ${response.status}`);
            const result = await response.json();
            log('Videos list response data:', result);
            if (!result.success) {
                log(`Videos list fetch failed: ${result.message || 'Unknown error'}`);
                return {
                    success: false,
                    message: result.message || 'Failed to retrieve videos'
                };
            }
            log(`Successfully retrieved ${result.videos ? result.videos.length : 0} videos`);
            return result;
        }
        catch (error) {
            log(`Videos list error: ${error instanceof Error ? error.message : 'Unknown error'}`, error);
            return {
                success: false,
                message: error instanceof Error ? error.message : 'Failed to retrieve videos'
            };
        }
    }
}

const VideonestEmbed = ({ videoId, config, style = {} }) => {
    const { primaryColor, secondaryColor, darkMode, width, height, showTitle, showDescription } = style;
    let embedUrl = `https://app.videonest.co/embed/single/${videoId}`;
    const params = [];
    if (primaryColor)
        params.push(`primary_color=${primaryColor.replace('#', '')}`);
    if (secondaryColor)
        params.push(`secondary_color=${secondaryColor.replace('#', '')}`);
    if (darkMode)
        params.push('dark_mode=true');
    if (showTitle)
        params.push('show_title=true');
    if (showDescription)
        params.push('show_description=true');
    // Add authentication parameters
    params.push(`channel_id=${config.channelId}`);
    params.push(`api_key=${config.apiKey}`);
    if (params.length > 0) {
        embedUrl += `?${params.join('&')}`;
    }
    return (React__namespace.createElement("iframe", { src: embedUrl, style: { width: width || '100%', height: height || '100%' }, frameBorder: "0", allow: "accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture", allowFullScreen: true, title: `Videonest video ${videoId}` }));
};

/**
 * Upload a video to VideoNest
 * @param file The video file to upload
 * @param options Upload options including metadata
 * @param config VideoNest configuration with channelId and apiKey
 */
async function uploadVideo(file, options, config) {
    const client = new VideonestClient(config);
    return client.uploadVideo(file, options);
}
/**
 * Get the status of a video
 * @param videoId The ID of the video to check status
 * @param config VideoNest configuration with channelId and apiKey
 */
async function getVideoStatus(videoId, config) {
    const client = new VideonestClient(config);
    return client.getVideoStatus(videoId);
}
/**
 * List all videos for the channel
 * @param config VideoNest configuration with channelId and apiKey
 */
async function listVideos(config) {
    const client = new VideonestClient(config);
    return client.listVideos();
}

exports.VideonestEmbed = VideonestEmbed;
exports.getVideoStatus = getVideoStatus;
exports.isDebugModeEnabled = isDebugModeEnabled;
exports.listVideos = listVideos;
exports.setDebugMode = setDebugMode;
exports.uploadVideo = uploadVideo;
//# sourceMappingURL=index.js.map
