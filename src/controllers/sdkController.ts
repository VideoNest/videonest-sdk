import { Controller, Get, Route, Query, Post, Path, Body, SuccessResponse, Response, UploadedFile, FormField, Tags } from 'tsoa';
import { s3Client } from "../config/s3Config";
import { PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { 
  UploadRequest,
  PresignedUrlResult,
  VideoUploadCompleteRequest,
  VideoUploadCompleteResponse
} from "./uploadModels";
import { 
  generatePresignedUrlsForFile,
  completeS3MultipartUpload,
  handleVideoUploadComplete
} from "./helpers";
import { Video } from "../generated/nestjs-dto-new/video.entity";
import { prisma } from "../config/prisma";
import * as fs from "fs";
import { promisify } from "util";
import { exec } from "child_process";

const execAsync = promisify(exec);

@Route('sdk')
export class SDKController extends Controller {
  @Post("/authenticate")
  @Response(404, "Channel not found")
  @Response(401, "Invalid API key")
  public async authenticate(@Body() body: { channelId: number, apiKey: string }): Promise<any> {
    const channel = await prisma.channel.findUnique({ where: { id: body.channelId } });
    if (!channel) {
      this.setStatus(404);
      return { success: false, message: 'Channel not found' };
    }
    if (channel.authorization_key !== body.apiKey) {
      this.setStatus(401);
      return { success: false, message: 'Invalid API key' };
    }
    return { success: true, message: 'Authentication successful' };
  }

  @Post("/{channelId}/generate-presigned-url")
  @Tags("upload")
  public async generateSDKPresignedUrl(
    @Path() channelId: number,
    @Body() request: UploadRequest
  ): Promise<PresignedUrlResult> {
    try {
      // Validate request data
      if (!request.fileName || !request.fileSize || !request.contentType) {
        return {
          fileName: request.fileName || 'unknown',
          error: 'Missing required fields: fileName, fileSize, or contentType',
          success: false
        };
      }

      if (!request.metadata || !request.metadata.channelId) {
        return {
          fileName: request.fileName,
          error: 'Missing required metadata.channelId',
          success: false
        };
      }

      // Generate presigned URLs using helper function
      const result = await generatePresignedUrlsForFile(
        request.fileName,
        request.fileSize,
        request.contentType,
        request.metadata
      );

      if (!result.success) {
        return {
          fileName: request.fileName,
          error: result.error || 'Failed to generate presigned URLs',
          success: false
        };
      }

      return result;
    } catch (error: any) {
      console.error('Error generating SDK presigned URL:', error);
      return {
        fileName: request.fileName || 'unknown',
        error: error.message || 'Internal server error',
        success: false
      };
    }
  }

  @Post("/{channelId}/complete-upload")
  @Tags("upload")
  public async completeSDKVideoUpload(
    @Path() channelId: number,
    @Body() request: VideoUploadCompleteRequest
  ): Promise<VideoUploadCompleteResponse> {
    try {
      // Validate request data
      if (!request.uploadId || !request.s3Key || !request.parts || request.parts.length === 0) {
        return {
          success: false,
          statusCode: 400,
          message: 'Missing required fields: uploadId, s3Key, or parts'
        };
      }

      // Step 1: Complete S3 multipart upload
      console.log(`🔄 Completing S3 multipart upload for ${request.s3Key}`);
      await completeS3MultipartUpload(request.s3Key, request.uploadId, request.parts);

      // Step 2: Create mock S3 event for business logic
      const mockS3Event = {
        Records: [{
          s3: {
            bucket: { name: 'videonest-storage' },
            object: { key: request.s3Key }
          }
        }]
      };

      // Step 3: Run business logic to create video and update session
      console.log(`🔄 Processing video business logic for ${request.s3Key}`);
      const result = await handleVideoUploadComplete(mockS3Event);
      
      return {
        success: true,
        statusCode: 200,
        message: `Video upload completed successfully`,
        data: {
          videoId: result.videoId,
          sessionId: result.sessionId,
          hostedUrl: `https://atto.videonest.co/${request.s3Key}`
        }
      };

    } catch (error: any) {
      console.error('Error completing SDK video upload:', error);
      return {
        success: false,
        statusCode: 500,
        message: error.message || 'Failed to complete video upload'
      };
    }
  }
  
  @Post("/{channelId}/videos/{videoId}/send-thumbnail")
  @Tags("upload")
  public async updateSDKThumbnail(
    @Path() channelId: number,
    @Path() videoId: string,
    @UploadedFile("thumbnail") thumbnailFile: { buffer: Buffer; originalname: string; mimetype: string }
  ): Promise<{ success: boolean; video?: Video; message?: string }> {
    if (!thumbnailFile) {
      throw new Error("Video and thumbnail files are required");
    }

    const thumbnailFileName = `${videoId}_original_thumbnail.jpg`;
    const resizedThumbnailFileName = `${videoId}_thumbnail_resized_v2.webp`;

    try {
      // Upload original thumbnail to S3
      await s3Client.send(
        new PutObjectCommand({
          Bucket: "videonest-storage",
          Key: `atto/${thumbnailFileName}`,
          Body: thumbnailFile.buffer,
          ContentType: "image/jpeg",
        })
      );

      // Process thumbnail for WebP version

      // Save thumbnail temporarily
      fs.writeFileSync(thumbnailFileName, thumbnailFile.buffer);

      // Convert to WebP and resize
      const convertToWebPCommand = `ffmpeg -y -i "${thumbnailFileName}" "${videoId}_temp.webp"`;
      const resizeCommand = `ffmpeg -y -i "${videoId}_temp.webp" -vf "scale='min(480,iw)':-1" "${resizedThumbnailFileName}"`;

      await execAsync(convertToWebPCommand);
      await execAsync(resizeCommand);

      // Upload resized WebP thumbnail to S3
      const resizedThumbnailStream = fs.createReadStream(resizedThumbnailFileName);
      await s3Client.send(
        new PutObjectCommand({
          Bucket: "videonest-storage",
          Key: `atto/${resizedThumbnailFileName}`,
          Body: resizedThumbnailStream,
        })
      );

      const video = await prisma.video.update({
        where: { id: parseInt(videoId) },
        data: {
          thumbnail: `https://atto.videonest.co/${resizedThumbnailFileName}`,
          original_thumbnail: `https://atto.videonest.co/${thumbnailFileName}`,
          thumbnail_link: `https://atto.videonest.co/${resizedThumbnailFileName}`,
          thumbnail_imported: true,
          updated_at: new Date()
        }
      });

      // Clean up temporary files
      fs.unlinkSync(thumbnailFileName);
      fs.unlinkSync(`${videoId}_temp.webp`);
      fs.unlinkSync(resizedThumbnailFileName);

      return { success: true, message: "Thumbnail uploaded successfully!", video };
    } catch (error) {
      // Clean up temporary files in case of error
      try {
        if (fs.existsSync(thumbnailFileName)) fs.unlinkSync(thumbnailFileName);
        if (fs.existsSync(`${videoId}_temp.webp`)) fs.unlinkSync(`${videoId}_temp.webp`);
        if (fs.existsSync(resizedThumbnailFileName)) fs.unlinkSync(resizedThumbnailFileName);
      } catch (cleanupError) {
        console.error('Error during cleanup:', cleanupError);
      }

      console.error('Error uploading video:', error);
      throw error;
    }
  }
}
