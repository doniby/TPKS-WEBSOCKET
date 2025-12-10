const express = require("express");
const { requireAdminAuth } = require("../middleware/adminAuth");
const { getPool, oracledb } = require("../config/db");
const router = express.Router();

// All event routes require admin authentication
router.use(requireAdminAuth);

/**
 * Validate SQL query
 * - Must start with SELECT
 * - Block dangerous keywords
 */
function validateSQLQuery(sql) {
  const trimmedSQL = sql.trim().toUpperCase();

  // Must start with SELECT
  if (!trimmedSQL.startsWith("SELECT")) {
    return {
      valid: false,
      message: "Only SELECT queries are allowed for events",
    };
  }

  // Block dangerous operations
  const dangerousKeywords = [
    "DROP",
    "TRUNCATE",
    "ALTER",
    "CREATE",
    "GRANT",
    "REVOKE",
  ];
  for (const keyword of dangerousKeywords) {
    if (trimmedSQL.includes(keyword)) {
      return {
        valid: false,
        message: `Dangerous keyword detected: ${keyword}. Only SELECT queries allowed.`,
      };
    }
  }

  // Warn about modifying operations (but allow for special cases)
  const modifyingKeywords = ["DELETE", "UPDATE", "INSERT"];
  for (const keyword of modifyingKeywords) {
    if (trimmedSQL.includes(keyword)) {
      return {
        valid: true,
        warning: `Query contains ${keyword} operation. Ensure this is intentional.`,
      };
    }
  }

  return { valid: true };
}

/**
 * Suggest interval based on execution time
 */
function suggestInterval(executionTimeMs) {
  if (executionTimeMs < 500) return 5; // Very fast
  if (executionTimeMs < 1000) return 10; // Fast
  if (executionTimeMs < 3000) return 15; // Medium
  if (executionTimeMs < 5000) return 30; // Slow
  return 60; // Very slow
}

/**
 * POST /api/events/test-query (or /api/q/test-query via alternate mount)
 * Test a SQL query before saving
 */
router.post("/test-query", testQueryHandler);

