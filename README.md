# VideoNest SDK

> **IMPORTANT**: This package is intended for enterprise VideoNest clients only and will not be usable without an authorized API key.

Official SDK for uploading, managing, and embedding videos with the VideoNest platform. This SDK provides a seamless interface for integrating VideoNest's video hosting and streaming capabilities into your applications.

## Table of Contents

- [Installation](#installation)
- [Authentication](#authentication)
- [Debug Mode](#debug-mode)
- [SDK Functions](#sdk-functions)
  - [Authentication](#authentication-1)
  - [Upload Video](#upload-video)
  - [Get Video Status](#get-video-status)
  - [List Videos](#list-videos)
- [Video Embedding](#video-embedding)
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

### Authentication

```typescript
async function authVideonest(channelId: number, apiKey: string): Promise<AuthResponse>
```

**Arguments:**
- `channelId` (number): Your VideoNest channel ID
- `apiKey` (string): Your VideoNest API key

**Returns:**
```typescript
AuthResponse {
  success: boolean;
  message: string;
}
```

### Upload Video

```typescript
async function uploadVideo(file: File, options: UploadOptions): Promise<UploadResult>
```
**Arguments:**
- `file` (File): The video file to upload
- `options` (UploadOptions): Upload configuration options
  - `metadata` (VideoMetadata): Video metadata (required)
    - `title` (string): Video title (required)
    - `description` (string): Video description (optional)
    - `tags` (string[] | string): Video tags (optional)
    - `channelId` (number): Override the channel ID (optional)
  - `thumbnail` (File): Thumbnail image file (required)
  - `chunkSize` (number): Size in bytes for upload chunks (optional, default: 2MB)
  - `onProgress` (function): Progress callback (optional)
  - `autoGenerateThumbnail` (boolean): Whether to auto-generate thumbnail (optional)

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

### Get Video Status

```typescript
async function getVideoStatus(videoId: number): Promise<VideoStatus>
```

**Arguments:**
- `videoId` (number): ID of the video to check

**Returns:**
```typescript
VideoStatus {
  success: boolean;
  message: string;
  status: string;
  videoId: number;
}
```
Note possible statuses: "uploading", "reencoding", "completed", "failure"

### List Videos

```typescript
async function listVideos(): Promise<{success: boolean, videos?: any[], message?: string}>
```

**Arguments:**
None - Uses the authenticated channel ID

**Returns:**
```typescript
{
  success: boolean;
  videos?: {
    id: number;
    title: string;
    description: string;
    tags: string;
    published_at: string;
    orientation: string;
    thumbnail: string;
  }[];
  message?: string;
}
```

## Video Embedding

The SDK includes a React component for embedding videos:

```jsx
import { VideonestEmbed } from 'videonest-sdk';

function MyComponent() {
  return (
    <VideonestEmbed
      videoId={123456}
      style={{
        width: '100%',
        height: '500px',
        primaryColor: '#ff5500',
        darkMode: true,
        hideVideoDetails: false
      }}
    />
  );
}
```

**Props:**
- `videoId` (number): The ID of the video to embed (required)
- `style` (object): Styling options (optional)
  - `width` (string | number): Width of the iframe (default: '100%')
  - `height` (string | number): Height of the iframe (default: '400px')
  - `primaryColor` (string): Brand color for player controls
  - `darkMode` (boolean): Enable dark theme
  - `hideVideoDetails` (boolean): Hide video title and other metadata

## Types

The SDK exports the following TypeScript interfaces:

- `VideonestConfig`: Configuration for SDK initialization
- `AuthResponse`: Authentication response
- `VideoMetadata`: Metadata for video uploads
- `UploadOptions`: Options for video uploads
- `UploadResult`: Result of a video upload
- `VideoStatus`: Status of a video

For detailed type definitions, you can import them directly:

```typescript
import { VideoMetadata, UploadOptions } from 'videonest-sdk';
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
