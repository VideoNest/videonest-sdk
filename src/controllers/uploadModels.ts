export interface UploadRequest {
  fileName: string;
  fileSize: number;
  contentType: string;
  metadata: {
    channelId: number;
    [key: string]: any;
  };
}

export interface PresignedUrlResult {
  fileName: string;
  success: boolean;
  error?: string;
  uploadId?: string;
  s3Key?: string;
  presignedUrls?: string[];
}

export interface VideoUploadCompleteRequest {
  uploadId: string;
  s3Key: string;
  parts: Array<{
    ETag: string;
    PartNumber: number;
  }>;
}

export interface VideoUploadCompleteResponse {
  success: boolean;
  statusCode: number;
  message: string;
  data?: {
    videoId: string;
    sessionId: string;
    hostedUrl: string;
  };
}
