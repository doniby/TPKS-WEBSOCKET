const express = require("express");
const { requireAdminAuth } = require("../middleware/adminAuth");
const { getPoolStats } = require("../config/db");
const router = express.Router();

// All monitoring routes require admin authentication
router.use(requireAdminAuth);

/**
 * GET /api/monitoring/stats
 * Get WebSocket and system statistics
 */
router.get("/stats", (req, res) => {
  try {
    const io = req.app.get("io");
    const eventManager = req.app.get("eventManager");

    // WebSocket stats
    const socketStats = {
      connectedClients: io.engine.clientsCount,
      rooms: Object.keys(io.sockets.adapter.rooms).length,
    };

    // Database pool stats
    const dbPoolStats = getPoolStats();

    // Event manager stats (with cache metrics and sleep mode status)
    const eventStats = eventManager.getMemoryStats();

    // System stats with detailed memory breakdown
    const mem = process.memoryUsage();
    const systemStats = {
      uptime: process.uptime(),
      memoryUsage: {
        rss: mem.rss, // Total memory (what pm2 shows)
        heapTotal: mem.heapTotal, // V8 heap capacity
        heapUsed: mem.heapUsed, // V8 heap in use
        external: mem.external, // C++ objects (Oracle driver, etc)
        arrayBuffers: mem.arrayBuffers || 0, // ArrayBuffer memory
      },
      // Memory breakdown in MB for easy reading
      memoryBreakdownMB: {
        total: (mem.rss / 1024 / 1024).toFixed(2),
        heapUsed: (mem.heapUsed / 1024 / 1024).toFixed(2),
        heapTotal: (mem.heapTotal / 1024 / 1024).toFixed(2),
        external: (mem.external / 1024 / 1024).toFixed(2),
        arrayBuffers: ((mem.arrayBuffers || 0) / 1024 / 1024).toFixed(2),
        // Estimated "other" (stack, code, shared libs)
        other: (
          (mem.rss - mem.heapTotal - mem.external - (mem.arrayBuffers || 0)) /
          1024 /
          1024
        ).toFixed(2),
      },
      nodeVersion: process.version,
      platform: process.platform,
      env: process.env.NODE_ENV || "development",
    };

    res.json({
      success: true,
      data: {
        websocket: socketStats,
        database: dbPoolStats,
        events: eventStats,
        system: systemStats,
        timestamp: new Date().toISOString(),
      },
    });
  } catch (error) {
    console.error("Error fetching monitoring stats:", error.message);
    res.status(500).json({
      success: false,
      message: "Failed to fetch monitoring stats",
    });
  }
});

/**
 * GET /api/monitoring/events
 * Get all event execution statistics (in-memory stats with cache metrics)
 */
router.get("/events", (req, res) => {
  try {
    const eventManager = req.app.get("eventManager");
    const eventStats = eventManager.getMemoryStats();

    res.json({
      success: true,
      data: eventStats,
    });
  } catch (error) {
    console.error("Error fetching event stats:", error.message);
    res.status(500).json({
      success: false,
      message: "Failed to fetch event statistics",
    });
  }
});

/**
 * GET /api/monitoring/events/:id
 * Get specific event execution statistics
 */
router.get("/events/:id", (req, res) => {
  try {
    const eventId = parseInt(req.params.id);
    const eventManager = req.app.get("eventManager");
    const eventStats = eventManager.getEventStats(eventId);

    if (!eventStats) {
      return res.status(404).json({
        success: false,
        message: "Event not found or not running",
      });
    }

    res.json({
      success: true,
      data: eventStats,
    });
  } catch (error) {
    console.error("Error fetching event stats:", error.message);
    res.status(500).json({
      success: false,
      message: "Failed to fetch event statistics",
    });
  }
});

/**
 * GET /api/monitoring/health
 * Health check endpoint (basic, no auth required)
 */
router.get("/health", (req, res) => {
  res.json({
    status: "ok",
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
  });
});

module.exports = router;
