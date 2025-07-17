// uploadOptimizationManager.ts
import { generateUUID } from './helpers'
import { VideonestConfig, VideoMetadata } from '../types'


export function calculateOptimalChunkSize(fileSize: number, connectionSpeed: number | null = null): number {
  let baseChunkSize: number;
  
  // MUCH LARGER base sizes for single file uploads
  if (fileSize < 50 * 1024 * 1024) {        // < 50MB
    baseChunkSize = 5 * 1024 * 1024;        // 5MB
  } else if (fileSize < 500 * 1024 * 1024) { // < 500MB  
    baseChunkSize = 15 * 1024 * 1024;       // 15MB
  } else if (fileSize < 2 * 1024 * 1024 * 1024) { // < 2GB
    baseChunkSize = 35 * 1024 * 1024;       // 35MB
  } else {
    baseChunkSize = 75 * 1024 * 1024;       // 75MB
  }
  
  // AGGRESSIVE speed-based adjustments for single file
  if (connectionSpeed) {
    if (connectionSpeed > 50) {             // > 50 Mbps - blazing fast
      baseChunkSize = Math.min(baseChunkSize * 3, 150 * 1024 * 1024); // Up to 150MB chunks!
    } else if (connectionSpeed > 15) {      // > 15 Mbps - fast connection  
      baseChunkSize = Math.min(baseChunkSize * 2, 100 * 1024 * 1024); // Up to 100MB chunks
    } else if (connectionSpeed > 8) {       // > 8 Mbps - decent connection
      baseChunkSize = Math.min(baseChunkSize * 1.5, 50 * 1024 * 1024);
    } else if (connectionSpeed < 3) {       // < 3 Mbps - slow connection  
      baseChunkSize = Math.max(baseChunkSize * 0.3, 1024 * 1024); // Min 1MB
    }
  }
  
  return Math.floor(baseChunkSize);
}

export class ConnectionSpeedDetector {
  private samples: number[] = [];
  public avgSpeed: number | null = null;
  
  recordChunkUpload(chunkSize: number, uploadTime: number): number {
    const speedMbps = (chunkSize * 8) / (uploadTime / 1000) / 1_000_000;
    this.samples.push(speedMbps);
    
    // Keep only last 3 samples for FASTER reaction
    if (this.samples.length > 3) {
      this.samples.shift();
    }
    
    this.avgSpeed = this.samples.reduce((a, b) => a + b) / this.samples.length;
    return this.avgSpeed;
  }
  
  shouldAdjustConcurrency(): boolean {
    return this.samples.length >= 2; // Adjust after just 2 samples
  }
}

export class UploadOptimizationManager {
  private file: File;
  private metadata: VideoMetadata;
  private config: VideonestConfig;
  private maxConcurrency: number;
  private maxPossibleConcurrency: number = 12; // Aggressive for single file
  
  private uploadQueue: Array<{
    index: number;
    uploadId: string;
    retries: number;
    maxRetries: number;
  }> = [];
  
  private activeUploads = new Map();
  private completedChunks = new Set<number>();
  private failedChunks = new Set<number>();
  private speedDetector = new ConnectionSpeedDetector();
  
  private chunkSize: number;
  private totalChunks: number;
  private uploadId: string = '';
  
  // Track bytes uploaded per chunk
  private chunkBytesUploaded = new Map<number, number>();
  private totalBytesUploaded = 0;
  
  // Track worker promises for dynamic scaling
  private workerPromises: Promise<void>[] = [];
  
  constructor(file: File, metadata: VideoMetadata, config: VideonestConfig) {
    this.file = file;
    this.metadata = metadata;
    this.config = config;
    
    // Start aggressive for single file uploads
    this.maxConcurrency = 6;
    
    // Calculate chunk size ONCE and stick with it
    this.chunkSize = calculateOptimalChunkSize(file.size);
    this.totalChunks = Math.ceil(file.size / this.chunkSize);
  }
  
  async upload(onProgress: (progress: number) => void): Promise<{ uploadId: string; totalChunks: number }> {
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
  
  private async uploadWorker(onProgress: (progress: number) => void): Promise<void> {
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
      } catch (error) {
        console.error(`Chunk ${chunkInfo.index} upload failed:`, error);
        
        if (chunkInfo.retries < chunkInfo.maxRetries) {
          chunkInfo.retries++;
          this.uploadQueue.push(chunkInfo); // Retry
        } else {
          this.failedChunks.add(chunkInfo.index);
        }
      }
    }
  }
  
  private async uploadChunk(chunkInfo: { index: number; uploadId: string; retries: number; maxRetries: number }, onProgress: (progress: number) => void): Promise<any> {
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
      if (this.metadata.title) formData.append('title', this.metadata.title);
      if (this.metadata.description) formData.append('description', this.metadata.description);
      
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
            } else {
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
          } catch (e) {
            reject(new Error('Invalid response from server'));
          }
        } else {
          reject(new Error('HTTP error: ' + xhr.status));
        }
      };
      
      xhr.onerror = () => reject(new Error('Network error during upload'));
      xhr.send(formData);
    });
  }
  
  private adjustConcurrency(currentSpeed: number): void {
    const oldConcurrency = this.maxConcurrency;
    
    // AGGRESSIVE scaling for single-file uploads
    if (currentSpeed > 50 && this.maxConcurrency < this.maxPossibleConcurrency) {
      this.maxConcurrency = Math.min(this.maxConcurrency + 2, this.maxPossibleConcurrency);
      console.log(`🚀 SDK: Boosting concurrency to ${this.maxConcurrency} (${currentSpeed.toFixed(1)} Mbps)`);
    } else if (currentSpeed > 25 && this.maxConcurrency < 10) {
      this.maxConcurrency = Math.min(this.maxConcurrency + 1, 10);
      console.log(`⚡ SDK: Increasing concurrency to ${this.maxConcurrency} (${currentSpeed.toFixed(1)} Mbps)`);
    } else if (currentSpeed > 15 && this.maxConcurrency < 8) {
      this.maxConcurrency = Math.min(this.maxConcurrency + 1, 8);
      console.log(`⚡ SDK: Moderate increase to ${this.maxConcurrency} (${currentSpeed.toFixed(1)} Mbps)`);
    } else if (currentSpeed < 5 && this.maxConcurrency > 2) {
      this.maxConcurrency = Math.max(this.maxConcurrency - 1, 2);
      console.log(`🐌 SDK: Reducing concurrency to ${this.maxConcurrency} (${currentSpeed.toFixed(1)} Mbps)`);
    } else if (currentSpeed < 1 && this.maxConcurrency > 1) {
      this.maxConcurrency = 1;
      console.log(`🚨 SDK: Emergency single thread (${currentSpeed.toFixed(1)} Mbps)`);
    }
    
    // Start additional workers if concurrency increased
    if (this.maxConcurrency > oldConcurrency) {
      const additionalWorkers = this.maxConcurrency - oldConcurrency;
      for (let i = 0; i < additionalWorkers; i++) {
        const workerPromise = this.uploadWorker(() => {}); // Empty progress callback for additional workers
        this.workerPromises.push(workerPromise);
      }
    }
  }
}