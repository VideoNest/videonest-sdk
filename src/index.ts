// Main entry point for the Videonest SDK
import VideonestClient from './core/client';
import { AuthResponse } from './types';

export * from './types';

// Global client instance
let clientInstance: VideonestClient | null = null;


export async function authVideonest(
  channelId: string, 
  apiKey: string
): Promise<AuthResponse> {
  clientInstance = new VideonestClient({
    channelId,
    apiKey
  });
  
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

export { VideonestClient };