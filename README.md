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

The VideoNest SDK uses a simplified authentication approach where your credentials (channel ID and API key) are provided with each API call. There is no need to authenticate separately before using the SDK.

```javascript
import { uploadVideo, getVideoStatus, listVideos } from 'videonest-sdk';

// Your VideoNest credentials
const config = {
  channelId: 12345,
  apiKey: 'your-api-key'
};

// Use the credentials with each API call
uploadVideo(fileObject, options, config);
getVideoStatus(videoId, config);
listVideos(config);
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
  - `thumbnail` (File): Thumbnail image file (required)
  - `chunkSize` (number): Size in bytes for upload chunks (optional, default: 2MB)
  - `onProgress` (function): Progress callback (optional)
  - `autoGenerateThumbnail` (boolean): Whether to auto-generate thumbnail (optional)
- `config` (VideonestConfig): Your VideoNest credentials
  - `channelId` (number): Your VideoNest channel ID
  - `apiKey` (string): Your VideoNest API key

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
async function getVideoStatus(videoId: number, config: VideonestConfig): Promise<VideoStatus>
```

**Arguments:**
- `videoId` (number): ID of the video to check
- `config` (VideonestConfig): Your VideoNest credentials
  - `channelId` (number): Your VideoNest channel ID
  - `apiKey` (string): Your VideoNest API key

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
async function listVideos(config: VideonestConfig): Promise<{success: boolean, videos?: any[], message?: string}>
```

**Arguments:**
- `config` (VideonestConfig): Your VideoNest credentials
  - `channelId` (number): Your VideoNest channel ID
  - `apiKey` (string): Your VideoNest API key

**Returns:**
```typescript
{
  success: boolean;
  videos?: {
    id: number;
    title: string;
    description: string;
    tags: string;
    published_at: Date; // Prisma DateTime, ISO format string
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

**Props:**
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

### Styling Recommendations

#### Responsive Design & Aspect Ratio

**Important aspect ratio behavior:**
- The `VideonestEmbed` component container defaults to a **16:9 aspect ratio**
- The actual video content inside the player maintains its original aspect ratio
- Videos with different aspect ratios (vertical, square, etc.) will display correctly with letterboxing/pillarboxing as needed

You have several options for controlling the size:

1. **Default responsive behavior** (recommended):
   ```jsx
   {/* The component maintains 16:9 aspect ratio at any width */}
   <VideonestEmbed 
     videoId={123456} 
     config={config}
     style={{ width: '100%' }} {/* Width can be any value - the height will adjust automatically */}
   />
   ```

2. **Custom height** (overrides the default 16:9 ratio):
   ```jsx
   <VideonestEmbed 
     videoId={123456} 
     config={config}
     style={{ width: '100%', height: '400px' }} {/* Explicit height overrides aspect ratio */}
   />
   ```

3. **Container width control**:
   ```jsx
   {/* Control maximum width while maintaining aspect ratio */}
   <div style={{ maxWidth: '800px' }}>
     <VideonestEmbed videoId={123456} config={config} />
   </div>
   ```

> **Note:** The component already implements responsive sizing internally. There's no need to wrap it in another aspect ratio container.

#### Mobile Considerations

For mobile devices:

- Consider using higher height values on smaller screens for better visibility
- Test your embed at various screen sizes to ensure optimal viewing experience
- You may need different height values for desktop vs. mobile views:

```jsx
// Example of responsive sizing with media queries
<div className="video-container" style={{
  height: window.innerWidth < 768 ? '300px' : '500px',
  width: '100%'
}}>
  <VideonestEmbed videoId={123456} config={config} />
</div>
```

#### Description Text

For optimal user experience with descriptions:

1. Keep descriptions concise (1-2 lines recommended)
2. For longer descriptions, consider limiting to 2-3 sentences
3. Use the video title for the most important information

## Types

The SDK exports the following TypeScript interfaces:

- `VideonestConfig`: Configuration containing channel ID and API key
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
