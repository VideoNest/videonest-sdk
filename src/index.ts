import { log, forceLog, setDebugMode, isDebugModeEnabled } from './utils/debug';
import VideonestClient from './core/client';
import { AuthResponse } from './types';
import VideonestEmbed from './components/VideonestEmbed';

export * from './types';
export { setDebugMode, isDebugModeEnabled } from './utils/debug';

export { VideonestEmbed }; // Export the component

// Global client instance
let clientInstance: VideonestClient | null = null;


export async function authVideonest(
  channelId: number, 
  apiKey: string
): Promise<AuthResponse> {
  clientInstance = new VideonestClient({
    channelId,
    apiKey
  });
  forceLog('AUTHENTICATE FORCE LOG METHOD CALLED DIRECTLY', clientInstance);
  
  return await clientInstance.authenticate();
}


export function getClient(): VideonestClient {
  if (!clientInstance) {
    throw new Error('SDK not initialized. Call authVideonest() first.');
  }
  
  return clientInstance;
}


export async function uploadVideo(file: File, options: any) {
  return getClient().uploadVideo(file, options);
}

export async function getVideoStatus(videoId: number) {
    return getClient().getVideoStatus(videoId);
  }

