import { VideonestConfig, VideoMetadata } from '../types';
export declare function calculateOptimalChunkSize(fileSize: number): number;
export declare class ConnectionSpeedDetector {
    private samples;
    avgSpeed: number | null;
    recordChunkUpload(chunkSize: number, uploadTime: number): number;
    private calculateWeightedAverage;
}
export declare class UploadOptimizationManager {
    private file;
    private metadata;
    private config;
    private static readonly CONCURRENCY;
    private uploadQueue;
    private activeUploads;
    private completedChunks;
    private failedChunks;
    private speedDetector;
    private chunkSize;
    private totalChunks;
    private uploadId;
    private chunkBytesUploaded;
    private totalBytesUploaded;
    private startTime;
    private lastProgressReport;
    constructor(file: File, metadata: VideoMetadata, config: VideonestConfig);
    upload(onProgress: (progress: number, status: 'uploading' | 'finalizing' | 'failed') => void): Promise<{
        uploadId: string;
        totalChunks: number;
    }>;
    private uploadWorker;
    private uploadChunk;
    private handleChunkError;
    getUploadStats(): {
        totalChunks: number;
        completedChunks: number;
        failedChunks: number;
        activeUploads: number;
        chunkSize: number;
        totalSize: number;
        averageSpeed: number | null;
    };
    getTotalChunks(): number;
}
