'use strict';

Object.defineProperty(exports, '__esModule', { value: true });

// Conditionally import fluent-ffmpeg for Node environments
let ffmpeg;
if (typeof window === 'undefined') {
    // This will only execute in Node.js environments
    ffmpeg = require('fluent-ffmpeg');
}
class VideonestClient {
    constructor(config) {
        this.authenticated = false;
        this.config = config;
    }
    async authenticate() {
        try {
            const response = await fetch('https://api1.videonest.co/auth/verify-api-key', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    channelId: this.config.channelId,
                    apiKey: this.config.apiKey
                }),
            });
            const data = await response.json();
            if (!data.success) {
                this.authenticated = false;
                return {
                    success: false,
                    message: data.message || 'Authentication failed'
                };
            }
            this.authenticated = true;
            return {
                success: true,
                message: 'Authentication successful'
            };
        }
        catch (error) {
            this.authenticated = false;
            return {
                success: false,
                message: error instanceof Error ? error.message : 'Authentication failed'
            };
        }
    }
    async uploadVideo(file, options) {
        this.checkAuthentication();
        try {
            const { metadata, chunkSize = 2 * 1024 * 1024, onProgress = () => { }, thumbnail, autoGenerateThumbnail = false } = options;
            // Generate UUID for this upload
            const uploadId = this.generateUUID();
            const totalChunks = Math.ceil(file.size / chunkSize);
            // Make sure channelId is included in metadata
            const uploadMetadata = {
                ...metadata,
                channelId: metadata.channelId || this.config.channelId,
            };
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
                const response = await fetch('https://api1.videonest.co/upload/videos/upload-chunk', {
                    method: 'POST',
                    body: formData,
                    headers: {
                        'Authorization': `Bearer ${this.config.apiKey}`,
                    },
                });
                const result = await response.json();
                if (!result.success) {
                    throw new Error(result.message || 'Chunk upload failed');
                }
                // Update progress
                const progress = ((chunkIndex + 1) / totalChunks) * 100;
                onProgress(progress);
            }
            // Finalize the upload
            const finalData = {
                fileName: file.name,
                uploadId: uploadId,
                totalChunks: totalChunks.toString()
            };
            const finalizeResponse = await fetch('https://api1.videonest.co/videos/finalize', {
                method: 'POST',
                body: JSON.stringify(finalData),
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${this.config.apiKey}`,
                },
            });
            const finalizeResult = await finalizeResponse.json();
            if (!finalizeResult.success) {
                throw new Error(finalizeResult.message || 'Upload finalization failed');
            }
            // Handle thumbnail
            if (thumbnail) {
                // User provided a thumbnail, upload it directly
                await this.uploadThumbnail(uploadMetadata.channelId, thumbnail, finalizeResult.video.id);
            }
            else if (autoGenerateThumbnail) {
                // User wants an auto-generated thumbnail
                try {
                    const generatedThumbnail = await this.createThumbnailFromVideo(file);
                    await this.uploadThumbnail(uploadMetadata.channelId, generatedThumbnail, finalizeResult.video.id);
                }
                catch (thumbnailError) {
                    console.warn('Failed to generate thumbnail:', thumbnailError);
                    // Continue without thumbnail rather than failing the whole upload
                }
            }
            return finalizeResult;
        }
        catch (error) {
            return {
                success: false,
                message: error instanceof Error ? error.message : 'An unexpected error occurred during upload'
            };
        }
    }
    checkAuthentication() {
        if (!this.authenticated) {
            throw new Error('Not authenticated. Call authenticate() first.');
        }
    }
    async uploadThumbnail(channelId, thumbnailFile, videoId) {
        this.checkAuthentication();
        const formData = new FormData();
        formData.append('thumbnail', thumbnailFile);
        try {
            const response = await fetch(`https://api1.videonest.co/download/videos/${videoId}/send-thumbnail`, {
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
    async createThumbnailFromVideo(videoFile) {
        // Check if we're in a browser environment
        if (typeof window !== 'undefined' && typeof document !== 'undefined') {
            // Browser method using video and canvas
            return this.createThumbnailInBrowser(videoFile);
        }
        else {
            // Node.js method using fluent-ffmpeg
            return this.createThumbnailInNode(videoFile);
        }
    }
    async createThumbnailInBrowser(videoFile) {
        return new Promise((resolve, reject) => {
            // Create video element
            const video = document.createElement('video');
            video.preload = 'metadata';
            video.muted = true;
            video.playsInline = true;
            // Create object URL from the video file
            const videoUrl = URL.createObjectURL(videoFile);
            video.src = videoUrl;
            // Set up event handlers
            video.onloadedmetadata = () => {
                // Seek to the 2 second mark (or video duration if less than 2 seconds)
                video.currentTime = Math.min(2, video.duration);
            };
            video.onseeked = () => {
                try {
                    // Create canvas with video dimensions
                    const canvas = document.createElement('canvas');
                    const ctx = canvas.getContext('2d');
                    if (!ctx) {
                        reject(new Error('Failed to get canvas context'));
                        return;
                    }
                    // Set canvas dimensions to match video
                    canvas.width = video.videoWidth;
                    canvas.height = video.videoHeight;
                    // Draw the current frame to the canvas
                    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
                    // Convert canvas to blob
                    canvas.toBlob((blob) => {
                        if (!blob) {
                            reject(new Error('Failed to create thumbnail blob'));
                            return;
                        }
                        // Clean up
                        URL.revokeObjectURL(videoUrl);
                        // Create a File from the Blob
                        const thumbnailFile = new File([blob], `${videoFile.name.split('.')[0]}_thumbnail.jpg`, { type: 'image/jpeg' });
                        resolve(thumbnailFile);
                    }, 'image/jpeg', 0.95);
                }
                catch (error) {
                    reject(error);
                }
            };
            video.onerror = () => {
                URL.revokeObjectURL(videoUrl);
                reject(new Error('Error loading video for thumbnail generation'));
            };
            // Start loading
            video.load();
        });
    }
    async createThumbnailInNode(videoFile) {
        return new Promise((resolve, reject) => {
            if (!ffmpeg) {
                reject(new Error('fluent-ffmpeg is required for Node.js thumbnail generation. Install it with: npm install fluent-ffmpeg'));
                return;
            }
            // Create a temporary file path
            const os = require('os');
            const path = require('path');
            const fs = require('fs');
            const tempDir = os.tmpdir();
            const inputPath = path.join(tempDir, videoFile.name);
            const outputPath = path.join(tempDir, `${path.parse(videoFile.name).name}_thumbnail.jpg`);
            // Write the file to disk
            fs.writeFileSync(inputPath, Buffer.from(videoFile));
            // Use ffmpeg to extract the frame at 2 seconds
            ffmpeg(inputPath)
                .screenshots({
                timestamps: [2],
                filename: path.basename(outputPath),
                folder: path.dirname(outputPath),
                size: '?x?' // Keep original dimensions
            })
                .on('end', () => {
                try {
                    // Read the thumbnail file
                    const thumbnailBuffer = fs.readFileSync(outputPath);
                    // Create a File object from the buffer
                    const thumbnailFile = new File([thumbnailBuffer], path.basename(outputPath), { type: 'image/jpeg' });
                    // Clean up temp files
                    fs.unlinkSync(inputPath);
                    fs.unlinkSync(outputPath);
                    resolve(thumbnailFile);
                }
                catch (error) {
                    reject(error);
                }
            })
                .on('error', (err) => {
                // Clean up temp file
                if (fs.existsSync(inputPath)) {
                    fs.unlinkSync(inputPath);
                }
                reject(err);
            });
        });
    }
    async getVideoStatus(videoId) {
        this.checkAuthentication();
        try {
            const response = await fetch(`https://api1.videonest.co/videos/${videoId}/status`, {
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
}

// Main entry point for the Videonest SDK
// Global client instance
let clientInstance = null;
async function authVideonest(channelId, apiKey) {
    clientInstance = new VideonestClient({
        channelId,
        apiKey
    });
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

exports.VideonestClient = VideonestClient;
exports.authVideonest = authVideonest;
exports.getClient = getClient;
exports.getVideoStatus = getVideoStatus;
exports.uploadVideo = uploadVideo;
//# sourceMappingURL=index.js.map
