import VideonestClient from './core/client';
import { AuthResponse } from './types';
export * from './types';
export declare function authVideonest(channelId: string, apiKey: string): Promise<AuthResponse>;
export declare function getClient(): VideonestClient;
export declare function uploadVideo(file: File, options: any): Promise<import("./types").UploadResult>;
export declare function getVideoStatus(videoId: number): Promise<import("./types").VideoStatus>;
export { VideonestClient };
