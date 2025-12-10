// Configuration management for WebSocket Monitoring Client
// Single source of truth for all environment-based settings

export const config = {
  // API Base URL
  apiUrl: import.meta.env.VITE_API_URL || "http://localhost:3000",

  // WebSocket URL
  wsUrl: import.meta.env.VITE_WS_URL || "http://localhost:3000",

  // App settings
  autoRefreshInterval: 5000, // Dashboard refresh interval (ms)
  maxBroadcastHistory: 50, // Max broadcasts to keep in viewer
  toastDuration: 4000, // Toast notification duration (ms)
};

export default config;
