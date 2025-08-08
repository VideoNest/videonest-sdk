import { VideonestConfig, UploadOptions, UploadResult, VideoStatus } from '../types';
export default class VideonestClient {
    private config;
    constructor(config: VideonestConfig);
    /**
     * Upload video directly to S3 using presigned URLs
     */
    private uploadVideoDirectToS3;
    /**
     * Main video upload method
     */
    uploadVideo(file: File, options: UploadOptions): Promise<UploadResult>;
    /**
     * Upload thumbnail to the video
     */
    private uploadThumbnail;
    /**
     * Get video status
     */
    getVideoStatus(videoId: number): Promise<VideoStatus>;
    /**
     * List all videos in the channel
     */
    listVideos(): Promise<{
        success: boolean;
        videos?: any[];
        message?: string;
    }>;
}
