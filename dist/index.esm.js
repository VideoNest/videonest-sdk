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
        console.log('[videonest-sdk] Debug mode enabled');
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
    async uploadVideo(file, options) {
        forceLog('Starting video upload process');
        forceLog(`File: ${file.name}, size: ${file.size} bytes`);
        try {
            const { metadata, chunkSize = 2 * 1024 * 1024, onProgress = () => { }, thumbnail } = options;
            // Check if thumbnail is provided
            if (!thumbnail) {
                forceLog('Error: Thumbnail is required');
                throw new Error('Thumbnail is required for video upload');
            }
            forceLog('Upload options:', {
                metadata,
                chunkSize,
                hasThumbnail: !!thumbnail
            });
            // Generate UUID for this upload
            const uploadId = this.generateUUID();
            const totalChunks = Math.ceil(file.size / chunkSize);
            forceLog(`Generated uploadId: ${uploadId}, total chunks: ${totalChunks}`);
            // Make sure channelId is included in metadata
            const uploadMetadata = {
                ...metadata,
                channelId: this.config.channelId,
            };
            forceLog('Upload metadata:', uploadMetadata);
            // Upload file in chunks
            for (let chunkIndex = 0; chunkIndex < totalChunks; chunkIndex++) {
                const start = chunkIndex * chunkSize;
                const end = Math.min(start + chunkSize, file.size);
                const chunk = file.slice(start, end);
                const formData = new FormData();
                formData.append('chunk', chunk);
                formData.append('uploadId', uploadId);
                formData.append('chunkIndex', chunkIndex.toString());
                formData.append('totalChunks', totalChunks.toString());
                formData.append('fileName', file.name);
                formData.append('fileSize', file.size.toString());
                // Add metadata to the first chunk
                if (chunkIndex === 0 && uploadMetadata) {
                    formData.append('channelId', uploadMetadata.channelId.toString());
                    if (uploadMetadata.title)
                        formData.append('title', uploadMetadata.title);
                    if (uploadMetadata.description)
                        formData.append('description', uploadMetadata.description);
                    if (uploadMetadata.tags) {
                        // Handle tags that could be either string or array
                        const tagsValue = Array.isArray(uploadMetadata.tags)
                            ? uploadMetadata.tags.join(',')
                            : uploadMetadata.tags;
                        if (tagsValue && tagsValue.length > 0) {
                            formData.append('tags', tagsValue);
                        }
                    }
                }
                // Send the chunk
                forceLog(`Uploading chunk ${chunkIndex + 1}/${totalChunks} (${start}-${end} bytes)`);
                const response = await fetch(`https://api1.videonest.co/sdk/upload-chunk`, {
                    method: 'POST',
                    body: formData,
                    headers: {
                        'Authorization': `Bearer ${this.config.apiKey}`,
                        'X-Channel-ID': this.config.channelId.toString()
                    },
                });
                forceLog(`Chunk ${chunkIndex + 1} response status: ${response.status}`);
                const result = await response.json();
                forceLog(`Chunk ${chunkIndex + 1} upload result:`, result);
                if (!result.success) {
                    forceLog(`Chunk ${chunkIndex + 1} upload failed: ${result.message}`);
                    throw new Error(result.message || 'Chunk upload failed');
                }
                // Update progress
                const progress = ((chunkIndex + 1) / totalChunks) * 100;
                forceLog(`Upload progress: ${progress.toFixed(2)}%`);
                onProgress(progress);
            }
            // Finalize the upload
            forceLog('All chunks uploaded. Finalizing upload...');
            const finalData = {
                fileName: file.name,
                uploadId: uploadId,
                totalChunks: totalChunks.toString()
            };
            forceLog('Finalize request data:', finalData);
            const finalizeResponse = await fetch(`https://api1.videonest.co/sdk/finalize`, {
                method: 'POST',
                body: JSON.stringify(finalData),
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${this.config.apiKey}`,
                    'X-Channel-ID': this.config.channelId.toString()
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
            return finalizeResult;
        }
        catch (error) {
            forceLog(`Upload error: ${error instanceof Error ? error.message : 'Unknown error'}`, error);
            return {
                success: false,
                message: error instanceof Error ? error.message : 'An unexpected error occurred during upload'
            };
        }
    }
    async uploadThumbnail(thumbnailFile, videoId) {
        const formData = new FormData();
        formData.append('thumbnail', thumbnailFile);
        try {
            const response = await fetch(`https://api1.videonest.co/sdk/videos/${videoId}/send-thumbnail`, {
                method: 'POST',
                body: formData,
                headers: {
                    'Authorization': `Bearer ${this.config.apiKey}`,
                    'X-Channel-ID': this.config.channelId.toString()
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
    generateUUID() {
        return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
            const r = Math.random() * 16 | 0;
            const v = c === 'x' ? r : (r & 0x3 | 0x8);
            return v.toString(16);
        });
    }
    async getVideoStatus(videoId) {
        try {
            const response = await fetch(`https://api1.videonest.co/sdk/videos/${videoId}/status`, {
                method: 'GET',
                headers: {
                    'Authorization': `Bearer ${this.config.apiKey}`,
                    'X-Channel-ID': this.config.channelId.toString()
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
        log('Fetching videos for channel ID:', this.config.channelId);
        try {
            const response = await fetch(`https://api1.videonest.co/sdk/videos`, {
                method: 'GET',
                headers: {
                    'Authorization': `Bearer ${this.config.apiKey}`,
                    'X-Channel-ID': this.config.channelId.toString()
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
    if (width)
        params.push(`width=${width}`);
    if (height)
        params.push(`height=${height}`);
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
    return (React.createElement("div", { style: {
            position: 'relative',
            width: style.width || '100%',
            height: 0,
            paddingBottom: '56.25%',
        } },
        React.createElement("iframe", { src: embedUrl, style: {
                position: 'absolute',
                top: 0,
                left: 0,
                width: '100%',
                height: '100%',
            }, frameBorder: "0", allow: "accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture", allowFullScreen: true, title: `Videonest video ${videoId}` })));
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

export { VideonestEmbed, getVideoStatus, isDebugModeEnabled, listVideos, setDebugMode, uploadVideo };
//# sourceMappingURL=index.esm.js.map
