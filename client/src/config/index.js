// Configuration management for WebSocket Monitoring Client
// Single source of truth for all environment-based settings

// Auto-detect the base URL from the current browser location
// This allows the app to work when accessed via localhost OR IP address
const getBaseUrl = () => {
  if (typeof window !== "undefined") {
    // In browser: use current origin (e.g., http://10.130.0.176:3000)
    return window.location.origin;
  }
  // Fallback for SSR or non-browser environments
  return import.meta.env.VITE_API_URL || "http://localhost:3000";
};

export const config = {
  // API Base URL - auto-detected from browser location
  apiUrl: import.meta.env.VITE_API_URL || getBaseUrl(),

  // WebSocket URL - auto-detected from browser location
  wsUrl: import.meta.env.VITE_WS_URL || getBaseUrl(),

  // App settings
  autoRefreshInterval: 5000, // Dashboard refresh interval (ms)
  maxBroadcastHistory: 50, // Max broadcasts to keep in viewer
  toastDuration: 4000, // Toast notification duration (ms)
};

export default config;
