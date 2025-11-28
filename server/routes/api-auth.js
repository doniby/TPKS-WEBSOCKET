const express = require('express');
const { verifyAdminCredentials, generateAdminToken } = require('../middleware/adminAuth');
const router = express.Router();

/**
 * Admin Authentication Routes
 * Single account login (no database)
 */

/**
 * POST /api/admin/login
 * Login with username and password
 */
router.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body;

    // Validate input
    if (!username || !password) {
      return res.status(400).json({
        success: false,
        message: 'Username and password are required'
      });
    }

    // Verify credentials against .env
    const isValid = verifyAdminCredentials(username, password);

    if (!isValid) {
      // Add delay to prevent brute force attacks
      await new Promise(resolve => setTimeout(resolve, 1000));

      return res.status(401).json({
        success: false,
        message: 'Invalid username or password'
      });
    }

    // Generate JWT token
    const token = generateAdminToken();

    res.json({
      success: true,
      message: 'Login successful',
      data: {
        token: token,
        username: username,
        role: 'admin',
        expiresIn: '24h'
      }
    });

  } catch (error) {
    console.error('Login error:', error.message);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
});

/**
 * GET /api/admin/verify
 * Verify if current token is valid
 */
router.get('/verify', require('../middleware/adminAuth').requireAdminAuth, (req, res) => {
  res.json({
    success: true,
    message: 'Token is valid',
    data: {
      username: req.admin.username,
      role: req.admin.role
    }
  });
});

module.exports = router;
