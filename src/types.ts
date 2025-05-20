// Core types for the Videonest SDK

export interface VideonestConfig {
    channelId: number;
    apiKey: string;
  }
  
  export interface VideoMetadata {
    title: string;
    description?: string;
    tags?: string[] | string;
    channelId?: number;
  }
  
  export interface UploadOptions {
    chunkSize?: number; // Size in bytes, default to 2MB
    onProgress?: (progress: number) => void;
    metadata: VideoMetadata;
    thumbnail?: File;
    autoGenerateThumbnail?: boolean;
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