# VideoNest SDK

> **IMPORTANT**: This package is intended for enterprise VideoNest clients only and will not be usable without an authorized API key.

Official SDK for uploading, managing, and embedding videos with the VideoNest platform. This SDK provides a seamless interface for integrating VideoNest's video hosting and streaming capabilities into your applications.

## Table of Contents

- [Installation](#installation)
- [Example Project](#example-project)
- [Authentication](#authentication)
- [Debug Mode](#debug-mode)
- [SDK Functions](#sdk-functions)
  - [Upload Video](#upload-video)
  - [Get Video Status](#get-video-status)
  - [List Videos](#list-videos)
- [Video Embedding](#video-embedding)
  - [Styling Recommendations](#styling-recommendations)
- [Webhooks](#webhooks)
- [Types](#types)

## Installation

Install the VideoNest SDK using npm:

```bash
npm install videonest-sdk
```

Or using yarn:

```bash
yarn add videonest-sdk
```

## Example Project

A complete example implementation of the VideoNest SDK is available at:

[https://github.com/VideoNest/videonest-sdk](https://github.com/VideoNest/videonest-sdk)

This repository demonstrates how to properly integrate and use all features of the VideoNest SDK in a real-world application, including authentication, video uploads, embedding, and webhook processing.

## Authentication

The VideoNest SDK uses header-based authentication where your credentials (channel ID and API key) are automatically attached as request headers for all API calls.

```javascript
import { uploadVideo, getVideoStatus, listVideos } from 'videonest-sdk';

// Provide credentials with each API call
const config = {
  channelId: 12345, // Number type
  apiKey: 'your-api-key'
};

// Pass credentials to each API call
uploadVideo(fileObject, options, config);
getVideoStatus(videoId, config);
listVideos(config);
```

**Authentication Headers:**
Behind the scenes, the SDK automatically adds the following headers to all API requests:
- `Authorization`: Bearer token with your API key
- Channel ID is included in the API endpoint URLs

## Debug Mode

The SDK includes a configurable debug mode that controls logging output:

```javascript
import { setDebugMode, isDebugModeEnabled } from 'videonest-sdk';

// Enable debug mode (disabled by default)
setDebugMode(true);

// Check if debug mode is enabled
const debugEnabled = isDebugModeEnabled();
console.log('Debug mode enabled:', debugEnabled);

// Disable debug mode when needed
setDebugMode(false);
```

## SDK Functions

### Upload Video

```typescript
async function uploadVideo(file: File, options: UploadOptions, config: VideonestConfig): Promise<UploadResult>
```
**Arguments:**
- `file` (File): The video file to upload
- `options` (UploadOptions): Upload configuration options
  - `metadata` (VideoMetadata): Video metadata (required)
    - `title` (string): Video title (required)
    - `description` (string): Video description (optional)
    - `tags` (string[] | string): Video tags (optional)
    - `channelId` (number): Your VideoNest channel ID (required)
  - `thumbnail` (File): Thumbnail image file (required)
  - `onProgress` (function): Progress callback (optional)
- `config` (VideonestConfig): Your VideoNest credentials
  - `channelId` (number): Your VideoNest channel ID
  - `apiKey` (string): Your VideoNest API key
  - `baseUrl` (string): API base URL (optional)

**Returns:**
```typescript
UploadResult {
  success: boolean;
  message?: string;
  video?: {
    id: string;
  };
}
```

**Upload Features:**

The VideoNest SDK provides reliable chunked uploading with the following features:

- **Chunked Upload**: Files are automatically split into manageable chunks for reliable transfer
- **Progress Tracking**: Real-time progress reporting via the onProgress callback
- **Error Handling**: Automatic error detection and reporting
- **Direct S3 Upload**: Files are uploaded directly to S3 using presigned URLs for optimal performance

**Progress Callback:**

```typescript
onProgress?: (progress: number, status: 'uploading' | 'finalizing' | 'failed' | 'stalled') => void;
```

  The callback provides:
  - `progress`: A number from 0 to 100 indicating upload completion percentage
  - `status`: Current upload state
    - `'uploading'`: Actively uploading chunks (progress from 0% to 99%)
    - `'finalizing'`: Chunks uploaded, server processing (progress=100%)
    - `'failed'`: Upload encountered an error (progress=0)
    - `'stalled'`: Upload has stalled and may need to be retried

  Example usage:
  ```javascript
  uploadVideo(videoFile, {
    metadata: { title: 'My Video', channelId: 12345 },
    thumbnail: thumbnailFile,
    onProgress: (progress, status) => {
      console.log(`Upload ${status}: ${Math.round(progress)}%`);
      
      // Update UI based on status
      if (status === 'uploading') {
        progressBar.setValue(progress);
        statusText.setText('Uploading...');
      } else if (status === 'finalizing') {
        statusText.setText('Processing video...');
      } else if (status === 'failed') {
        statusText.setText('Upload failed');
      }
    }
  });
  ```

### Get Video Status

```typescript
async function getVideoStatus(videoId: number, config: VideonestConfig): Promise<VideoStatus>
```

**Arguments:**
- `videoId` (number): ID of the video to check
- `config` (VideonestConfig): Your VideoNest credentials
  - `channelId` (number): Your VideoNest channel ID
  - `apiKey` (string): Your VideoNest API key
  - `baseUrl` (string): API base URL (optional)

**Returns:**
```typescript
{
  success: boolean;
  status: string; // 'uploading', 'reencoding', 'failed', 'completed', or 'unknown'
  video: {
    id: number;
    title: string;
    description: string;
    tags: string[];
    thumbnail: string;
    published_at: string;
  }
}
```

**Status Values:**
- `uploading`: The video is still being uploaded
- `reencoding`: The video has been uploaded and is being processed/encoded
- `failed`: The encoding process failed
- `completed`: The video is fully processed and ready to view
- `unknown`: The system could not determine the status

### List Videos

```typescript
async function listVideos(config: VideonestConfig): Promise<{success: boolean, videos?: Video[], message?: string, totalUploaded?: number, failed?: number, reencoding?: number}>
```

**Arguments:**
- `config` (VideonestConfig): Your VideoNest credentials
  - `channelId` (number): Your VideoNest channel ID
  - `apiKey` (string): Your VideoNest API key
  - `baseUrl` (string): API base URL (optional)

**Returns:**
```typescript
{
  success: boolean;
  videos?: [
    {
      id: number;
      title: string;
      description: string;
      tags: string[];
      thumbnail: string;
      duration: number;
      published_at: string; // ISO format string
      orientation: string;
      status: string; // 'uploading', 'reencoding', 'completed', 'failed', or 'unknown'
      hosted_files: [
        {
          id: number;
          hosted_url: string;
          file_size: number;
          file_type: string;
          width: number;
          height: number;
        }
      ]
    }
  ];
  // Summary statistics
  totalUploaded: number; // Count of completed videos
  failed: number;        // Count of failed videos
  reencoding: number;    // Count of videos currently being processed
  message?: string;      // Error message if success is false
}
```

## Video Embedding

The SDK includes React components for embedding videos:

### VideonestEmbed - Full Video Player

```jsx
import { VideonestEmbed } from 'videonest-sdk';

function MyComponent() {
  // Your VideoNest credentials (required)
  const config = {
    channelId: 12345,
    apiKey: 'your-api-key'
  };

  return (
    <VideonestEmbed
      videoId={123456}
      config={config}
      style={{
        width: '100%',
        height: '400px', // Explicitly set height for proper rendering
        primaryColor: '#ff5500',
        secondaryColor: '#00aaff',
        darkMode: true,
        showTitle: true,
        showDescription: true
      }}
    />
  );
}
```

### VideonestPreview - Preview Player

```jsx
import { VideonestPreview } from 'videonest-sdk';

function MyComponent() {
  // Your VideoNest credentials (required)
  const config = {
    channelId: 12345,
    apiKey: 'your-api-key'
  };

  return (
    <VideonestPreview
      videoId={123456}
      config={config}
      style={{
        width: '100%',
        height: '400px',
        primaryColor: '#ff5500',
        secondaryColor: '#00aaff',
        darkMode: true,
        showTitle: true,
        showDescription: true
      }}
    />
  );
}
```

**Props (Both Components):**
- `videoId` (number): The ID of the video to embed (required)
- `config` (VideonestConfig): Your VideoNest credentials (required)
  - `channelId` (number): Your VideoNest channel ID
  - `apiKey` (string): Your VideoNest API key
- `style` (object): Styling options (optional)
  - `width` (string | number): Width of the embed container (default: '100%')
  - `height` (string | number): Height of the embed container (optional, overrides default 16:9 ratio)
  - `primaryColor` (string): Primary brand color for player controls (hex code, with or without '#')
  - `secondaryColor` (string): Secondary brand color for player elements (hex code, with or without '#')
  - `darkMode` (boolean): Enable dark theme for the player
  - `showTitle` (boolean): Show video title
  - `showDescription` (boolean): Show video description

**Component Differences:**
- `VideonestEmbed`: Full video player with complete playback controls
- `VideonestPreview`: Preview player, typically used for video previews or thumbnails

### Styling Recommendations

#### Responsive Design & Aspect Ratio

**Important aspect ratio behavior:**
- The `VideonestEmbed` component container has no set aspect ratio and will display at the size of the container its placed in. The player will maintain its own internal aspect ratio internally, using black bars to fill any extra space.


#### Description Text

For optimal user experience with descriptions:

1. Keep descriptions concise (1-2 lines recommended)
2. For longer descriptions, consider limiting to 2-3 sentences
3. Use the video title for the most important information

## Types

The SDK exports the following TypeScript interfaces:

```typescript
// Configuration for VideoNest credentials
interface VideonestConfig {
  channelId: number;
  apiKey: string;
  baseUrl?: string;
}

// Metadata for video uploads
interface VideoMetadata {
  title: string;
  channelId: number;
  description?: string;
  tags?: string[] | string;
}

// Options for video uploads
interface UploadOptions {
  chunkSize?: number;
  onProgress?: (progress: number, status: 'uploading' | 'finalizing' | 'failed' | 'stalled') => void;
  metadata: VideoMetadata;
  thumbnail: File; // Required
}

// Result of a video upload
interface UploadResult {
  success: boolean;
  message?: string;
  video?: {
    id: string;
  };
}

// Status of a video
interface VideoStatus {
  success: boolean;
  message: string;
  status: string;
  videoId: number;
}
```

For detailed type definitions, you can import them directly:

```typescript
import { VideoMetadata, UploadOptions, VideonestConfig } from 'videonest-sdk';
```

## Webhooks

VideoNest provides webhook notifications for video processing events. You can configure webhook URLs directly in your VideoNest admin dashboard to receive POST requests when your videos complete processing.

### Webhook Payload

When a video's processing status changes, VideoNest will send a POST request to your configured webhook URL with the following JSON payload:

```json
{
  "id": 12345,    // Integer video ID
  "status": "success"  // Either "success" or "failure"
}
```

### Implementing a Webhook Receiver

You'll need to set up an endpoint on your server to receive these webhook notifications. Here's a simple example using Express.js:

```javascript
const express = require('express');
const app = express();

app.use(express.json());

app.post('/videonest-webhook', (req, res) => {
  const { id, status } = req.body;
  
  console.log(`Video ${id} processing ${status === 'success' ? 'completed successfully' : 'failed'}`);
  
  // Update your application's state based on the video status
  // ...
  
  // Acknowledge receipt of the webhook
  res.status(200).send('Webhook received');
});

app.listen(3000, () => {
  console.log('Webhook receiver listening on port 3000');
});
```
