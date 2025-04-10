import { VideonestConfig, UploadOptions, UploadResult, AuthResponse, VideoStatus } from '../types';
export default class VideonestClient {
    private config;
    private authenticated;
    constructor(config: VideonestConfig);
    authenticate(): Promise<AuthResponse>;
    uploadVideo(file: File, options: UploadOptions): Promise<UploadResult>;
    private checkAuthentication;
    private uploadThumbnail;
    private generateUUID;
    private createThumbnailFromVideo;
    private createThumbnailInBrowser;
    private createThumbnailInNode;
    getVideoStatus(videoId: number): Promise<VideoStatus>;
}
