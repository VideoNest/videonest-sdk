import { VideonestConfig, UploadOptions, UploadResult, AuthResponse, VideoStatus } from '../types';
export default class VideonestClient {
    private config;
    private authenticated;
    private channelId;
    constructor(config: VideonestConfig);
    authenticate(): Promise<AuthResponse>;
    uploadVideo(file: File, options: UploadOptions): Promise<UploadResult>;
    private checkAuthentication;
    private uploadThumbnail;
    private generateUUID;
    getVideoStatus(videoId: number): Promise<VideoStatus>;
    listVideos(): Promise<{
        success: boolean;
        videos?: any[];
        message?: string;
    }>;
}
