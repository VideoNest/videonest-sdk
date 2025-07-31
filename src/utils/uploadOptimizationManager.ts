// uploadOptimizationManager.ts - SDK v2 Upgrade
import { generateUUID } from './helpers'
import { VideonestConfig, VideoMetadata } from '../types'

export function calculateOptimalChunkSize(fileSize: number, connectionSpeed: number | null = null, totalConcurrentUploads: number = 1): number {
  let baseChunkSize: number;
  
  // AGGRESSIVE base sizes for single SDK uploads (larger than frontend)
  if (fileSize < 50 * 1024 * 1024) {        // < 50MB
    baseChunkSize = 8 * 1024 * 1024;        // 8MB (vs 2MB frontend)
  } else if (fileSize < 500 * 1024 * 1024) { // < 500MB  
    baseChunkSize = 25 * 1024 * 1024;       // 25MB (vs 5MB frontend)
  } else if (fileSize < 2 * 1024 * 1024 * 1024) { // < 2GB
    baseChunkSize = 50 * 1024 * 1024;       // 50MB (vs 10MB frontend)
  } else {
    baseChunkSize = 100 * 1024 * 1024;      // 100MB (vs 20MB frontend)
  }
  
  // SDK is always single video, so no reduction needed like frontend
  // But still respect connection speed
  if (connectionSpeed) {
    if (connectionSpeed > 50) {             // > 50 Mbps - blazing fast
      baseChunkSize = Math.min(baseChunkSize * 2, 200 * 1024 * 1024); // Up to 200MB!
    } else if (connectionSpeed > 25) {      // > 25 Mbps - fast connection  
      baseChunkSize = Math.min(baseChunkSize * 1.5, 100 * 1024 * 1024);
    } else if (connectionSpeed > 10) {      // > 10 Mbps - decent connection
      // Keep base size
    } else if (connectionSpeed < 5) {       // < 5 Mbps - slow connection  
      baseChunkSize = Math.max(baseChunkSize * 0.5, 1024 * 1024); // Min 1MB
    }
  }
  
  return Math.floor(baseChunkSize);
}

// Enhanced connection speed detector from frontend v2
export class ConnectionSpeedDetector {
  private samples: number[] = [];
  public avgSpeed: number | null = null;
  private globalThroughput: number = 0;
  
  recordChunkUpload(chunkSize: number, uploadTime: number): number {
    const speedMbps = (chunkSize * 8) / (uploadTime / 1000) / 1_000_000;
    
    this.samples.push(speedMbps);
    if (this.samples.length > 5) { // Keep more samples for stability
      this.samples.shift();
    }
    
    // Calculate weighted average (more weight to recent samples)
    this.avgSpeed = this.calculateWeightedAverage(this.samples);
    this.globalThroughput = this.samples.reduce((a, b) => a + b, 0);
    
    return this.avgSpeed;
  }
  
  private calculateWeightedAverage(samples: number[]): number {
    if (samples.length === 0) return 0;
    
    let weightedSum = 0;
    let totalWeight = 0;
    
    samples.forEach((speed, index) => {
      const weight = index + 1; // More recent samples get higher weight
      weightedSum += speed * weight;
      totalWeight += weight;
    });
    
    return weightedSum / totalWeight;
  }
  
  shouldReduceConcurrency(): boolean {
    return this.avgSpeed !== null && (this.avgSpeed < 5 || this.globalThroughput < 10);
  }
  
  shouldIncreaseConcurrency(): boolean {
    return this.avgSpeed !== null && this.avgSpeed > 20 && this.globalThroughput > 50 && this.samples.length >= 3;
  }
}

export class UploadOptimizationManager {
  private file: File;
  private metadata: VideoMetadata;
  private config: VideonestConfig;
  private currentConcurrency: number;
  private maxConcurrency: number;
  
  private uploadQueue: Array<{
    index: number;
    uploadId: string;
    retries: number;
    maxRetries: number;
    priority: number;
  }> = [];
  
  private activeUploads = new Map();
  private completedChunks = new Set<number>();
  private failedChunks = new Set<number>();
  private speedDetector = new ConnectionSpeedDetector();
  
  private chunkSize: number;
  private totalChunks: number;
  private uploadId: string = '';
  
  // Enhanced progress tracking
  private chunkBytesUploaded = new Map<number, number>();
  private totalBytesUploaded = 0;
  private startTime: number = 0;
  private lastProgressReport: number = 0;
  private stalledChunks = new Set<number>();
  private stallMonitor?: NodeJS.Timeout;
  
