import { Controller } from 'tsoa';
import { UploadRequest, PresignedUrlResult, VideoUploadCompleteRequest, VideoUploadCompleteResponse } from "./uploadModels";
import { Video } from "../generated/nestjs-dto-new/video.entity";
export declare class SDKController extends Controller {
    authenticate(body: {
        channelId: number;
        apiKey: string;
    }): Promise<any>;
    generateSDKPresignedUrl(channelId: number, request: UploadRequest): Promise<PresignedUrlResult>;
    completeSDKVideoUpload(channelId: number, request: VideoUploadCompleteRequest): Promise<VideoUploadCompleteResponse>;
    updateSDKThumbnail(channelId: number, videoId: string, thumbnailFile: {
        buffer: Buffer;
        originalname: string;
        mimetype: string;
    }): Promise<{
        success: boolean;
        video?: Video;
        message?: string;
    }>;
}
