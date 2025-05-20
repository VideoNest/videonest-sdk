import { VideonestConfig, UploadOptions, UploadResult, VideoStatus } from '../types';
export default class VideonestClient {
    private config;
    constructor(config: VideonestConfig);
    uploadVideo(file: File, options: UploadOptions): Promise<UploadResult>;
    private uploadThumbnail;
    private generateUUID;
    getVideoStatus(videoId: number): Promise<VideoStatus>;
    listVideos(): Promise<{
        success: boolean;
        videos?: any[];
        message?: string;
    }>;
}