  constructor(file: File, metadata: VideoMetadata, config: VideonestConfig) {
    this.file = file;
    this.metadata = metadata;
    this.config = config;
    
    // More aggressive for single SDK uploads
    this.maxConcurrency = 10; // Higher than frontend's max of 6
    this.currentConcurrency = 4; // Start higher than frontend's 2
    
    // Calculate chunk size with SDK-optimized settings
    this.chunkSize = calculateOptimalChunkSize(file.size, null, 1);
    this.totalChunks = Math.ceil(file.size / this.chunkSize);
    
    console.log(`🚀 SDK Upload manager initialized: ${this.totalChunks} chunks, ${this.maxConcurrency} max concurrency, ${(this.chunkSize / 1024 / 1024).toFixed(1)}MB chunk size`);
  }
  
  async upload(onProgress: (progress: number) => void): Promise<{ uploadId: string; totalChunks: number }> {
    const uploadId = generateUUID();
    this.uploadId = uploadId;
    this.startTime = Date.now();
    
    // Initialize bytes tracking for each chunk
    for (let i = 0; i < this.totalChunks; i++) {
      this.chunkBytesUploaded.set(i, 0);
    }
    
    // Create upload queue with priority (first and last chunks prioritized)
    for (let i = 0; i < this.totalChunks; i++) {
      this.uploadQueue.push({
        index: i,
        uploadId,
        retries: 0,
        maxRetries: 3,
        priority: this.calculateChunkPriority(i)
      });
    }
    
    // Sort queue by priority
    this.uploadQueue.sort((a, b) => b.priority - a.priority);
    
    // Start workers
    const workerPromises = [];
    for (let i = 0; i < this.currentConcurrency; i++) {
      workerPromises.push(this.uploadWorker(onProgress));
    }
    
    // Monitor for stalled uploads
    this.stallMonitor = setInterval(() => this.checkForStalledUploads(), 10000);
    
    await Promise.all(workerPromises);
    
    if (this.stallMonitor) {
      clearInterval(this.stallMonitor);
    }
    
    if (this.failedChunks.size > 0) {
      throw new Error(`Failed to upload ${this.failedChunks.size} chunks after retries`);
    }
    
    console.log(`✅ SDK Upload completed in ${((Date.now() - this.startTime) / 1000).toFixed(1)}s`);
    return { uploadId, totalChunks: this.totalChunks };
  }
  
  private calculateChunkPriority(index: number): number {
    // First chunk gets highest priority (contains metadata)
    if (index === 0) return 100;
    // Last chunk gets high priority (allows early finalization check)
    if (index === this.totalChunks - 1) return 90;
    // Middle chunks get normal priority
    return 50;
  }
  
