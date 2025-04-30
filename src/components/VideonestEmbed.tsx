import * as React from 'react';
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
  
  // Use state to track initialization
  const [sdkInitialized, setSdkInitialized] = React.useState(false);
  
  log('VideonestEmbed props:', { videoId, style });
  
  // Check SDK initialization in an effect hook
  React.useEffect(() => {
    try {
      getClient();
      setSdkInitialized(true);
    } catch (e) {
      setSdkInitialized(false);
    }
    log('VideonestEmbed SDK initialized:', sdkInitialized);
  }, []); // Empty dependency array means this runs once on mount
  
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
  
  log("Creating React element with SDK initialized:", sdkInitialized);
  
  // Render loading or error state when SDK is not initialized
  if (!sdkInitialized) {
    return React.createElement('div', null, 'Please initialize Videonest SDK first using authVideonest()');
  }
  
  // Use React.createElement for the iframe for maximum compatibility
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