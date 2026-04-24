require('dotenv').config();
const jwt = require('jsonwebtoken');
const AppRegistry = require('../services/appRegistry');

const JWT_SECRET = process.env.JWT_SECRET;
const API_KEY = process.env.API_KEY;

// Enforce security check on startup
if (!JWT_SECRET || JWT_SECRET === 'your-super-secret-jwt-key-change-this-in-production') {
  console.error('⚠️  CRITICAL: JWT_SECRET not set or using default value!');
  process.exit(1);
}

/**
 * Middleware to authenticate WebSocket connections.
 *
 * Supports three authentication methods (checked in order):
 *   1. App Registry — appId + appSecret (for registered apps like ETERNAL)
 *   2. JWT Token   — Bearer token (for admin/programmatic clients)
 *   3. API Key     — Static key (for simple integrations)
 *
 * The old `?dashboard=true` query parameter bypass has been REMOVED.
 */
function authenticateSocket(socket, next) {
  try {
    // Extract auth credentials from handshake
    const appId = socket.handshake.auth.appId;
    const appSecret = socket.handshake.auth.appSecret;
    const token = socket.handshake.auth.token || socket.handshake.query.token || socket.handshake.headers['authorization'];
    const apiKey = socket.handshake.auth.apiKey || socket.handshake.query.apiKey || socket.handshake.headers['app_key'];

    // 1. App Registry Authentication (primary method for dashboard clients)
    if (appId && appSecret) {
      const appRegistry = AppRegistry.getInstance();
      const result = appRegistry.validateApp(appId, appSecret);

      if (result.valid) {
        socket.user = {
          type: 'registered-app',
          appName: result.app.appName,
          channels: result.app.channels,  // Set of allowed channels, or null for all
          readonly: true
        };
        socket.authenticated = true;

        // Fire-and-forget: update last connected timestamp
        appRegistry.updateLastConnected(appId);

        console.log(`[Auth] App "${appId}" authenticated: ${socket.id}`);
        return next();
      } else {
        console.warn(`[Auth] App "${appId}" rejected: ${result.reason} (IP: ${socket.handshake.address})`);
        return next(new Error('Invalid app credentials'));
      }
    }

    // 2. JWT Authentication (admin clients, programmatic access)
    if (token) {
      try {
        const cleanToken = token.replace('Bearer ', '');
        const decoded = jwt.verify(cleanToken, JWT_SECRET);
        socket.user = decoded;
        socket.authenticated = true;
        return next();
      } catch (err) {
        return next(new Error('Invalid or expired token'));
      }
    }

    // 3. API Key Authentication (simple integrations)
    if (apiKey) {
      if (apiKey === API_KEY) {
        socket.user = { type: 'api-client' };
        socket.authenticated = true;
        return next();
      } else {
        return next(new Error('Invalid API key'));
      }
    }

    // No credentials provided
    console.warn(`[Auth] Connection rejected — no credentials provided (IP: ${socket.handshake.address})`);
    return next(new Error('Authentication required. Provide appId+appSecret, JWT token, or API key.'));

  } catch (error) {
    console.error('Authentication error:', error.message);
    return next(new Error('Authentication failed'));
  }
}

/**
 * Generate JWT token for testing/client apps
 */
function generateToken(payload, expiresIn = '24h') {
  return jwt.sign(payload, JWT_SECRET, { expiresIn });
}

function verifyToken(token) {
  return jwt.verify(token, JWT_SECRET);
}

module.exports = {
  authenticateSocket,
  generateToken,
  verifyToken
};
