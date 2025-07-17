// Core types for the Videonest SDK

export interface VideonestConfig {
    channelId: number;
    apiKey: string;
    baseUrl?: string;
  }
  
  export interface VideoMetadata {
    title: string;
    channelId: number;
    description?: string;
    tags?: string[] | string;
  }
  
  export interface UploadOptions {
    chunkSize?: number; // Size in bytes, default to 2MB
    onProgress?: (progress: number) => void;
    metadata: VideoMetadata;
    thumbnail: File; // Required: thumbnail must be provided by user
  }
  
  export interface VideoStatus {
    success: boolean;
    message: string;
    status: string;
    videoId: number;
  }
  
  export interface UploadResult {
    success: boolean;
    message?: string;
    video?: {
      id: string;
    };
  }