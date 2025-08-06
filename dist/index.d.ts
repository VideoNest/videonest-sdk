import { VideonestConfig } from './types';
import VideonestEmbed from './components/VideonestEmbed';
import VideonestPreview from './components/VideonestPreview';
export * from './types';
export { setDebugMode, isDebugModeEnabled } from './utils/debug';
export { VideonestEmbed };
export { VideonestPreview };
/**
 * Upload a video to VideoNest
 * @param file The video file to upload
 * @param options Upload options including metadata
 * @param config VideoNest configuration with channelId and apiKey
 */
export declare function uploadVideo(file: File, options: any, config: VideonestConfig): Promise<import("./types").UploadResult>;
/**
 * Get the status of a video
 * @param videoId The ID of the video to check status
 * @param config VideoNest configuration with channelId and apiKey
 */
export declare function getVideoStatus(videoId: number, config: VideonestConfig): Promise<import("./types").VideoStatus>;
/**
 * List all videos for the channel
 * @param config VideoNest configuration with channelId and apiKey
 */
export declare function listVideos(config: VideonestConfig): Promise<{
    success: boolean;
    videos?: any[];
    message?: string;
}>;
