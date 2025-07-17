import { VideonestConfig, VideoMetadata } from '../types';
export declare function calculateOptimalChunkSize(fileSize: number, connectionSpeed?: number | null): number;
export declare class ConnectionSpeedDetector {
    private samples;
    avgSpeed: number | null;
    recordChunkUpload(chunkSize: number, uploadTime: number): number;
    shouldAdjustConcurrency(): boolean;
}
export declare class UploadOptimizationManager {
    private file;
    private metadata;
    private config;
    private maxConcurrency;
    private maxPossibleConcurrency;
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
    private workerPromises;
    constructor(file: File, metadata: VideoMetadata, config: VideonestConfig);
    upload(onProgress: (progress: number) => void): Promise<{
        uploadId: string;
        totalChunks: number;
    }>;
    private uploadWorker;
    private uploadChunk;
    private adjustConcurrency;
}
