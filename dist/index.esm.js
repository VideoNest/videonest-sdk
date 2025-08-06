import debugModule from 'debug';
import * as React from 'react';

// src/utils/debug.ts
// Debug mode configuration (disabled by default)
let isDebugEnabled = false;
// Initialize debug module but don't enable by default
const debugInstance = debugModule('videonest-sdk');
/**
 * Enable or disable debug mode for the SDK
 * @param enable Whether to enable debugging (true) or disable it (false)
 */
function setDebugMode(enable) {
    isDebugEnabled = enable;
    if (enable) {
        // Enable debug module
        debugModule.enable('videonest-sdk');
        // Set localStorage if in browser environment
        if (typeof window !== 'undefined') {
            window.localStorage.setItem('debug', 'videonest-sdk');
        }
    }
    else {
        // Disable debug module
        debugModule.disable();
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

// uploadOptimizationManager.ts - SDK v2 Upgrade
function calculateOptimalChunkSize(fileSize) {
    let baseChunkSize;
    if (fileSize < 50 * 1024 * 1024)
        baseChunkSize = 8 * 1024 * 1024; // < 50MB: 8MB
    else if (fileSize < 500 * 1024 * 1024)
        baseChunkSize = 25 * 1024 * 1024; // < 500MB: 25MB
    else if (fileSize < 2 * 1024 * 1024 * 1024)
        baseChunkSize = 50 * 1024 * 1024; // < 2GB: 50MB
    else
        baseChunkSize = 100 * 1024 * 1024; // 100MB
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
        if (this.samples.length > 5)
            this.samples.shift();
        this.avgSpeed = this.calculateWeightedAverage(this.samples);
        return this.avgSpeed;
    }
    calculateWeightedAverage(samples) {
        if (samples.length === 0)
            return 0;
        let weightedSum = 0;
        let totalWeight = 0;
        samples.forEach((speed, index) => {
            const weight = index + 1;
            weightedSum += speed * weight;
            totalWeight += weight;
        });
        return weightedSum / totalWeight;
    }
}
class UploadOptimizationManager {
    constructor(file, metadata, config) {
        this.uploadQueue = [];
        this.activeUploads = new Map();
        this.completedChunks = new Set();
        this.failedChunks = new Set();
        this.speedDetector = new ConnectionSpeedDetector();
        this.uploadId = '';
        this.chunkBytesUploaded = new Map();
        this.totalBytesUploaded = 0;
        this.startTime = 0;
        this.lastProgressReport = 0;
        this.file = file;
        this.metadata = metadata;
        this.config = config;
        this.chunkSize = calculateOptimalChunkSize(file.size);
        this.totalChunks = Math.ceil(file.size / this.chunkSize);
        console.log(`🚀 SDK Upload manager initialized: ${this.totalChunks} chunks, ${UploadOptimizationManager.CONCURRENCY} concurrency, ${(this.chunkSize / 1024 / 1024).toFixed(1)}MB chunk size`);
    }
    async upload(onProgress) {
        const uploadId = generateUUID();
        this.uploadId = uploadId;
        this.startTime = Date.now();
        onProgress(0, 'uploading');
        for (let i = 0; i < this.totalChunks; i++)
            this.chunkBytesUploaded.set(i, 0);
        for (let i = 0; i < this.totalChunks; i++)
            this.uploadQueue.push({ index: i, uploadId, retries: 0, maxRetries: 3 });
        const workerPromises = [];
        for (let i = 0; i < UploadOptimizationManager.CONCURRENCY; i++)
            workerPromises.push(this.uploadWorker(onProgress));
        await Promise.all(workerPromises);
        if (this.failedChunks.size > 0) {
            onProgress(0, 'failed');
            throw new Error(`Failed to upload ${this.failedChunks.size} chunks after retries`);
        }
        console.log(`✅ SDK Upload completed in ${((Date.now() - this.startTime) / 1000).toFixed(1)}s`);
        return { uploadId, totalChunks: this.totalChunks };
    }
    async uploadWorker(onProgress) {
        while (this.uploadQueue.length > 0 || this.activeUploads.size > 0) {
            if (this.uploadQueue.length > 0 && this.activeUploads.size < UploadOptimizationManager.CONCURRENCY) {
                const chunkInfo = this.uploadQueue.shift();
                if (chunkInfo) {
                    try {
                        await this.uploadChunk(chunkInfo, onProgress);
                    }
                    catch (error) {
                        this.handleChunkError(chunkInfo, error);
                    }
                }
            }
            else {
                await new Promise(resolve => setTimeout(resolve, 100));
            }
        }
    }
    async uploadChunk(chunkInfo, onProgress) {
        const { index, uploadId } = chunkInfo;
        const start = index * this.chunkSize;
        const end = Math.min(start + this.chunkSize, this.file.size);
        const chunk = this.file.slice(start, end);
        const chunkSize = chunk.size;
        if (chunkSize === 0)
            throw new Error(`Empty chunk detected for index ${index}`);
        this.activeUploads.set(index, { ...chunkInfo, startTime: Date.now() });
        const formData = new FormData();
        formData.append('chunk', chunk);
        formData.append('uploadId', uploadId);
        formData.append('chunkIndex', index.toString());
        formData.append('totalChunks', this.totalChunks.toString());
        const startTime = Date.now();
        const baseUrl = this.config.baseUrl || 'https://api1.videonest.co';
        return new Promise((resolve, reject) => {
            const xhr = new XMLHttpRequest();
            xhr.timeout = 120000;
            xhr.upload.onprogress = (event) => {
                if (event.lengthComputable) {
                    this.chunkBytesUploaded.set(index, event.loaded);
                    this.totalBytesUploaded = Array.from(this.chunkBytesUploaded.values()).reduce((sum, bytes) => sum + bytes, 0);
                    const now = Date.now();
                    if (now - this.lastProgressReport > 100) {
                        const progressPercentage = (this.totalBytesUploaded / this.file.size) * 100;
                        onProgress(progressPercentage, 'uploading');
                        this.lastProgressReport = now;
                    }
                }
            };
            xhr.open('POST', `${baseUrl}/sdk/${this.config.channelId}/upload-chunk-v2`);
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
                            this.speedDetector.recordChunkUpload(chunkSize, uploadTime);
                            this.activeUploads.delete(index);
                            this.completedChunks.add(index);
                            this.chunkBytesUploaded.set(index, chunkSize);
                            resolve(result);
                        }
                    }
                    catch (e) {
                        reject(new Error('Invalid response from server'));
                    }
                }
                else {
                    reject(new Error(`HTTP error: ${xhr.status}`));
                }
            };
            xhr.onerror = () => reject(new Error('Network error during upload'));
            xhr.ontimeout = () => reject(new Error('Upload timeout - chunk may be too large'));
            xhr.send(formData);
        });
    }
    handleChunkError(chunkInfo, error) {
        console.error(`Chunk ${chunkInfo.index} upload failed:`, error.message);
        if (chunkInfo.retries < chunkInfo.maxRetries) {
            chunkInfo.retries++;
            setTimeout(() => {
                this.uploadQueue.unshift(chunkInfo);
            }, Math.pow(2, chunkInfo.retries) * 1000);
        }
        else {
            this.failedChunks.add(chunkInfo.index);
            this.activeUploads.delete(chunkInfo.index);
        }
    }
    getUploadStats() {
        return {
            totalChunks: this.totalChunks,
            completedChunks: this.completedChunks.size,
            failedChunks: this.failedChunks.size,
            activeUploads: this.activeUploads.size,
            chunkSize: this.chunkSize,
            totalSize: this.file.size,
            averageSpeed: this.speedDetector.avgSpeed
        };
    }
    getTotalChunks() {
        return this.totalChunks;
    }
}
UploadOptimizationManager.CONCURRENCY = 6;

