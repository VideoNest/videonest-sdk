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
    chunkSize?: number;
    onProgress?: (progress: number) => void;
    metadata: VideoMetadata;
    thumbnail: File;
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
