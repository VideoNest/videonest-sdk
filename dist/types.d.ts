export interface VideonestConfig {
    channelId: string;
    apiKey: string;
}
export interface AuthResponse {
    success: boolean;
    message: string;
}
export interface VideoMetadata {
    title: string;
    description?: string;
    tags?: string[] | string;
    channelId?: string;
}
export interface UploadOptions {
    chunkSize?: number;
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
