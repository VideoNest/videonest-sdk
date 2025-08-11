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

class VideonestClient {
    constructor(config) {
        this.config = config;
        log('VideonestClient initialized with channelId:', config.channelId);
    }
    /**
     * Upload video directly to S3 using presigned URLs
     */
    async uploadVideoDirectToS3(file, presignedUrls, uploadId, s3Key, chunkSize, onProgress) {
        try {
            const totalParts = presignedUrls.length;
            const uploadedParts = [];
            forceLog(`🚀 Starting S3 upload: ${file.name} (${totalParts} parts)`);
            // Track progress for each chunk
            const chunkProgress = new Array(totalParts).fill(0);
            const updateOverallProgress = () => {
                const totalProgress = chunkProgress.reduce((sum, progress) => sum + progress, 0);
                const overallProgress = totalProgress / totalParts;
                onProgress(overallProgress);
            };
            // Upload each chunk to S3
            const chunkPromises = presignedUrls.map(async (presignedUrl, index) => {
                const start = index * chunkSize;
                const end = Math.min(start + chunkSize, file.size);
                const chunk = file.slice(start, end);
                if (chunk.size === 0) {
                    throw new Error(`Empty chunk detected for part ${index + 1}`);
                }
                return new Promise((resolve, reject) => {
                    const xhr = new XMLHttpRequest();
                    xhr.timeout = 300000; // 5 minutes timeout
                    xhr.upload.onprogress = (event) => {
                        if (event.lengthComputable) {
                            chunkProgress[index] = (event.loaded / event.total) * 100;
                            updateOverallProgress();
                        }
                    };
                    xhr.onload = () => {
                        if (xhr.status >= 200 && xhr.status < 300) {
                            const etag = xhr.getResponseHeader('ETag');
                            if (!etag) {
                                reject(new Error(`No ETag received for part ${index + 1}`));
                                return;
                            }
                            chunkProgress[index] = 100;
                            updateOverallProgress();
                            resolve({
                                PartNumber: index + 1,
                                ETag: etag.replace(/"/g, '') // Remove quotes from ETag
                            });
                        }
                        else {
                            reject(new Error(`HTTP ${xhr.status}: Failed to upload part ${index + 1}`));
                        }
                    };
                    xhr.onerror = () => {
                        reject(new Error(`Network error uploading part ${index + 1}`));
                    };
                    xhr.ontimeout = () => {
                        reject(new Error(`Timeout uploading part ${index + 1}`));
                    };
                    xhr.open('PUT', presignedUrl);
                    xhr.setRequestHeader('Content-Type', 'application/octet-stream');
                    xhr.send(chunk);
                });
            });
            // Wait for all chunks to upload
            const parts = await Promise.all(chunkPromises);
            // Sort parts by part number to ensure correct order
            const sortedParts = parts.sort((a, b) => a.PartNumber - b.PartNumber);
            forceLog(`✅ S3 upload completed: ${file.name} (${sortedParts.length} parts)`);
            return {
                success: true,
                uploadId: uploadId,
                s3Key: s3Key,
                parts: sortedParts
            };
        }
        catch (error) {
            forceLog(`❌ S3 upload failed for ${file.name}:`, error);
            return {
                success: false,
                error: error instanceof Error ? error.message : 'Upload failed',
                uploadId: uploadId,
                s3Key: s3Key,
                parts: []
            };
        }
    }
    /**
     * Main video upload method
     */
    async uploadVideo(file, options) {
        var _a, _b;
        forceLog('Starting direct S3 video upload process');
        forceLog(`File: ${file.name}, size: ${file.size} bytes`);
        try {
            const { metadata, onProgress = (_progress, _status) => { }, thumbnail } = options;
            // Check if thumbnail is provided
            if (!thumbnail) {
                forceLog('Error: Thumbnail is required');
                onProgress(0, 'failed');
                throw new Error('Thumbnail is required for video upload');
            }
            forceLog('all upload arguments:', {
                file,
                options,
                thumbnail
            });
            // Make sure channelId is included in metadata
            const uploadMetadata = { ...metadata, channelId: this.config.channelId };
            forceLog('Upload metadata:', uploadMetadata);
            // Step 1: Generate presigned URLs using SDK endpoint
            forceLog('📡 Generating presigned URLs via SDK endpoint...');
            const presignedResponse = await fetch(`https://api1.videonest.co/sdk/${this.config.channelId}/generate-presigned-url`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${this.config.apiKey}`
                },
                body: JSON.stringify({
                    fileName: file.name,
                    fileSize: file.size,
                    contentType: file.type,
                    metadata: uploadMetadata
                })
            });
            if (!presignedResponse.ok) {
                throw new Error(`Failed to generate presigned URLs: ${presignedResponse.status}`);
            }
            const presignedData = await presignedResponse.json();
            if (!presignedData.success) {
                throw new Error(presignedData.error || 'Failed to generate presigned URLs');
            }
            forceLog('✅ Presigned URLs generated successfully');
            // Step 2: Upload video directly to S3
            forceLog('📤 Starting direct S3 upload...');
            onProgress(0, 'uploading');
            const uploadResult = await this.uploadVideoDirectToS3(file, presignedData.presignedUrls, presignedData.uploadId, presignedData.s3Key, presignedData.chunkSize, (progress) => {
                forceLog(`Upload progress: ${progress.toFixed(1)}%`);
                onProgress(progress, 'uploading');
            });
            forceLog('🔍 Complete upload request details:', {
                endpoint: `https://api1.videonest.co/sdk/${this.config.channelId}/complete-upload`,
                uploadId: uploadResult.uploadId,
                s3Key: uploadResult.s3Key,
                parts: uploadResult.parts,
                partsCount: (_a = uploadResult.parts) === null || _a === void 0 ? void 0 : _a.length,
                firstPart: (_b = uploadResult.parts) === null || _b === void 0 ? void 0 : _b[0],
                authorization: `Bearer ${this.config.apiKey.substring(0, 10)}...`
            });
            if (!uploadResult.success) {
                throw new Error(uploadResult.error || 'S3 upload failed');
            }
            forceLog('✅ S3 upload completed, starting finalization...');
            onProgress(100, 'finalizing');
            // Step 3: Complete upload using SDK endpoint
            forceLog('🏁 Completing upload via SDK endpoint...');
            const completeResponse = await fetch(`https://api1.videonest.co/sdk/${this.config.channelId}/complete-upload`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${this.config.apiKey}`
                },
                body: JSON.stringify({
                    uploadId: uploadResult.uploadId,
                    s3Key: uploadResult.s3Key,
                    parts: uploadResult.parts
                })
            });
            if (!completeResponse.ok) {
                throw new Error(`Failed to complete upload: ${completeResponse.status}`);
            }
            const completeData = await completeResponse.json();
            if (!completeData.success) {
                throw new Error(completeData.message || 'Upload completion failed');
            }
            forceLog('🎉 Video record created successfully:', completeData.data.videoId);
            // Step 4: Upload thumbnail using SDK endpoint
            forceLog('🖼️ Uploading user-provided thumbnail...');
            await this.uploadThumbnail(thumbnail, completeData.data.videoId);
            forceLog('✅ Upload process completed successfully');
            return {
                success: true,
                message: 'Video uploaded successfully',
                video: {
                    id: completeData.data.videoId,
                }
            };
        }
        catch (error) {
            forceLog(`Upload error: ${error instanceof Error ? error.message : 'Unknown error'}`, error);
            return {
                success: false,
                message: error instanceof Error ? error.message : 'An unexpected error occurred during upload'
            };
        }
    }
    /**
     * Upload thumbnail to the video
     */
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
    /**
     * Get video status
     */
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
    /**
     * List all videos in the channel
     */
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
