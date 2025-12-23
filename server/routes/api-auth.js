const express = require("express");
const fs = require("fs");
const path = require("path");
const {
  verifyAdminCredentials,
  generateAdminToken,
  requireAdminAuth,
} = require("../middleware/adminAuth");
const { getPool, oracledb } = require("../config/db");
const router = express.Router();

// Path to .env file
const ENV_PATH = path.join(__dirname, "../../.env");

/**
 * Admin Authentication Routes
 * Single account login (no database)
 */

/**
 * POST /api/admin/login
 * Login with username and password
 */
router.post("/login", async (req, res) => {
  try {
    const { username, password } = req.body;

    // Validate input
    if (!username || !password) {
      return res.status(400).json({
        success: false,
        message: "Username and password are required",
      });
    }

    // Verify credentials against .env
    const isValid = verifyAdminCredentials(username, password);

    if (!isValid) {
      // Add delay to prevent brute force attacks
      await new Promise((resolve) => setTimeout(resolve, 1000));

      return res.status(401).json({
        success: false,
        message: "Invalid username or password",
      });
    }

    // Generate JWT token
    const token = generateAdminToken();

    res.json({
      success: true,
      message: "Login successful",
      data: {
        token: token,
        username: username,
        role: "admin",
        expiresIn: "24h",
      },
    });
  } catch (error) {
    console.error("Login error:", error.message);
    res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
});

/**
 * GET /api/admin/verify
 * Verify if current token is valid
 */
router.get(
  "/verify",
  require("../middleware/adminAuth").requireAdminAuth,
  (req, res) => {
    res.json({
      success: true,
      message: "Token is valid",
      data: {
        username: req.admin.username,
        role: req.admin.role,
      },
    });
  }
);

/**
 * POST /api/admin/run
 * Execute a SQL query for testing
 * Body: { q: "base64_encoded_sql" }
 */
router.post("/run", requireAdminAuth, async (req, res) => {
  const { q } = req.body;

  if (!q) {
    return res.status(400).json({
      success: false,
      message: "Query parameter (q) is required",
    });
  }

  // Decode base64
  let sql;
  try {
    sql = Buffer.from(q, "base64").toString("utf-8");
  } catch (e) {
    return res.status(400).json({
      success: false,
      message: "Invalid base64 encoding",
    });
  }

  // Validate SQL - must start with SELECT
  const trimmedSQL = sql.trim().toUpperCase();
  if (!trimmedSQL.startsWith("SELECT")) {
    return res.status(400).json({
      success: false,
      message: "Only SELECT queries are allowed",
    });
  }

  const pool = getPool();
  let connection;
  const startTime = Date.now();

  try {
    connection = await pool.getConnection();

    const result = await connection.execute(sql, [], {
      outFormat: oracledb.OUT_FORMAT_OBJECT,
      maxRows: 10000,
      fetchArraySize: 100,
    });

    const executionTime = Date.now() - startTime;
    const preview = result.rows.slice(0, 5);

    res.json({
      success: true,
      message: "Query executed successfully",
      data: {
        executionTime: executionTime,
        rowCount: result.rows.length,
        suggestedInterval:
          executionTime < 500 ? 5 : executionTime < 1000 ? 10 : 15,
        preview: preview,
      },
    });
  } catch (error) {
    const executionTime = Date.now() - startTime;
    res.status(400).json({
      success: false,
      message: "Query execution failed",
      error: error.message,
      executionTime: executionTime,
    });
  } finally {
    if (connection) {
      try {
        await connection.close();
      } catch (e) {}
    }
  }
});

/**
 * GET /api/admin/events
 * List all events
 */
router.get("/events", requireAdminAuth, async (req, res) => {
  const pool = getPool();
  let connection;

  try {
    connection = await pool.getConnection();
    const result = await connection.execute(
      `SELECT EVENT_ID, EVENT_NAME, SQL_QUERY, INTERVAL_SECONDS, IS_ACTIVE,
              LAST_EXECUTION_TIME, LAST_EXECUTION_STATUS, LAST_EXECUTION_TIMESTAMP,
              CREATED_AT, UPDATED_AT
       FROM WS_EVENTS ORDER BY EVENT_ID DESC`,
      [],
      {
        outFormat: oracledb.OUT_FORMAT_OBJECT,
        fetchInfo: { SQL_QUERY: { type: oracledb.STRING } },
      }
    );
    res.json({ success: true, data: result.rows });
  } catch (error) {
    res.status(500).json({ success: false, message: "Failed to fetch events" });
  } finally {
    if (connection)
      try {
        await connection.close();
      } catch (e) {}
  }
});

/**
 * GET /api/admin/events/:id
 * Get single event
 */
router.get("/events/:id", requireAdminAuth, async (req, res) => {
  const eventId = parseInt(req.params.id);
  const pool = getPool();
  let connection;

  try {
    connection = await pool.getConnection();
    const result = await connection.execute(
      `SELECT * FROM WS_EVENTS WHERE EVENT_ID = :id`,
      { id: eventId },
      {
        outFormat: oracledb.OUT_FORMAT_OBJECT,
        fetchInfo: { SQL_QUERY: { type: oracledb.STRING } },
      }
    );
    if (result.rows.length === 0) {
      return res
        .status(404)
        .json({ success: false, message: "Event not found" });
    }
    res.json({ success: true, data: result.rows[0] });
  } catch (error) {
    res.status(500).json({ success: false, message: "Failed to fetch event" });
  } finally {
    if (connection)
      try {
        await connection.close();
      } catch (e) {}
  }
});

/**
 * POST /api/admin/events
 * Create new event
 */
router.post("/events", requireAdminAuth, async (req, res) => {
  const { eventName, q, intervalSeconds } = req.body;

  if (!eventName || !q || !intervalSeconds) {
    return res.status(400).json({
      success: false,
      message: "eventName, q (base64 SQL), and intervalSeconds are required",
    });
  }

  let sqlQuery;
  try {
    sqlQuery = Buffer.from(q, "base64").toString("utf-8");
  } catch (e) {
    return res
      .status(400)
      .json({ success: false, message: "Invalid base64 encoding" });
  }

  const pool = getPool();
  let connection;

  try {
    connection = await pool.getConnection();
    const result = await connection.execute(
      `INSERT INTO WS_EVENTS (EVENT_NAME, SQL_QUERY, INTERVAL_SECONDS, IS_ACTIVE)
       VALUES (:eventName, :sqlQuery, :intervalSeconds, 1)
       RETURNING EVENT_ID INTO :id`,
      {
        eventName,
        sqlQuery,
        intervalSeconds,
        id: { dir: oracledb.BIND_OUT, type: oracledb.NUMBER },
      },
      { autoCommit: true }
    );
    const eventManager = req.app.get("eventManager");
    await eventManager.reload();
    res.status(201).json({
      success: true,
      message: "Event created",
      data: { eventId: result.outBinds.id[0] },
    });
  } catch (error) {
    if (error.message.includes("unique constraint")) {
      return res
        .status(409)
        .json({ success: false, message: "Event name already exists" });
    }
    res.status(500).json({ success: false, message: "Failed to create event" });
  } finally {
    if (connection)
      try {
        await connection.close();
      } catch (e) {}
  }
});

/**
 * PUT /api/admin/events/:id
 * Update event
 */
router.put("/events/:id", requireAdminAuth, async (req, res) => {
  const eventId = parseInt(req.params.id);
  const { eventName, q, intervalSeconds } = req.body;

  if (!eventName || !q || !intervalSeconds) {
    return res.status(400).json({
      success: false,
      message: "eventName, q (base64 SQL), and intervalSeconds are required",
    });
  }

  let sqlQuery;
  try {
    sqlQuery = Buffer.from(q, "base64").toString("utf-8");
  } catch (e) {
    return res
      .status(400)
      .json({ success: false, message: "Invalid base64 encoding" });
  }

  const pool = getPool();
  let connection;

  try {
    connection = await pool.getConnection();
    const result = await connection.execute(
      `UPDATE WS_EVENTS SET EVENT_NAME = :eventName, SQL_QUERY = :sqlQuery,
       INTERVAL_SECONDS = :intervalSeconds, UPDATED_AT = CURRENT_TIMESTAMP
       WHERE EVENT_ID = :eventId`,
      { eventName, sqlQuery, intervalSeconds, eventId },
      { autoCommit: true }
    );
    if (result.rowsAffected === 0) {
      return res
        .status(404)
        .json({ success: false, message: "Event not found" });
    }
    const eventManager = req.app.get("eventManager");
    await eventManager.reload();
    res.json({ success: true, message: "Event updated" });
  } catch (error) {
    if (error.message.includes("unique constraint")) {
      return res
        .status(409)
        .json({ success: false, message: "Event name already exists" });
    }
    res.status(500).json({ success: false, message: "Failed to update event" });
  } finally {
    if (connection)
      try {
        await connection.close();
      } catch (e) {}
  }
});

/**
 * DELETE /api/admin/events/:id
 * Delete event
 */
router.delete("/events/:id", requireAdminAuth, async (req, res) => {
  const eventId = parseInt(req.params.id);
  const pool = getPool();
  let connection;

  try {
    connection = await pool.getConnection();
    const result = await connection.execute(
      `DELETE FROM WS_EVENTS WHERE EVENT_ID = :eventId`,
      { eventId },
      { autoCommit: true }
    );
    if (result.rowsAffected === 0) {
      return res
        .status(404)
        .json({ success: false, message: "Event not found" });
    }
    const eventManager = req.app.get("eventManager");
    await eventManager.reload();
    res.json({ success: true, message: "Event deleted" });
  } catch (error) {
    res.status(500).json({ success: false, message: "Failed to delete event" });
  } finally {
    if (connection)
      try {
        await connection.close();
      } catch (e) {}
  }
});

/**
 * PATCH /api/admin/events/:id/toggle
 * Toggle event active status
 */
router.patch("/events/:id/toggle", requireAdminAuth, async (req, res) => {
  const eventId = parseInt(req.params.id);
  const pool = getPool();
  let connection;

  try {
    connection = await pool.getConnection();
    const result = await connection.execute(
      `UPDATE WS_EVENTS SET IS_ACTIVE = CASE WHEN IS_ACTIVE = 1 THEN 0 ELSE 1 END,
       UPDATED_AT = CURRENT_TIMESTAMP WHERE EVENT_ID = :eventId
       RETURNING IS_ACTIVE INTO :newStatus`,
      { eventId, newStatus: { dir: oracledb.BIND_OUT, type: oracledb.NUMBER } },
      { autoCommit: true }
    );
    if (result.rowsAffected === 0) {
      return res
        .status(404)
        .json({ success: false, message: "Event not found" });
    }
    const eventManager = req.app.get("eventManager");
    await eventManager.reload();
    res.json({
      success: true,
      message: `Event ${
        result.outBinds.newStatus[0] === 1 ? "activated" : "deactivated"
      }`,
      data: { isActive: result.outBinds.newStatus[0] },
    });
  } catch (error) {
    res.status(500).json({ success: false, message: "Failed to toggle event" });
  } finally {
    if (connection)
      try {
        await connection.close();
      } catch (e) {}
  }
});

// ==========================================
// ALLOWED ORIGINS MANAGEMENT
// ==========================================

/**
 * Helper: Read .env file and parse ALLOWED_ORIGINS
 */
function readAllowedOrigins() {
  try {
    if (!fs.existsSync(ENV_PATH)) {
      return [];
    }
    const envContent = fs.readFileSync(ENV_PATH, "utf-8");
    const match = envContent.match(/^ALLOWED_ORIGINS=(.*)$/m);
    if (match && match[1]) {
      return match[1]
        .split(",")
        .map((o) => o.trim())
        .filter(Boolean);
    }
    return [];
  } catch (error) {
    console.error("Error reading .env:", error.message);
    return [];
  }
}

/**
 * Helper: Write ALLOWED_ORIGINS to .env file
 */
function writeAllowedOrigins(origins) {
  try {
    let envContent = "";
    if (fs.existsSync(ENV_PATH)) {
      envContent = fs.readFileSync(ENV_PATH, "utf-8");
    }

    const newValue = `ALLOWED_ORIGINS=${origins.join(",")}`;

    if (envContent.match(/^ALLOWED_ORIGINS=.*$/m)) {
      // Replace existing
      envContent = envContent.replace(/^ALLOWED_ORIGINS=.*$/m, newValue);
    } else {
      // Add new line
      envContent = envContent.trim() + "\n" + newValue + "\n";
    }

    fs.writeFileSync(ENV_PATH, envContent, "utf-8");
    return true;
  } catch (error) {
    console.error("Error writing .env:", error.message);
    return false;
  }
}

/**
 * GET /api/admin/origins
 * Get all allowed origins
 */
router.get("/origins", requireAdminAuth, (req, res) => {
  try {
    const origins = readAllowedOrigins();
    res.json({
      success: true,
      data: origins,
      message: "Origins loaded from .env file",
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Failed to read origins",
    });
  }
});

/**
 * POST /api/admin/origins
 * Add a new allowed origin
 */
router.post("/origins", requireAdminAuth, (req, res) => {
  try {
    const { origin } = req.body;

    if (!origin || typeof origin !== "string") {
      return res.status(400).json({
        success: false,
        message: "Origin is required",
      });
    }

    const trimmedOrigin = origin.trim();

    // Basic URL validation
    try {
      new URL(trimmedOrigin);
    } catch {
      return res.status(400).json({
        success: false,
        message: "Invalid URL format. Example: https://example.com",
      });
    }

    const origins = readAllowedOrigins();

    // Check for duplicates
    if (origins.includes(trimmedOrigin)) {
      return res.status(409).json({
        success: false,
        message: "Origin already exists",
      });
    }

    origins.push(trimmedOrigin);

    if (!writeAllowedOrigins(origins)) {
      return res.status(500).json({
        success: false,
        message: "Failed to save origins to .env file",
      });
    }

    res.status(201).json({
      success: true,
      message: "Origin added. Restart server to apply changes.",
      data: origins,
    });
  } catch (error) {
    console.error("Error adding origin:", error.message);
    res.status(500).json({
      success: false,
      message: "Failed to add origin",
    });
  }
});

/**
 * DELETE /api/admin/origins/:origin
 * Remove an allowed origin (URL-encoded)
 */
router.delete("/origins/:origin", requireAdminAuth, (req, res) => {
  try {
    const originToRemove = decodeURIComponent(req.params.origin);
    const origins = readAllowedOrigins();

    const index = origins.indexOf(originToRemove);
    if (index === -1) {
      return res.status(404).json({
        success: false,
        message: "Origin not found",
      });
    }

    // Prevent removing last origin
    if (origins.length === 1) {
      return res.status(400).json({
        success: false,
        message:
          "Cannot remove the last origin. At least one origin is required.",
      });
    }

    origins.splice(index, 1);

    if (!writeAllowedOrigins(origins)) {
      return res.status(500).json({
        success: false,
        message: "Failed to save origins to .env file",
      });
    }

    res.json({
      success: true,
      message: "Origin removed. Restart server to apply changes.",
      data: origins,
    });
  } catch (error) {
    console.error("Error removing origin:", error.message);
    res.status(500).json({
      success: false,
      message: "Failed to remove origin",
    });
  }
});

module.exports = router;
