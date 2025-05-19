import * as React from 'react';
interface VideonestEmbedProps {
    videoId: number;
    style?: {
        secondaryColor?: string;
        primaryColor?: string;
        darkMode?: boolean;
        showVideoDetails?: boolean;
        width?: string | number;
        height?: string | number;
        showTitle?: boolean;
        showDescription?: boolean;
    };
}
declare const VideonestEmbed: React.FC<VideonestEmbedProps>;
export default VideonestEmbed;
