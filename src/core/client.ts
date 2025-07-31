import { VideonestConfig, VideoMetadata, UploadOptions, UploadResult, VideoStatus } from '../types';
import { log, forceLog } from '../utils/debug';
import { generateUUID } from '../utils/helpers';
import { UploadOptimizationManager } from '../utils/uploadOptimizationManager';

export default class VideonestClient {
  private config: VideonestConfig;

  constructor(config: VideonestConfig) {
    this.config = config;
    log('VideonestClient initialized with channelId:', config.channelId);
  }
  
  async uploadVideo(file: File, options: UploadOptions): Promise<UploadResult> {
    const sessionId = generateUUID();
    const startTime = Date.now();
    
    forceLog('Starting optimized video upload process');
    forceLog(`File: ${file.name}, size: ${file.size} bytes`);
    
    try {
      const { 
        metadata, 
        onProgress = () => {}, 
        thumbnail
      } = options;
      
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
      
      // Get estimated chunk count before starting
      const uploadManager = new UploadOptimizationManager(
        file, 
        uploadMetadata, 
        this.config
      );
      const estimatedChunks = uploadManager.getTotalChunks();
      
      // Track upload start with estimated chunk count
      await this.trackVideoUpload('start', {
        sessionId,
        userId: 'SDK',
        filename: file.name,
        fileSize: file.size,
        chunksCount: estimatedChunks,
        startTime,
        status: 'in_progress'
      });
      
      // Upload chunks with optimization
      const { uploadId, totalChunks } = await uploadManager.upload(onProgress);
      
      forceLog(`All chunks uploaded. Finalizing upload... (uploadId: ${uploadId}, totalChunks: ${totalChunks})`);
      
      // Update session with actual chunk count if different
      if (totalChunks !== estimatedChunks) {
        await this.trackVideoUpload('chunks_complete', {
          sessionId,
          userId: 'SDK',
          chunksCount: totalChunks,
          status: 'chunks_completed'
        });
      }
      
      // Finalize using v2 route with metadata in request body
      const finalData = { 
        fileName: file.name, 
        uploadId: uploadId,
        totalChunks: totalChunks.toString(),
        // Include metadata in finalization request (like frontend v2)
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
        videoId: finalizeResult.video?.id || 0,
        filename: file.name,
        fileSize: file.size,
        chunksCount: totalChunks,
        startTime,
        status: 'completed',
        uploadId: uploadId
      });
      
      return finalizeResult;
    } catch (error) {
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
        status: 'failed',
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      
      return { 
        success: false, 
        message: error instanceof Error ? error.message : 'An unexpected error occurred during upload' 
      };
    }
  }

  private async trackVideoUpload(action: string, sessionData: any) {
    log("Tracking video upload:", action, sessionData);
    
    try {
      let endpoint = '';
      let method = 'POST';
      let requestBody: any;
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
      } else if (action === 'complete' || action === 'failed') {
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
            requestBody.avg_speed_mbps = parseFloat((speedBps / 1_000_000).toFixed(2)); // Convert to Mbps
          }
        }
      }
  
      const url = `${baseUrl}${endpoint}`;
      log("Upload session request:", { action, url, method, body: requestBody });
  
      const headers: Record<string, string> = {
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
    } catch (error) {
      log('Error tracking upload session:', error instanceof Error ? error.message : String(error));
      return { success: false, error: error instanceof Error ? error.message : 'Failed to track upload session' };
    }
  }


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