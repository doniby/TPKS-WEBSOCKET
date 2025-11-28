require('dotenv').config();
const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET;
const ADMIN_USERNAME = process.env.ADMIN_USERNAME;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;

// Enforce admin credentials are set
if (!ADMIN_USERNAME || !ADMIN_PASSWORD) {
  console.error('⚠️  CRITICAL: ADMIN_USERNAME or ADMIN_PASSWORD not set in .env!');
  process.exit(1);
}

if (ADMIN_PASSWORD === 'change-this-secure-password' || ADMIN_PASSWORD.length < 8) {
  console.warn('⚠️  WARNING: Admin password is weak or using default value!');
}

/**
 * Verify admin login credentials (single account from .env)
 */
function verifyAdminCredentials(username, password) {
  return username === ADMIN_USERNAME && password === ADMIN_PASSWORD;
}

/**
 * Generate admin JWT token
 */
function generateAdminToken() {
  return jwt.sign(
    {
      role: 'admin',
      username: ADMIN_USERNAME,
      type: 'admin-ui'
    },
    JWT_SECRET,
    { expiresIn: '24h' }
  );
}

/**
 * Middleware to protect admin API routes
 * Checks for valid admin JWT token in Authorization header
 */
function requireAdminAuth(req, res, next) {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader) {
      return res.status(401).json({
        success: false,
        message: 'Authorization header missing'
      });
    }

    const token = authHeader.replace('Bearer ', '');

    const decoded = jwt.verify(token, JWT_SECRET);

    // Verify it's an admin token
    if (decoded.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Admin access required'
      });
    }

    // Attach admin info to request
    req.admin = decoded;
    next();

  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({
        success: false,
        message: 'Token expired, please login again'
      });
    }

    return res.status(401).json({
      success: false,
      message: 'Invalid or malformed token'
    });
  }
}

module.exports = {
  verifyAdminCredentials,
  generateAdminToken,
  requireAdminAuth
};
