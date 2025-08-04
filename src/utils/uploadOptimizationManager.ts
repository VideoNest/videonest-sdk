// uploadOptimizationManager.ts - SDK v2 Upgrade
import { generateUUID } from './helpers'
import { VideonestConfig, VideoMetadata } from '../types'

export function calculateOptimalChunkSize(fileSize: number): number {
  let baseChunkSize: number;
  if (fileSize < 50 * 1024 * 1024) baseChunkSize = 8 * 1024 * 1024;        // < 50MB: 8MB
  else if (fileSize < 500 * 1024 * 1024) baseChunkSize = 25 * 1024 * 1024; // < 500MB: 25MB
  else if (fileSize < 2 * 1024 * 1024 * 1024) baseChunkSize = 50 * 1024 * 1024; // < 2GB: 50MB
  else baseChunkSize = 100 * 1024 * 1024; // 100MB
  return Math.floor(baseChunkSize);
}

export class ConnectionSpeedDetector {
  private samples: number[] = [];
  public avgSpeed: number | null = null;
  
  recordChunkUpload(chunkSize: number, uploadTime: number): number {
    const speedMbps = (chunkSize * 8) / (uploadTime / 1000) / 1_000_000;
    this.samples.push(speedMbps);
    if (this.samples.length > 5) this.samples.shift();
    this.avgSpeed = this.calculateWeightedAverage(this.samples);
    return this.avgSpeed;
  }
  
  private calculateWeightedAverage(samples: number[]): number {
    if (samples.length === 0) return 0;
    let weightedSum = 0;
    let totalWeight = 0;
    samples.forEach((speed, index) => {
      const weight = index + 1;
      weightedSum += speed * weight;
      totalWeight += weight;
    });
    return weightedSum / totalWeight;
  }
}

export class UploadOptimizationManager {
  private file: File;
  private metadata: VideoMetadata;
  private config: VideonestConfig;
  private static readonly CONCURRENCY = 6;
  
  private uploadQueue: Array<{index: number; uploadId: string; retries: number; maxRetries: number}> = [];
  private activeUploads = new Map();
  private completedChunks = new Set<number>();
  private failedChunks = new Set<number>();
  private speedDetector = new ConnectionSpeedDetector();
  private chunkSize: number;
  private totalChunks: number;
  private uploadId: string = '';
  private chunkBytesUploaded = new Map<number, number>();
  private totalBytesUploaded = 0;
  private startTime: number = 0;
  private lastProgressReport: number = 0;
  
  constructor(file: File, metadata: VideoMetadata, config: VideonestConfig) {
    this.file = file;
    this.metadata = metadata;
    this.config = config;
    this.chunkSize = calculateOptimalChunkSize(file.size);
    this.totalChunks = Math.ceil(file.size / this.chunkSize);
    console.log(`🚀 SDK Upload manager initialized: ${this.totalChunks} chunks, ${UploadOptimizationManager.CONCURRENCY} concurrency, ${(this.chunkSize / 1024 / 1024).toFixed(1)}MB chunk size`);
  }
  
  async upload(onProgress: (progress: number, status: 'uploading' | 'finalizing' | 'failed') => void): Promise<{ uploadId: string; totalChunks: number }> {
    const uploadId = generateUUID();
    this.uploadId = uploadId;
    this.startTime = Date.now();
    onProgress(0, 'uploading');
    
    for (let i = 0; i < this.totalChunks; i++) this.chunkBytesUploaded.set(i, 0);
    for (let i = 0; i < this.totalChunks; i++) this.uploadQueue.push({index: i, uploadId, retries: 0, maxRetries: 3});
    
    const workerPromises = [];
    for (let i = 0; i < UploadOptimizationManager.CONCURRENCY; i++) workerPromises.push(this.uploadWorker(onProgress));
    
    await Promise.all(workerPromises);
    
    if (this.failedChunks.size > 0) {
      onProgress(0, 'failed');
      throw new Error(`Failed to upload ${this.failedChunks.size} chunks after retries`);
    }
    
    console.log(`✅ SDK Upload completed in ${((Date.now() - this.startTime) / 1000).toFixed(1)}s`);
    return { uploadId, totalChunks: this.totalChunks };
  }
  
  private async uploadWorker(onProgress: (progress: number, status: 'uploading' | 'finalizing' | 'failed') => void): Promise<void> {
    while (this.uploadQueue.length > 0 || this.activeUploads.size > 0) {
      if (this.uploadQueue.length > 0 && this.activeUploads.size < UploadOptimizationManager.CONCURRENCY) {
        const chunkInfo = this.uploadQueue.shift();
        if (chunkInfo) {
          try {
            await this.uploadChunk(chunkInfo, onProgress);
          } catch (error) {
            this.handleChunkError(chunkInfo, error as Error);
          }
        }
      } else {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }
  }
  
  private async uploadChunk(chunkInfo: any, onProgress: (progress: number, status: 'uploading' | 'finalizing' | 'failed') => void): Promise<any> {
    const { index, uploadId } = chunkInfo;
    const start = index * this.chunkSize;
    const end = Math.min(start + this.chunkSize, this.file.size);
    const chunk = this.file.slice(start, end);
    const chunkSize = chunk.size;
    
    if (chunkSize === 0) throw new Error(`Empty chunk detected for index ${index}`);
    
    this.activeUploads.set(index, { ...chunkInfo, startTime: Date.now() });
    
    const formData = new FormData();
    formData.append('chunk', chunk);
    formData.append('uploadId', uploadId);
    formData.append('chunkIndex', index.toString());
    formData.append('totalChunks', this.totalChunks.toString());
    
    const startTime = Date.now();
    const baseUrl = this.config.baseUrl || 'https://api1.videonest.co';
    
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.timeout = 120000;
      
      xhr.upload.onprogress = (event) => {
        if (event.lengthComputable) {
          this.chunkBytesUploaded.set(index, event.loaded);
          this.totalBytesUploaded = Array.from(this.chunkBytesUploaded.values()).reduce((sum, bytes) => sum + bytes, 0);
          const now = Date.now();
          if (now - this.lastProgressReport > 100) {
            const progressPercentage = (this.totalBytesUploaded / this.file.size) * 100;
            onProgress(progressPercentage, 'uploading');
            this.lastProgressReport = now;
          }
        }
      };
      
      xhr.open('POST', `${baseUrl}/sdk/${this.config.channelId}/upload-chunk-v2`);
      xhr.setRequestHeader('Authorization', `Bearer ${this.config.apiKey}`);
      
      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          try {
            const result = JSON.parse(xhr.responseText);
            if (!result.success) {
              reject(new Error(result.message || 'Chunk upload failed'));
            } else {
              const uploadTime = Date.now() - startTime;
              this.speedDetector.recordChunkUpload(chunkSize, uploadTime);
              this.activeUploads.delete(index);
              this.completedChunks.add(index);
              this.chunkBytesUploaded.set(index, chunkSize);
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
      setTimeout(() => {
        this.uploadQueue.unshift(chunkInfo);
      }, Math.pow(2, chunkInfo.retries) * 1000);
    } else {
      this.failedChunks.add(chunkInfo.index);
      this.activeUploads.delete(chunkInfo.index);
    }
  }
  
  getUploadStats() {
    return {
      totalChunks: this.totalChunks,
      completedChunks: this.completedChunks.size,
      failedChunks: this.failedChunks.size,
      activeUploads: this.activeUploads.size,
      concurrency: UploadOptimizationManager.CONCURRENCY,
      avgSpeed: this.speedDetector.avgSpeed,
      progress: (this.totalBytesUploaded / this.file.size) * 100
    };
  }
}