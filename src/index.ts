import { log, forceLog, setDebugMode, isDebugModeEnabled } from './utils/debug';
import VideonestClient from './core/client';
import { VideonestConfig } from './types';
import VideonestEmbed from './components/VideonestEmbed';
import VideonestPreview from './components/VideonestPreview';

export * from './types';
export { setDebugMode, isDebugModeEnabled } from './utils/debug';

export { VideonestEmbed }; // Export the component
export { VideonestPreview }; // Export the component
/**
 * Upload a video to VideoNest
 * @param file The video file to upload
 * @param options Upload options including metadata
 * @param config VideoNest configuration with channelId and apiKey
 */
// Minor
export async function uploadVideo(file: File, options: any, config: VideonestConfig) {
  const client = new VideonestClient(config);
  return client.uploadVideo(file, options);
}

/**
 * Get the status of a video
 * @param videoId The ID of the video to check status
 * @param config VideoNest configuration with channelId and apiKey
 */
export async function getVideoStatus(videoId: number, config: VideonestConfig) {
  const client = new VideonestClient(config);
  return client.getVideoStatus(videoId);
}

/**
 * List all videos for the channel
 * @param config VideoNest configuration with channelId and apiKey
 */
export async function listVideos(config: VideonestConfig) {
  const client = new VideonestClient(config);
  return client.listVideos();
}

