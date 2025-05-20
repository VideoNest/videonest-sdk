import * as React from 'react';
import { VideonestConfig } from '../types';
import { log, forceLog } from '../utils/debug';

interface VideonestEmbedProps {
  videoId: number;
  config: VideonestConfig;
  style?: {
    secondaryColor?: string;
    primaryColor?: string;
    darkMode?: boolean;
    width?: string | number;
    height?: string | number;
    showTitle?: boolean;
    showDescription?: boolean;
  };
}

const VideonestEmbed: React.FC<VideonestEmbedProps> = ({ videoId, config, style = {} }) => {
  const { primaryColor, secondaryColor, darkMode, width, height, showTitle, showDescription } = style;

  let embedUrl = `https://app.videonest.co/embed/single/${videoId}`;
  const params: string[] = [];

  if (primaryColor) params.push(`primary_color=${primaryColor.replace('#', '')}`);
  if (secondaryColor) params.push(`secondary_color=${secondaryColor.replace('#', '')}`);
  if (darkMode) params.push('dark_mode=true');
  if (width) params.push(`width=${width}`);
  if (height) params.push(`height=${height}`);
  if (showTitle) params.push('show_title=true');
  if (showDescription) params.push('show_description=true');
  
  // Add authentication parameters
  params.push(`channel_id=${config.channelId}`);
  params.push(`api_key=${config.apiKey}`);

  if (params.length > 0) {
    embedUrl += `?${params.join('&')}`;
  }

  return (
    <div
      style={{
        position: 'relative',
        width: style.width || '100%',
        height: 0,
        paddingBottom: '56.25%',
      }}
    >
      <iframe
        src={embedUrl}
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: '100%',
          height: '100%',
        }}
        frameBorder="0"
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
        allowFullScreen
        title={`Videonest video ${videoId}`}
      />
    </div>
  );
};

export default VideonestEmbed;