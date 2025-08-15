import { VideonestConfig, VideoMetadata, UploadOptions, UploadResult, VideoStatus } from '../types';
import { log, forceLog } from '../utils/debug';
import { generateUUID } from '../utils/helpers';

export default class VideonestClient {
  private config: VideonestConfig;

  constructor(config: VideonestConfig) {
    this.config = config;
    log('VideonestClient initialized with channelId:', config.channelId);
  }

  /**
   * Upload video directly to S3 using presigned URLs
   */
  private async uploadToS3(
    file: File,
    presignedUrls: string[],
    uploadId: string,
    s3Key: string,
    chunkSize: number,
    onProgress: (progress: number) => void
  ): Promise<{ success: boolean; uploadId: string; s3Key: string; parts: any[]; error?: string }> {
    try {
      const totalParts = presignedUrls.length;
      const uploadedParts: any[] = [];

      log(`🚀 Starting S3 upload: ${file.name} (${totalParts} parts)`);

      // Track progress for each chunk
      const chunkProgress = new Array(totalParts).fill(0);

      const updateOverallProgress = () => {
        const totalProgress = chunkProgress.reduce((sum, progress) => sum + progress, 0);
        const overallProgress = totalProgress / totalParts;
        onProgress(overallProgress);
      };

      // Upload chunks with controlled concurrency (max 6 chunks at a time)
      const CONCURRENT_CHUNKS = 6;
      const MAX_RETRIES = 3;
      const activeChunks = new Set();
      const completedParts: any[] = [];

      const uploadChunk = async (index: number, retryCount = 0): Promise<{ PartNumber: number; ETag: string }> => {
        const presignedUrl = presignedUrls[index];
        const start = index * chunkSize;
        const end = Math.min(start + chunkSize, file.size);
        const chunk = file.slice(start, end);

        // Reset progress for this chunk (fixes retry progress calculation)
        chunkProgress[index] = 0;
        updateOverallProgress();

        if (chunk.size === 0) {
          throw new Error(`Empty chunk detected for part ${index + 1}`);
        }

        return new Promise<{ PartNumber: number; ETag: string }>((resolve, reject) => {
          const xhr = new XMLHttpRequest();
          xhr.timeout = 60000; // 1 minute timeout (reduced from 5 minutes)

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
              log(`✅ Chunk ${index + 1}/${totalParts} completed`);

              resolve({
                PartNumber: index + 1,
                ETag: etag.replace(/"/g, '')
              });
            } else {
              reject(new Error(`HTTP ${xhr.status}: Failed to upload part ${index + 1}`));
            }
          };

          xhr.onerror = () => reject(new Error(`Network error uploading part ${index + 1}`));
          xhr.ontimeout = () => reject(new Error(`Timeout uploading part ${index + 1}`));

          xhr.open('PUT', presignedUrl);
          xhr.setRequestHeader('Content-Type', 'application/octet-stream');
          xhr.send(chunk);
        }).catch(async (error) => {
          // Retry logic
          if (retryCount < MAX_RETRIES) {
            log(`⚠️ Chunk ${index + 1} failed, retrying (${retryCount + 1}/${MAX_RETRIES}): ${error.message}`);
            await new Promise(resolve => setTimeout(resolve, Math.pow(2, retryCount) * 1000)); // Exponential backoff
            return uploadChunk(index, retryCount + 1);
          } else {
            log(`❌ Chunk ${index + 1} failed after ${MAX_RETRIES} retries: ${error.message}`);
            throw error;
          }
        });
      };

      // Process chunks with controlled concurrency
      for (let i = 0; i < presignedUrls.length; i++) {
        // Wait if we've hit the concurrency limit
        if (activeChunks.size >= CONCURRENT_CHUNKS) {
          await Promise.race(activeChunks);
        }

        const chunkPromise = uploadChunk(i)
          .then(result => {
            completedParts.push(result);
            return result;
          })
          .finally(() => activeChunks.delete(chunkPromise));

        activeChunks.add(chunkPromise);
      }

      // Wait for remaining chunks to complete
      await Promise.all(activeChunks);

      // Sort parts by part number to ensure correct order
      const sortedParts = completedParts.sort((a, b) => a.PartNumber - b.PartNumber);

      log(`✅ S3 upload completed: ${file.name} (${sortedParts.length} parts)`);

      return {
        success: true,
        uploadId: uploadId,
        s3Key: s3Key,
        parts: sortedParts
      };

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to upload to S3';
      log(`❌ S3 upload failed: ${errorMessage}`);
      return {
        success: false,
        uploadId: uploadId,
        s3Key: s3Key,
        parts: [],
        error: errorMessage
      };
    }
  }

  /**
   * Main video upload method
   */
  async uploadVideo(file: File, options: UploadOptions): Promise<UploadResult> {
    forceLog(`📤 Starting upload: ${file.name} (${(file.size / 1024 / 1024).toFixed(1)}MB)`);

    try {
      const {
        metadata,
        onProgress = (_progress: number, _status: 'uploading' | 'finalizing' | 'failed' | 'stalled') => { },
        thumbnail
      } = options;

      // Check if thumbnail is provided
      if (!thumbnail) {
        onProgress(0, 'failed');
        throw new Error('Thumbnail is required for video upload');
      }

      // Make sure channelId is included in metadata
      const uploadMetadata = { ...metadata, channelId: this.config.channelId };

      // Step 1: Generate presigned URLs using SDK endpoint
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

      onProgress(0, 'uploading');

      const uploadResult = await this.uploadToS3(
        file,
        presignedData.presignedUrls,
        presignedData.uploadId,
        presignedData.s3Key,
        presignedData.chunkSize,
        (progress) => {
          onProgress(progress, 'uploading');
        }
      );

      if (!uploadResult.success) {
        throw new Error(uploadResult.error || 'S3 upload failed');
      }

      onProgress(100, 'finalizing');

      // Step 3: Complete upload using SDK endpoint
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

      // Step 4: Upload thumbnail using SDK endpoint
      await this.uploadThumbnail(thumbnail, completeData.data.videoId);
      forceLog('✅ Upload completed successfully:', completeData.data.videoId);

      return {
        success: true,
        message: 'Video uploaded successfully',
        video: {
          id: completeData.data.videoId,
        }
      };

    } catch (error) {
      forceLog(`❌ Upload failed: ${error instanceof Error ? error.message : 'Unknown error'}`);

      return {
        success: false,
        message: error instanceof Error ? error.message : 'An unexpected error occurred during upload'
      };
    }
  }

  /**
   * Upload thumbnail to the video
   */
  private async uploadThumbnail(thumbnailFile: File, videoId: string): Promise<any> {
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
    } catch (error) {
      throw new Error(error instanceof Error ? error.message : 'Failed to upload thumbnail');
    }
  }

  /**
   * Get video status
   */
  async getVideoStatus(videoId: number): Promise<VideoStatus> {
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
    } catch (error) {
      throw new Error(error instanceof Error ? error.message : 'Failed to get video status');
    }
  }

  /**
   * List all videos in the channel
   */
  async listVideos(): Promise<{ success: boolean, videos?: any[], message?: string }> {
    try {
      const response = await fetch(`https://api1.videonest.co/sdk/${this.config.channelId}/videos`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${this.config.apiKey}`
        },
      });

      const result = await response.json();

      if (!result.success) {
        return {
          success: false,
          message: result.message || 'Failed to retrieve videos'
        };
      }

      return result;
    } catch (error) {
      return {
        success: false,
        message: error instanceof Error ? error.message : 'Failed to retrieve videos'
      };
    }
  }
}