  private async uploadWorker(onProgress: (progress: number) => void): Promise<void> {
    while (this.uploadQueue.length > 0 || this.activeUploads.size > 0) {
      // Check if we should process more uploads
      if (this.uploadQueue.length > 0 && this.activeUploads.size < this.currentConcurrency) {
        const chunkInfo = this.uploadQueue.shift();
        if (chunkInfo) {
          try {
            await this.uploadChunk(chunkInfo, onProgress);
          } catch (error) {
            this.handleChunkError(chunkInfo, error as Error);
          }
        }
      } else {
        // Wait for active uploads to complete
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }
  }
  
  private async uploadChunk(chunkInfo: any, onProgress: (progress: number) => void): Promise<any> {
    const { index, uploadId } = chunkInfo;
    
    const start = index * this.chunkSize;
    const end = Math.min(start + this.chunkSize, this.file.size);
    const chunk = this.file.slice(start, end);
    const chunkSize = chunk.size;
    
    if (chunkSize === 0) {
      throw new Error(`Empty chunk detected for index ${index}`);
    }
    
    this.activeUploads.set(index, { ...chunkInfo, startTime: Date.now() });
    
    const formData = new FormData();
    formData.append('chunk', chunk);
    formData.append('uploadId', uploadId);
    formData.append('chunkIndex', index.toString());
    formData.append('totalChunks', this.totalChunks.toString());
    formData.append('fileName', this.file.name);
    formData.append('fileSize', this.file.size.toString());
    formData.append('totalConcurrentVideos', '1'); // Always 1 for SDK
    
    // Add metadata to first chunk
    if (index === 0) {
      formData.append('channelId', this.metadata.channelId.toString());
      if (this.metadata.title) formData.append('title', this.metadata.title);
      if (this.metadata.description) formData.append('description', this.metadata.description);
      
      if (this.metadata.tags) {
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
    
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      
      // Increased timeout for larger chunks
      xhr.timeout = 120000; // 2 minutes
      
      xhr.upload.onprogress = (event) => {
        if (event.lengthComputable) {
          this.chunkBytesUploaded.set(index, event.loaded);
          this.totalBytesUploaded = Array.from(this.chunkBytesUploaded.values())
            .reduce((sum, bytes) => sum + bytes, 0);
          
          // Throttle progress updates
          const now = Date.now();
          if (now - this.lastProgressReport > 100) {
            const progressPercentage = (this.totalBytesUploaded / this.file.size) * 100;
            onProgress(progressPercentage);
            this.lastProgressReport = now;
          }
        }
      };
      
      // Use v2 route like frontend
      xhr.open('POST', `${baseUrl}/upload/videos/upload-chunk-v2`);
      xhr.setRequestHeader('Authorization', `Bearer ${this.config.apiKey}`);
      
      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          try {
            const result = JSON.parse(xhr.responseText);
            if (!result.success) {
              reject(new Error(result.message || 'Chunk upload failed'));
            } else {
              const uploadTime = Date.now() - startTime;
              const currentSpeed = this.speedDetector.recordChunkUpload(chunkSize, uploadTime);
              
              this.activeUploads.delete(index);
              this.completedChunks.add(index);
              this.chunkBytesUploaded.set(index, chunkSize);
              
              // Dynamic concurrency adjustment
              if (this.completedChunks.size % 3 === 0) {
                this.adjustConcurrency(currentSpeed);
              }
              
              resolve(result);
            }
          } catch (e) {
            reject(new Error('Invalid response from server'));
          }
        } else {
          reject(new Error(`HTTP error: ${xhr.status}`));
        }
      };
      
      xhr.onerror = () => reject(new Error('Network error during upload'));
      xhr.ontimeout = () => reject(new Error('Upload timeout - chunk may be too large'));
      
      xhr.send(formData);
    });
  }
  
  private handleChunkError(chunkInfo: any, error: Error): void {
    console.error(`Chunk ${chunkInfo.index} upload failed:`, error.message);
    
    if (chunkInfo.retries < chunkInfo.maxRetries) {
      chunkInfo.retries++;
      // Add delay before retry with exponential backoff
      setTimeout(() => {
        this.uploadQueue.unshift(chunkInfo); // Add to front for priority
      }, Math.pow(2, chunkInfo.retries) * 1000);
    } else {
      this.failedChunks.add(chunkInfo.index);
      this.activeUploads.delete(chunkInfo.index);
    }
  }
  
  private adjustConcurrency(currentSpeed: number): void {
    const oldConcurrency = this.currentConcurrency;
    
    // More aggressive adjustments for single file SDK uploads
    if (this.speedDetector.shouldReduceConcurrency()) {
      this.currentConcurrency = Math.max(1, this.currentConcurrency - 1);
      console.log(`🐌 SDK: Reducing concurrency to ${this.currentConcurrency} (${currentSpeed.toFixed(1)} Mbps)`);
    } else if (this.speedDetector.shouldIncreaseConcurrency() && this.currentConcurrency < this.maxConcurrency) {
      // More aggressive increases for SDK
      if (currentSpeed > 50) {
        this.currentConcurrency = Math.min(this.currentConcurrency + 2, this.maxConcurrency);
        console.log(`🚀 SDK: Boosting concurrency to ${this.currentConcurrency} (${currentSpeed.toFixed(1)} Mbps)`);
      } else if (currentSpeed > 25) {
        this.currentConcurrency = Math.min(this.currentConcurrency + 1, this.maxConcurrency);
        console.log(`⚡ SDK: Increasing concurrency to ${this.currentConcurrency} (${currentSpeed.toFixed(1)} Mbps)`);
      }
    }
    
    // Start additional workers if concurrency increased
    if (this.currentConcurrency > oldConcurrency && this.uploadQueue.length > 0) {
      const additionalWorkers = this.currentConcurrency - oldConcurrency;
      for (let i = 0; i < additionalWorkers; i++) {
        this.uploadWorker(() => {}); // Start worker without progress callback
      }
    }
  }
  
  private checkForStalledUploads(): void {
    const now = Date.now();
    const stallThreshold = 30000; // 30 seconds
    
    for (const [index, uploadInfo] of this.activeUploads.entries()) {
      if (now - uploadInfo.startTime > stallThreshold) {
        console.warn(`⚠️ SDK: Chunk ${index} appears stalled, will retry`);
        this.stalledChunks.add(index);
        
        // Cancel and retry stalled upload
        this.activeUploads.delete(index);
        this.uploadQueue.unshift({
          ...uploadInfo,
          retries: uploadInfo.retries + 1
        });
      }
    }
  }
  
  getUploadStats() {
    return {
      totalChunks: this.totalChunks,
      completedChunks: this.completedChunks.size,
      failedChunks: this.failedChunks.size,
      activeUploads: this.activeUploads.size,
      currentConcurrency: this.currentConcurrency,
      avgSpeed: this.speedDetector.avgSpeed,
      progress: (this.totalBytesUploaded / this.file.size) * 100
    };
  }
}