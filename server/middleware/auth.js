require('dotenv').config();
const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET;
const API_KEY = process.env.API_KEY;

// Enforce security check on startup
if (!JWT_SECRET || JWT_SECRET === 'your-super-secret-jwt-key-change-this-in-production') {
  console.error('⚠️  CRITICAL: JWT_SECRET not set or using default value!');
  process.exit(1);
}

/**
 * Middleware to authenticate WebSocket connections via JWT or API Key
 * Used for public dashboard clients connecting to WebSocket
 */
function authenticateSocket(socket, next) {
  try {
    // Allow public dashboard connections (read-only, no authentication required)
    const isDashboard = socket.handshake.query.dashboard === 'true';

    if (isDashboard) {
      socket.user = {
        type: 'public-dashboard',
        readonly: true
      };
      socket.authenticated = true;
      console.log('[Auth] Public dashboard connection allowed:', socket.id);
      return next();
    }

    // Check Auth Object (Client) or Headers (Postman/Proxy)
    const token = socket.handshake.auth.token || socket.handshake.headers['authorization'];
    const apiKey = socket.handshake.auth.apiKey || socket.handshake.headers['app_key'];

    // 1. JWT Authentication
    if (token) {
      try {
        const cleanToken = token.replace('Bearer ', ''); // Remove prefix if present

        const decoded = jwt.verify(cleanToken, process.env.JWT_SECRET);
        socket.user = decoded;
        socket.authenticated = true;
        return next();
      } catch (err) {
        return next(new Error('Invalid or expired token'));
      }
    }

    // 2. API Key Authentication
    if (apiKey) {
      if (apiKey === process.env.API_KEY) {
        socket.user = { type: 'api-client' };
        socket.authenticated = true;
        return next();
      } else {
        return next(new Error('Invalid API key'));
      }
    }

    return next(new Error('Authentication required'));

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
