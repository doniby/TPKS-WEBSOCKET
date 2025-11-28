const express = require('express');
const { requireAdminAuth } = require('../middleware/adminAuth');
const { getPoolStats } = require('../config/db');
const router = express.Router();

// All monitoring routes require admin authentication
router.use(requireAdminAuth);

/**
 * GET /api/monitoring/stats
 * Get WebSocket and system statistics
 */
router.get('/stats', (req, res) => {
  try {
    const io = req.app.get('io');
    const eventManager = req.app.get('eventManager');

    // WebSocket stats
    const socketStats = {
      connectedClients: io.engine.clientsCount,
      rooms: Object.keys(io.sockets.adapter.rooms).length
    };

    // Database pool stats
    const dbPoolStats = getPoolStats();

    // Event manager stats (with cache metrics and sleep mode status)
    const eventStats = eventManager.getMemoryStats();

    // System stats
    const systemStats = {
      uptime: process.uptime(),
      memoryUsage: {
        rss: process.memoryUsage().rss,
        heapTotal: process.memoryUsage().heapTotal,
        heapUsed: process.memoryUsage().heapUsed,
        external: process.memoryUsage().external
      },
      nodeVersion: process.version,
      platform: process.platform,
      env: process.env.NODE_ENV || 'development'
    };

    res.json({
      success: true,
      data: {
        websocket: socketStats,
        database: dbPoolStats,
        events: eventStats,
        system: systemStats,
        timestamp: new Date().toISOString()
      }
    });

  } catch (error) {
    console.error('Error fetching monitoring stats:', error.message);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch monitoring stats'
    });
  }
});

/**
 * GET /api/monitoring/events
 * Get all event execution statistics (in-memory stats with cache metrics)
 */
router.get('/events', (req, res) => {
  try {
    const eventManager = req.app.get('eventManager');
    const eventStats = eventManager.getMemoryStats();

    res.json({
      success: true,
      data: eventStats
    });

  } catch (error) {
    console.error('Error fetching event stats:', error.message);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch event statistics'
    });
  }
});

/**
 * GET /api/monitoring/events/:id
 * Get specific event execution statistics
 */
router.get('/events/:id', (req, res) => {
  try {
    const eventId = parseInt(req.params.id);
    const eventManager = req.app.get('eventManager');
    const eventStats = eventManager.getEventStats(eventId);

    if (!eventStats) {
      return res.status(404).json({
        success: false,
        message: 'Event not found or not running'
      });
    }

    res.json({
      success: true,
      data: eventStats
    });

  } catch (error) {
    console.error('Error fetching event stats:', error.message);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch event statistics'
    });
  }
});

/**
 * GET /api/monitoring/health
 * Health check endpoint (basic, no auth required)
 */
router.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  });
});

module.exports = router;
