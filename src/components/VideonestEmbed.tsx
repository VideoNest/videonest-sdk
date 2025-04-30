import React from 'react';
import { getClient } from '../index';
import { log, forceLog } from '../utils/debug';


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
  // Default styles
  const defaultWidth = '100%';
  const defaultHeight = '400px';
  log('VideonestEmbed props:', { videoId, style });
  
  // Build URL with style parameters if provided
  let embedUrl = `https://app.videonest.co/newEmbed/single/${videoId}`;
  const params: string[] = [];
  
  if (style.primaryColor) {
    params.push(`primaryColor=${style.primaryColor.replace('#', '')}`);
  }
  
  // Explicitly check for boolean values
  if (style.darkMode === true) {
    params.push('darkMode=true');
  } else if (style.darkMode === false) {
    params.push('darkMode=false');
  }
  
  if (style.hideVideoDetails === true) {
    params.push('hideVideoDetails=true');
  } else if (style.hideVideoDetails === false) {
    params.push('hideVideoDetails=false');
  }
  
  // Add search params to URL if any were set
  if (params.length > 0) {
    embedUrl += `?${params.join('&')}`;
  }
  
  // Check SDK initialization outside of render phase
  let sdkInitialized = true;
  try {
    getClient();
  } catch (e) {
    sdkInitialized = false;
  }
  log('VideonestEmbed SDK initialized:', sdkInitialized);
  
  // Avoid JSX in conditional rendering to prevent issues in React 18.3.1
  if (!sdkInitialized) {
    return React.createElement('div', null, 'Please initialize Videonest SDK first using authVideonest()');
  }
  log("client initialized creating react element ")
  // Use React.createElement instead of JSX for the iframe to avoid potential issues
  return React.createElement('iframe', {
    src: embedUrl,
    width: style.width || defaultWidth,
    height: style.height || defaultHeight,
    frameBorder: '0',
    allow: 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture',
    allowFullScreen: true,
    title: `Videonest video ${videoId}`
  });
};

export default VideonestEmbed;