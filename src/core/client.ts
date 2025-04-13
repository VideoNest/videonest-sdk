import { VideonestConfig, VideoMetadata, UploadOptions, UploadResult, AuthResponse, VideoStatus } from '../types';
import { log, forceLog } from '../utils/debug';

export default class VideonestClient {
  private config: VideonestConfig;
  private authenticated: boolean = false;
  private channelId: number = 0;

  constructor(config: VideonestConfig) {
    this.config = config;
  }

  async authenticate(): Promise<AuthResponse> {
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
    } catch (error) {
      log(`Authentication error: ${error instanceof Error ? error.message : 'Unknown error'}`, error);
      this.authenticated = false;
      return {
        success: false,
        message: error instanceof Error ? error.message : 'Authentication failed'
      };
    }
  }
  
  async uploadVideo(file: File, options: UploadOptions): Promise<UploadResult> {
    forceLog('Starting video upload process');
    forceLog(`File: ${file.name}, size: ${file.size} bytes`);
    this.checkAuthentication();
    
    try {
      const { 
        metadata, 
        chunkSize = 2 * 1024 * 1024, 
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
          if (uploadMetadata.title) formData.append('title', uploadMetadata.title);
          if (uploadMetadata.description) formData.append('description', uploadMetadata.description);
          
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
    } catch (error) {
      forceLog(`Upload error: ${error instanceof Error ? error.message : 'Unknown error'}`, error);
      return { 
        success: false, 
        message: error instanceof Error ? error.message : 'An unexpected error occurred during upload' 
      };
    }
  }

  private checkAuthentication(): void {
    forceLog(`Authentication check. Current status: ${this.authenticated ? 'authenticated' : 'not authenticated'}`);
    if (!this.authenticated) {
      forceLog('Authentication check failed. Throwing error.');
      throw new Error('Not authenticated. Call authenticate() first.');
    }
    forceLog('Authentication check passed');
  }
  
  
  private async uploadThumbnail(thumbnailFile: File, videoId: string): Promise<any> {
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
    } catch (error) {
      throw new Error(error instanceof Error ? error.message : 'Failed to upload thumbnail');
    }
  }
  
 
  private generateUUID(): string {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
      const r = Math.random() * 16 | 0;
      const v = c === 'x' ? r : (r & 0x3 | 0x8);
      return v.toString(16);
    });
  }

 async getVideoStatus(videoId: number): Promise<VideoStatus> {
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
    } catch (error) {
      throw new Error(error instanceof Error ? error.message : 'Failed to get video status');
    }
  }
}