import * as React from 'react';
import { getClient } from '../index';
import { log, forceLog } from '../utils/debug';

interface VideonestEmbedProps {
  videoId: number;
  style?: {
    secondaryColor?: string;
    primaryColor?: string;
    darkMode?: boolean;
    showVideoDetails?: boolean;
    width?: string | number;
  };
}

const VideonestEmbed: React.FC<VideonestEmbedProps> = ({ videoId, style = {} }) => {
  // Default styles
  const defaultWidth = '100%';
  const defaultHeight = '400px';
  
  // Use state to track initialization
  const [sdkInitialized, setSdkInitialized] = React.useState(false);
  const {primaryColor, secondaryColor, darkMode, showVideoDetails, width} = style;
  
  // Check SDK initialization in an effect hook
  React.useEffect(() => {
    try {
      getClient();
      setSdkInitialized(true);
    } catch (e) {
      setSdkInitialized(false);
    }
  }, []); // Empty dependency array means this runs once on mount
  
  // Build URL with style parameters if provided
  let embedUrl = `https://app.videonest.co/embed/single/${videoId}`;
  const params: string[] = [];
  
  if (primaryColor) params.push(`primary_color=${primaryColor.replace('#', '')}`);
  if (secondaryColor) params.push(`secondary_color=${secondaryColor.replace('#', '')}`);
  if (darkMode) params.push('dark_mode=true');
  if (showVideoDetails) params.push('show_video_details=true');
  if (width) params.push(`width=${width}`);
  
  // Add search params to URL if any were set
  if (params.length > 0) {
    embedUrl += `?${params.join('&')}`;
  }
  
  // Render loading or error state when SDK is not initialized
  if (!sdkInitialized) {
    return React.createElement('div', null, 'Please initialize Videonest SDK first using authVideonest()');
  }
  
  // Use React.createElement for the iframe for maximum compatibility
  return React.createElement('iframe', {
    src: embedUrl,
    width: style.width || defaultWidth,
    frameBorder: '0',
    allow: 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture',
    allowFullScreen: true,
    title: `Videonest video ${videoId}`
  });
};

export default VideonestEmbed;