class VideonestClient {
    constructor(config) {
        this.config = config;
        log('VideonestClient initialized with channelId:', config.channelId);
    }
    async uploadVideo(file, options) {
        var _a, _b;
        forceLog('Starting optimized video upload process');
        forceLog(`File: ${file.name}, size: ${file.size} bytes`);
        // Generate a unique session ID for tracking
        const sessionId = generateUUID();
        const startTime = Date.now();
        try {
            const { metadata, onProgress = (_progress, _status) => { }, thumbnail } = options;
            // Check if thumbnail is provided
            if (!thumbnail) {
                forceLog('Error: Thumbnail is required');
                onProgress(0, 'failed');
                // Track failed upload (missing thumbnail)
                await this.trackVideoUpload('failed', {
                    sessionId,
                    startTime,
                    status: 'failed',
                    filename: file.name,
                    fileSize: file.size,
                    chunksCount: 0,
                });
                throw new Error('Thumbnail is required for video upload');
            }
            forceLog('Upload options:', {
                metadata,
                hasThumbnail: !!thumbnail
            });
            // Make sure channelId is included in metadata
            const uploadMetadata = { ...metadata, channelId: this.config.channelId };
            forceLog('Upload metadata:', uploadMetadata);
            // Create upload optimization manager
            const uploadManager = new UploadOptimizationManager(file, uploadMetadata, this.config);
            // Get actual number of chunks based on optimal chunk size calculation
            const actualChunks = uploadManager.getTotalChunks();
            // Start tracking upload session with actual chunk count
            await this.trackVideoUpload('start', {
                sessionId,
                startTime,
                userId: 'sdk-user', // Use generic user ID for SDK uploads
                filename: file.name,
                fileSize: file.size,
                chunksCount: actualChunks, // Use actual calculated chunks, not default 2MB chunks
                status: 'in_progress'
            });
            // Upload chunks with optimization
            const { uploadId, totalChunks } = await uploadManager.upload(onProgress);
            // Set status to finalizing once chunks are done
            onProgress(100, 'finalizing');
            forceLog(`All chunks uploaded. Finalizing upload... (uploadId: ${uploadId}, totalChunks: ${totalChunks})`);
            const finalData = {
                fileName: file.name,
                uploadId: uploadId,
                totalChunks: totalChunks.toString(),
                title: uploadMetadata.title || 'Untitled Video',
                description: uploadMetadata.description || '',
                tags: uploadMetadata.tags ? (Array.isArray(uploadMetadata.tags) ? uploadMetadata.tags.join(',') : uploadMetadata.tags) : ''
            };
            forceLog('Finalize request data:', finalData);
            // Use new SDK v2 finalize route
            const finalizeResponse = await fetch(`https://api1.videonest.co/sdk/${this.config.channelId}/finalize-v2`, {
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
                onProgress(100, 'failed');
                // Track failed upload (finalization failed)
                await this.trackVideoUpload('failed', {
                    sessionId,
                    startTime,
                    status: 'failed',
                    filename: file.name,
                    fileSize: file.size,
                    chunksCount: totalChunks,
                    videoId: ((_a = finalizeResult.video) === null || _a === void 0 ? void 0 : _a.id) || 0
                });
                throw new Error(finalizeResult.message || 'Upload finalization failed');
            }
            forceLog('Upload successfully finalized');
            // Track successful upload completion before thumbnail upload
            await this.trackVideoUpload('complete', {
                sessionId,
                startTime,
                status: 'complete',
                filename: file.name,
                fileSize: file.size,
                chunksCount: totalChunks,
                videoId: finalizeResult.video.id
            });
            // Upload the provided thumbnail
            forceLog('Uploading user-provided thumbnail');
            await this.uploadThumbnail(thumbnail, finalizeResult.video.id);
            forceLog('Upload process completed successfully');
            return finalizeResult;
        }
        catch (error) {
            forceLog(`Upload error: ${error instanceof Error ? error.message : 'Unknown error'}`, error);
            (_b = options.onProgress) === null || _b === void 0 ? void 0 : _b.call(options, 0, 'failed');
            await this.trackVideoUpload('failed', {
                sessionId,
                startTime,
                status: 'failed',
                filename: file.name,
                fileSize: file.size
            });
            return {
                success: false,
                message: error instanceof Error ? error.message : 'An unexpected error occurred during upload'
            };
        }
    }
    // correct endpoint 
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
                    if (sessionData.fileSize && duration > 0) {
                        const speedBps = (sessionData.fileSize * 8) / (duration / 1000); // bits per second
                        requestBody.avg_speed_mbps = parseFloat((speedBps / 1000000).toFixed(2)); // Convert to Mbps
                    }
                }
            }
            const url = `${baseUrl}${endpoint}`;
            const headers = { 'Content-Type': 'application/json' };
            const response = await fetch(url, { method, headers, body: JSON.stringify(requestBody) });
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
    return (React.createElement("iframe", { src: embedUrl, style: { width: width || '100%', height: height || '100%' }, frameBorder: "0", allow: "accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture", allowFullScreen: true, title: `Videonest video ${videoId}` }));
};

const VideonestPreview = ({ videoId, config, style = {} }) => {
    const { primaryColor, secondaryColor, darkMode, width, height, showTitle, showDescription } = style;
    let embedUrl = `https://app.videonest.co/embed/preview/${videoId}`;
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
    // new version
    params.push(`channel_id=${config.channelId}`);
    params.push(`api_key=${config.apiKey}`);
    if (params.length > 0) {
        embedUrl += `?${params.join('&')}`;
    }
    return (React.createElement("iframe", { src: embedUrl, style: { width: width || '100%', height: height || '100%' }, frameBorder: "0", allow: "accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture", allowFullScreen: true, title: `Videonest video ${videoId}` }));
};

/**
 * Upload a video to VideoNest
 * @param file The video file to upload
 * @param options Upload options including metadata
 * @param config VideoNest configuration with channelId and apiKey
 */
// Minor
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

export { VideonestEmbed, VideonestPreview, getVideoStatus, isDebugModeEnabled, listVideos, setDebugMode, uploadVideo };
//# sourceMappingURL=index.esm.js.map
