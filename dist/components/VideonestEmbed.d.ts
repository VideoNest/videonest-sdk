import * as React from 'react';
import { VideonestConfig } from '../types';
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
declare const VideonestEmbed: React.FC<VideonestEmbedProps>;
export default VideonestEmbed;