async function testQueryHandler(req, res) {
  const { sql } = req.body;

  if (!sql) {
    return res.status(400).json({
      success: false,
      message: "SQL query is required",
    });
  }

  // Validate SQL
  const validation = validateSQLQuery(sql);
  if (!validation.valid) {
    return res.status(400).json({
      success: false,
      message: validation.message,
    });
  }

  const pool = getPool();
  let connection;
  const startTime = Date.now();

  try {
    connection = await pool.getConnection();

    // Execute query with timeout
    const result = await connection.execute(sql, [], {
      outFormat: oracledb.OUT_FORMAT_OBJECT,
      maxRows: 10000, // Limit for safety
      fetchArraySize: 100,
      fetchTypeHandler: function (metaData) {
        if (metaData.dbType === oracledb.DB_TYPE_CLOB) {
          return { type: oracledb.STRING };
        }
      },
    });

    const executionTime = Date.now() - startTime;
    const suggestedInterval = suggestInterval(executionTime);

    // Get preview (first 5 rows)
    const preview = result.rows.slice(0, 5);

    // Check for warnings
    let warning = validation.warning || null;
    if (executionTime > 3000) {
      warning = `Query took ${(executionTime / 1000).toFixed(
        2
      )}s. Consider optimizing or reducing data.`;
    }
    if (result.rows.length > 1000) {
      warning =
        (warning ? warning + " " : "") +
        `Query returned ${result.rows.length} rows. Consider limiting results.`;
    }

    res.json({
      success: true,
      message: "Query executed successfully",
      data: {
        executionTime: executionTime,
        rowCount: result.rows.length,
        suggestedInterval: suggestedInterval,
        preview: preview,
        warning: warning,
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
}

/**
 * GET /api/events
 * List all events
 */
router.get("/", async (req, res) => {
  const pool = getPool();
  let connection;

  try {
    connection = await pool.getConnection();

    const result = await connection.execute(
      `SELECT
        EVENT_ID,
        EVENT_NAME,
        SQL_QUERY,
        INTERVAL_SECONDS,
        IS_ACTIVE,
        LAST_EXECUTION_TIME,
        LAST_EXECUTION_STATUS,
        LAST_EXECUTION_TIMESTAMP,
        CREATED_AT,
        UPDATED_AT
       FROM WS_EVENTS
       ORDER BY EVENT_ID DESC`,
      [],
      {
        outFormat: oracledb.OUT_FORMAT_OBJECT,
        fetchInfo: {
          SQL_QUERY: { type: oracledb.STRING },
        },
      }
    );

    res.json({
      success: true,
      data: result.rows,
    });
  } catch (error) {
    console.error("Error fetching events:", error.message);
    res.status(500).json({
      success: false,
      message: "Failed to fetch events",
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
 * GET /api/events/:id
 * Get single event details
 */
router.get("/:id", async (req, res) => {
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
        fetchInfo: {
          SQL_QUERY: { type: oracledb.STRING }, // ✅ FIX: Convert CLOB to String
        },
      }
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Event not found",
      });
    }

    res.json({
      success: true,
      data: result.rows[0],
    });
  } catch (error) {
    console.error("Error fetching event:", error.message);
    res.status(500).json({
      success: false,
      message: "Failed to fetch event",
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
 * POST /api/events
 * Create new event
 */
router.post("/", async (req, res) => {
  const { eventName, sqlQuery, intervalSeconds } = req.body;

  // Validate input
  if (!eventName || !sqlQuery || !intervalSeconds) {
    return res.status(400).json({
      success: false,
      message: "eventName, sqlQuery, and intervalSeconds are required",
    });
  }

  if (intervalSeconds < 1) {
    return res.status(400).json({
      success: false,
      message: "intervalSeconds must be at least 1",
    });
  }

  // Validate SQL
  const validation = validateSQLQuery(sqlQuery);
  if (!validation.valid) {
    return res.status(400).json({
      success: false,
      message: validation.message,
    });
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
        eventName: eventName,
        sqlQuery: sqlQuery,
        intervalSeconds: intervalSeconds,
        id: { dir: oracledb.BIND_OUT, type: oracledb.NUMBER },
      },
      { autoCommit: true }
    );

    const newEventId = result.outBinds.id[0];

    // Reload events in eventManager
    const eventManager = req.app.get("eventManager");
    await eventManager.reload();

    res.status(201).json({
      success: true,
      message: "Event created successfully",
      data: {
        eventId: newEventId,
      },
    });
  } catch (error) {
    console.error("Error creating event:", error.message);

    if (error.message.includes("unique constraint")) {
      return res.status(409).json({
        success: false,
        message: "Event name already exists",
      });
    }

    res.status(500).json({
      success: false,
      message: "Failed to create event",
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
 * PUT /api/events/:id
 * Update event
 */
router.put("/:id", async (req, res) => {
  const eventId = parseInt(req.params.id);
  const { eventName, sqlQuery, intervalSeconds } = req.body;

  if (!eventName || !sqlQuery || !intervalSeconds) {
    return res.status(400).json({
      success: false,
      message: "eventName, sqlQuery, and intervalSeconds are required",
    });
  }

  if (intervalSeconds < 1) {
    return res.status(400).json({
      success: false,
      message: "intervalSeconds must be at least 1",
    });
  }

  // Validate SQL
  const validation = validateSQLQuery(sqlQuery);
  if (!validation.valid) {
    return res.status(400).json({
      success: false,
      message: validation.message,
    });
  }

  const pool = getPool();
  let connection;

  try {
    connection = await pool.getConnection();

    const result = await connection.execute(
      `UPDATE WS_EVENTS
       SET EVENT_NAME = :eventName,
           SQL_QUERY = :sqlQuery,
           INTERVAL_SECONDS = :intervalSeconds,
           UPDATED_AT = CURRENT_TIMESTAMP
       WHERE EVENT_ID = :eventId`,
      {
        eventName: eventName,
        sqlQuery: sqlQuery,
        intervalSeconds: intervalSeconds,
        eventId: eventId,
      },
      { autoCommit: true }
    );

    if (result.rowsAffected === 0) {
      return res.status(404).json({
        success: false,
        message: "Event not found",
      });
    }

    // Reload events in eventManager
    const eventManager = req.app.get("eventManager");
    await eventManager.reload();

    res.json({
      success: true,
      message: "Event updated successfully",
    });
  } catch (error) {
    console.error("Error updating event:", error.message);

    if (error.message.includes("unique constraint")) {
      return res.status(409).json({
        success: false,
        message: "Event name already exists",
      });
    }

    res.status(500).json({
      success: false,
      message: "Failed to update event",
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
 * DELETE /api/events/:id
 * Delete event
 */
router.delete("/:id", async (req, res) => {
  const eventId = parseInt(req.params.id);
  const pool = getPool();
  let connection;

  try {
    connection = await pool.getConnection();

    const result = await connection.execute(
      `DELETE FROM WS_EVENTS WHERE EVENT_ID = :eventId`,
      { eventId: eventId },
      { autoCommit: true }
    );

    if (result.rowsAffected === 0) {
      return res.status(404).json({
        success: false,
        message: "Event not found",
      });
    }

    // Reload events in eventManager
    const eventManager = req.app.get("eventManager");
    await eventManager.reload();

    res.json({
      success: true,
      message: "Event deleted successfully",
    });
  } catch (error) {
    console.error("Error deleting event:", error.message);
    res.status(500).json({
      success: false,
      message: "Failed to delete event",
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
 * PATCH /api/events/:id/toggle
 * Toggle event active status
 */
router.patch("/:id/toggle", async (req, res) => {
  const eventId = parseInt(req.params.id);
  const pool = getPool();
  let connection;

  try {
    connection = await pool.getConnection();

    // Toggle IS_ACTIVE
    const result = await connection.execute(
      `UPDATE WS_EVENTS
       SET IS_ACTIVE = CASE WHEN IS_ACTIVE = 1 THEN 0 ELSE 1 END,
           UPDATED_AT = CURRENT_TIMESTAMP
       WHERE EVENT_ID = :eventId
       RETURNING IS_ACTIVE INTO :newStatus`,
      {
        eventId: eventId,
        newStatus: { dir: oracledb.BIND_OUT, type: oracledb.NUMBER },
      },
      { autoCommit: true }
    );

    if (result.rowsAffected === 0) {
      return res.status(404).json({
        success: false,
        message: "Event not found",
      });
    }

    const newStatus = result.outBinds.newStatus[0];

    // Reload events in eventManager
    const eventManager = req.app.get("eventManager");
    await eventManager.reload();

    res.json({
      success: true,
      message: `Event ${
        newStatus === 1 ? "activated" : "deactivated"
      } successfully`,
      data: {
        isActive: newStatus,
      },
    });
  } catch (error) {
    console.error("Error toggling event:", error.message);
    res.status(500).json({
      success: false,
      message: "Failed to toggle event status",
    });
  } finally {
    if (connection) {
      try {
        await connection.close();
      } catch (e) {}
    }
  }
});

module.exports = router;
