/**
 * Enable or disable debug mode for the SDK
 * @param enable Whether to enable debugging (true) or disable it (false)
 */
export declare function setDebugMode(enable: boolean): void;
/**
 * Get current debug mode status
 * @returns Boolean indicating if debug mode is enabled
 */
export declare function isDebugModeEnabled(): boolean;
/**
 * Log messages only when debug mode is enabled
 */
export declare const log: (message: string, ...args: any[]) => void;
/**
 * Log messages that should always appear in console when debug mode is enabled,
 * or stay silent when debug mode is disabled
 */
export declare function forceLog(message: string, ...args: any[]): void;
