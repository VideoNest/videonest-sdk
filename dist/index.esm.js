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
        this.authenticated = false;
        this.channelId = 0;
        this.config = config;
    }
    async authenticate() {
        forceLog('Authenticating with Videonest API...');
        forceLog('Configuration:', { channelId: this.config.channelId, apiKeyProvided: !!this.config.apiKey });
        try {
            forceLog('Making authentication request to https://api1.videonest.co/sdk/authenticate');
            forceLog('Authentication request data:', { channelId: this.config.channelId, apiKey: this.config.apiKey });
            const response = await fetch('https://api1.videonest.co/sdk/authenticate', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    channelId: this.config.channelId,
                    apiKey: this.config.apiKey
                }),
            });
            forceLog(`Authentication response status: ${response.status}`);
            const data = await response.json();
            forceLog('Authentication response data:', data);
            if (!data.success) {
                forceLog(`Authentication failed: ${data.message || 'Unknown error'}`);
                this.authenticated = false;
                return {
                    success: false,
                    message: data.message || 'Authentication failed'
                };
            }
            forceLog('Authentication successful');
            this.authenticated = true;
            this.channelId = this.config.channelId;
            return {
                success: true,
                message: 'Authentication successful'
            };
        }
        catch (error) {
            log(`Authentication error: ${error instanceof Error ? error.message : 'Unknown error'}`, error);
            this.authenticated = false;
            return {
                success: false,
                message: error instanceof Error ? error.message : 'Authentication failed'
            };
        }
    }
    async uploadVideo(file, options) {
        forceLog('Starting video upload process');
        forceLog(`File: ${file.name}, size: ${file.size} bytes`);
        this.checkAuthentication();
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
                channelId: metadata.channelId || this.config.channelId,
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
                // Lets log ever
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
                const response = await fetch(`https://api1.videonest.co/sdk/${this.channelId.toString()}/upload-chunk`, {
                    method: 'POST',
                    body: formData,
                    headers: {
                        'Authorization': `Bearer ${this.config.apiKey}`,
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
            const finalizeResponse = await fetch(`https://api1.videonest.co/sdk/${this.channelId.toString()}/finalize`, {
                method: 'POST',
                body: JSON.stringify(finalData),
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${this.config.apiKey}`,
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
    checkAuthentication() {
        forceLog(`Authentication check. Current status: ${this.authenticated ? 'authenticated' : 'not authenticated'}`);
        if (!this.authenticated) {
            forceLog('Authentication check failed. Throwing error.');
            throw new Error('Not authenticated. Call authenticate() first.');
        }
        forceLog('Authentication check passed');
    }
    async uploadThumbnail(thumbnailFile, videoId) {
        this.checkAuthentication();
        const formData = new FormData();
        formData.append('thumbnail', thumbnailFile);
        try {
            const response = await fetch(`https://api1.videonest.co/sdk/${this.channelId.toString()}/videos/${videoId}/send-thumbnail`, {
                method: 'POST',
                body: formData,
                headers: {
                    'Authorization': `Bearer ${this.config.apiKey}`,
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
        this.checkAuthentication();
        try {
            const response = await fetch(`https://api1.videonest.co/sdk/${this.channelId.toString()}/videos/${videoId}/status`, {
                method: 'GET',
                headers: {
                    'Authorization': `Bearer ${this.config.apiKey}`,
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
        this.checkAuthentication();
        log('Fetching videos for channel ID:', this.channelId);
        try {
            const response = await fetch(`https://api1.videonest.co/sdk/${this.channelId.toString()}/videos`, {
                method: 'GET',
                headers: {
                    'Authorization': `Bearer ${this.config.apiKey}`,
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

const VideonestEmbed = ({ videoId, style = {} }) => {
    // Default styles
    const defaultWidth = '100%';
    // Use state to track initialization
    const [sdkInitialized, setSdkInitialized] = React.useState(false);
    const { primaryColor, secondaryColor, darkMode, showVideoDetails, width } = style;
    // Check SDK initialization in an effect hook
    React.useEffect(() => {
        try {
            getClient();
            setSdkInitialized(true);
        }
        catch (e) {
            setSdkInitialized(false);
        }
    }, []); // Empty dependency array means this runs once on mount
    // Build URL with style parameters if provided
    let embedUrl = `https://app.videonest.co/embed/single/${videoId}`;
    const params = [];
    if (primaryColor)
        params.push(`primary_color=${primaryColor.replace('#', '')}`);
    if (secondaryColor)
        params.push(`secondary_color=${secondaryColor.replace('#', '')}`);
    if (darkMode)
        params.push('dark_mode=true');
    if (showVideoDetails)
        params.push('show_video_details=true');
    if (width)
        params.push(`width=${width}`);
    // Add search params to URL if any were set
    if (params.length > 0) {
        embedUrl += `?${params.join('&')}`;
    }
    // Render loading or error state when SDK is not initialized
    if (!sdkInitialized) {
        return React.createElement('div', null, 'Please initialize Videonest SDK first using authVideonest()');
    }
    // Use React.createElement for the iframe for maximum compatibility
    return React.createElement('iframe', {
        src: embedUrl,
        width: style.width || defaultWidth,
        frameBorder: '0',
        allow: 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture',
        allowFullScreen: true,
        title: `Videonest video ${videoId}`
    });
};

// Global client instance
let clientInstance = null;
async function authVideonest(channelId, apiKey) {
    clientInstance = new VideonestClient({
        channelId,
        apiKey
    });
    forceLog('AUTHENTICATE FORCE LOG METHOD CALLED DIRECTLY', clientInstance);
    return await clientInstance.authenticate();
}
function getClient() {
    if (!clientInstance) {
        throw new Error('SDK not initialized. Call authVideonest() first.');
    }
    return clientInstance;
}
async function uploadVideo(file, options) {
    return getClient().uploadVideo(file, options);
}
async function getVideoStatus(videoId) {
    return getClient().getVideoStatus(videoId);
}
async function listVideos() {
    return getClient().listVideos();
}

export { VideonestEmbed, authVideonest, getClient, getVideoStatus, isDebugModeEnabled, listVideos, setDebugMode, uploadVideo };
//# sourceMappingURL=index.esm.js.map
