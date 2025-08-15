// src/utils/debug.ts
import debugModule from 'debug';

// Debug mode configuration (disabled by default)
let isDebugEnabled: boolean = true;

// Initialize debug module but don't enable by default
const debugInstance = debugModule('videonest-sdk');

/**
 * Enable or disable debug mode for the SDK
 * @param enable Whether to enable debugging (true) or disable it (false)
 */
export function setDebugMode(enable: boolean): void {
  isDebugEnabled = enable;
  
  if (enable) {
    // Enable debug module
    debugModule.enable('videonest-sdk');
    
    // Set localStorage if in browser environment
    if (typeof window !== 'undefined') {
      window.localStorage.setItem('debug', 'videonest-sdk');
    }
  } else {
    // Disable debug module
    debugModule.disable();
    
    // Clear localStorage if in browser environment
    if (typeof window !== 'undefined') {
      window.localStorage.removeItem('debug');
    }
  }
}

/**
 * Get current debug mode status
 * @returns Boolean indicating if debug mode is enabled
 */
export function isDebugModeEnabled(): boolean {
  return isDebugEnabled;
}

/**
 * Log messages only when debug mode is enabled
 */
export const log = function(message: string, ...args: any[]): void {
  if (isDebugEnabled) {
    debugInstance(message, ...args);
  }
};

/**
 * Log messages that should always appear in console when debug mode is enabled,
 * or stay silent when debug mode is disabled
 */
export function forceLog(message: string, ...args: any[]): void {
  if (isDebugEnabled) {
    console.log(`[videonest-sdk] ${message}`, ...args);
    debugInstance(message, ...args);
  }
}