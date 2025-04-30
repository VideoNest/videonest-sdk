import * as React from 'react';
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
declare const VideonestEmbed: React.FC<VideonestEmbedProps>;
export default VideonestEmbed;
