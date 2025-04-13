import React from 'react';
import { getClient } from '../index';

interface VideonestEmbedProps {
  videoId: number;
  style?: {
    width?: string | number;
    height?: string | number;
    primaryColor?: string;
    darkMode?: boolean;
    hideVideoDetails?: boolean;
  };
}

const VideonestEmbed: React.FC<VideonestEmbedProps> = ({ videoId, style = {} }) => {
  // Instead of using useState and useEffect, let's simplify the component
  // and handle SDK initialization in a different way
  
  // Default styles
  const defaultWidth = '100%';
  const defaultHeight = '400px';
  
  // Build URL with style parameters if provided
  let embedUrl = `https://app.videonest.co/newEmbed/single/${videoId}`;
  const searchParams = new URLSearchParams();
  
  if (style.primaryColor) {
    searchParams.append('primaryColor', style.primaryColor.replace('#', ''));
  }
  
  if (style.darkMode) {
    searchParams.append('darkMode', style.darkMode.toString());
  }
  
  if (style.hideVideoDetails) {
    searchParams.append('hideVideoDetails', style.hideVideoDetails.toString());
  }
  
  // Add search params to URL if any were set
  if (searchParams.toString()) {
    embedUrl += `?${searchParams.toString()}`;
  }
  
  // We'll check if SDK is initialized only when needed
  let isSDKInitialized = false;
  try {
    getClient();
    isSDKInitialized = true;
  } catch (error) {
    console.error('Videonest SDK not initialized:', error);
  }
  
  if (!isSDKInitialized) {
    return <div>Please initialize Videonest SDK first using authVideonest()</div>;
  }
  
  return (
    <iframe
      src={embedUrl}
      width={style.width || defaultWidth}
      height={style.height || defaultHeight}
      frameBorder="0"
      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
      allowFullScreen
      title={`Videonest video ${videoId}`}
    />
  );
};

export default VideonestEmbed;