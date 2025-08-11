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
  private async uploadVideoDirectToS3(
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

        return new Promise<{ PartNumber: number; ETag: string }>((resolve, reject) => {
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
            } else {
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

    } catch (error) {
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
  async uploadVideo(file: File, options: UploadOptions): Promise<UploadResult> {
    forceLog('Starting direct S3 video upload process');
    forceLog(`File: ${file.name}, size: ${file.size} bytes`);

    try {
      const {
        metadata,
        onProgress = (_progress: number, _status: 'uploading' | 'finalizing' | 'failed' | 'stalled') => { },
        thumbnail
      } = options;

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

      const uploadResult = await this.uploadVideoDirectToS3(
        file,
        presignedData.presignedUrls,
        presignedData.uploadId,
        presignedData.s3Key,
        presignedData.chunkSize,
        (progress) => {
          forceLog(`Upload progress: ${progress.toFixed(1)}%`);
          onProgress(progress, 'uploading');
        }
      );

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

    } catch (error) {
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
    } catch (error) {
      log(`Videos list error: ${error instanceof Error ? error.message : 'Unknown error'}`, error);
      return {
        success: false,
        message: error instanceof Error ? error.message : 'Failed to retrieve videos'
      };
    }
  }
}