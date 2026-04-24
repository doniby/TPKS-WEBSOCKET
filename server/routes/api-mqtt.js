const express = require("express");
const { requireAdminAuth } = require("../middleware/adminAuth");
const { getPool, oracledb } = require("../config/db");

const router = express.Router();

router.use(requireAdminAuth);

async function reloadBridge(req) {
  const mqttBridge = req.app.get("mqttBridge");
  if (!mqttBridge) return;
  try {
    await mqttBridge.reload();
  } catch (err) {
    console.warn("[MQTT] Reload after change failed:", err.message);
  }
}

/**
 * GET /api/mqtt/status
 * Bridge connection state + currently-subscribed filters
 */
router.get("/status", (req, res) => {
  try {
    const mqttBridge = req.app.get("mqttBridge");
    if (!mqttBridge) {
      return res
        .status(503)
        .json({ success: false, message: "MQTT bridge not initialized" });
    }
    res.json({ success: true, data: mqttBridge.getStatus() });
  } catch (error) {
    console.error("Error fetching MQTT status:", error.message);
    res
      .status(500)
      .json({ success: false, message: "Failed to fetch MQTT status" });
  }
});

/**
 * GET /api/mqtt/topics
 * List all topics from WS_MQTT_TOPICS (active + inactive)
 */
router.get("/topics", async (req, res) => {
  const pool = getPool();
  let connection;
  try {
    connection = await pool.getConnection();
    const result = await connection.execute(
      `SELECT TOPIC_ID, TOPIC_FILTER, DESCRIPTION, IS_ACTIVE, CREATED_AT, UPDATED_AT
         FROM WS_MQTT_TOPICS
        ORDER BY TOPIC_ID`,
      [],
      { outFormat: oracledb.OUT_FORMAT_OBJECT }
    );

    const rows = result.rows.map((r) => ({
      topicId: r.TOPIC_ID,
      topicFilter: r.TOPIC_FILTER,
      description: r.DESCRIPTION,
      isActive: r.IS_ACTIVE === 1,
      createdAt: r.CREATED_AT,
      updatedAt: r.UPDATED_AT,
    }));

    res.json({ success: true, data: rows });
  } catch (error) {
    console.error("Error fetching topics:", error.message);
    res
      .status(500)
      .json({ success: false, message: "Failed to fetch topics" });
  } finally {
    if (connection) {
      try {
        await connection.close();
      } catch (e) {}
    }
  }
});

/**
 * POST /api/mqtt/topics
 * Add a new topic subscription
 * Body: { topicFilter, description? }
 */
router.post("/topics", async (req, res) => {
  const { topicFilter, description } = req.body;

  if (!topicFilter || typeof topicFilter !== "string" || !topicFilter.trim()) {
    return res.status(400).json({
      success: false,
      message: "topicFilter is required",
    });
  }

  const filter = topicFilter.trim();
  if (filter.length > 500) {
    return res.status(400).json({
      success: false,
      message: "topicFilter exceeds 500 characters",
    });
  }

  const pool = getPool();
  let connection;
  try {
    connection = await pool.getConnection();
    const result = await connection.execute(
      `INSERT INTO WS_MQTT_TOPICS (TOPIC_FILTER, DESCRIPTION)
       VALUES (:filter, :description)
       RETURNING TOPIC_ID INTO :id`,
      {
        filter,
        description: description || null,
        id: { type: oracledb.NUMBER, dir: oracledb.BIND_OUT },
      },
      { autoCommit: true }
    );

    await reloadBridge(req);

    res.status(201).json({
      success: true,
      data: {
        topicId: result.outBinds.id[0],
        topicFilter: filter,
        description: description || null,
        isActive: true,
      },
    });
  } catch (error) {
    if (error.message && error.message.includes("ORA-00001")) {
      return res.status(409).json({
        success: false,
        message: "Topic filter already exists",
      });
    }
    console.error("Error adding topic:", error.message);
    res.status(500).json({ success: false, message: "Failed to add topic" });
  } finally {
    if (connection) {
      try {
        await connection.close();
      } catch (e) {}
    }
  }
});

/**
 * PATCH /api/mqtt/topics/:id/toggle
 * Flip IS_ACTIVE for a topic and reload subscriptions
 */
router.patch("/topics/:id/toggle", async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (!id) {
    return res
      .status(400)
      .json({ success: false, message: "Invalid topic id" });
  }

  const pool = getPool();
  let connection;
  try {
    connection = await pool.getConnection();
    const result = await connection.execute(
      `UPDATE WS_MQTT_TOPICS
          SET IS_ACTIVE = CASE WHEN IS_ACTIVE = 1 THEN 0 ELSE 1 END,
              UPDATED_AT = CURRENT_TIMESTAMP
        WHERE TOPIC_ID = :id`,
      { id },
      { autoCommit: true }
    );

    if (result.rowsAffected === 0) {
      return res
        .status(404)
        .json({ success: false, message: "Topic not found" });
    }

    await reloadBridge(req);

    res.json({ success: true });
  } catch (error) {
    console.error("Error toggling topic:", error.message);
    res
      .status(500)
      .json({ success: false, message: "Failed to toggle topic" });
  } finally {
    if (connection) {
      try {
        await connection.close();
      } catch (e) {}
    }
  }
});

/**
 * DELETE /api/mqtt/topics/:id
 * Remove a topic from the registry
 */
router.delete("/topics/:id", async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (!id) {
    return res
      .status(400)
      .json({ success: false, message: "Invalid topic id" });
  }

  const pool = getPool();
  let connection;
  try {
    connection = await pool.getConnection();
    const result = await connection.execute(
      `DELETE FROM WS_MQTT_TOPICS WHERE TOPIC_ID = :id`,
      { id },
      { autoCommit: true }
    );

    if (result.rowsAffected === 0) {
      return res
        .status(404)
        .json({ success: false, message: "Topic not found" });
    }

    await reloadBridge(req);

    res.json({ success: true });
  } catch (error) {
    console.error("Error deleting topic:", error.message);
    res
      .status(500)
      .json({ success: false, message: "Failed to delete topic" });
  } finally {
    if (connection) {
      try {
        await connection.close();
      } catch (e) {}
    }
  }
});

/**
 * POST /api/mqtt/reload
 * Force the bridge to re-read WS_MQTT_TOPICS and re-subscribe
 */
router.post("/reload", async (req, res) => {
  const mqttBridge = req.app.get("mqttBridge");
  if (!mqttBridge) {
    return res
      .status(503)
      .json({ success: false, message: "MQTT bridge not initialized" });
  }

  try {
    const topics = await mqttBridge.reload();
    res.json({ success: true, data: { topics } });
  } catch (error) {
    console.error("Error reloading MQTT bridge:", error.message);
    res
      .status(500)
      .json({ success: false, message: error.message || "Reload failed" });
  }
});

module.exports = router;
