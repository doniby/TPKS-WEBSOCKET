const express = require("express");
const { requireAdminAuth } = require("../middleware/adminAuth");
const { getPool, oracledb } = require("../config/db");
const AppRegistry = require("../services/appRegistry");
const router = express.Router();

// All app registry routes require admin authentication
router.use(requireAdminAuth);

/**
 * GET /api/apps
 * List all registered apps (secrets masked)
 */
router.get("/", async (req, res) => {
  const pool = getPool();
  let connection;

  try {
    connection = await pool.getConnection();

    const result = await connection.execute(
      `SELECT APP_ID, APP_NAME, APP_SECRET, APP_CHANNELS, IS_ACTIVE,
              DESCRIPTION, CREATED_AT, LAST_CONNECTED_AT
       FROM WS_APP_REGISTRY
       ORDER BY APP_ID`,
      [],
      { outFormat: oracledb.OUT_FORMAT_OBJECT }
    );

    // Mask secrets before sending to client
    const apps = result.rows.map((row) => ({
      ...row,
      APP_SECRET: maskSecret(row.APP_SECRET),
    }));

    res.json({
      success: true,
      data: apps,
    });
  } catch (error) {
    console.error("Error fetching apps:", error.message);
    res.status(500).json({
      success: false,
      message: "Failed to fetch registered apps",
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
 * GET /api/apps/:id
 * Get single app details (secret masked)
 */
router.get("/:id", async (req, res) => {
  const appId = parseInt(req.params.id);
  const pool = getPool();
  let connection;

  try {
    connection = await pool.getConnection();

    const result = await connection.execute(
      `SELECT APP_ID, APP_NAME, APP_SECRET, APP_CHANNELS, IS_ACTIVE,
              DESCRIPTION, CREATED_AT, LAST_CONNECTED_AT
       FROM WS_APP_REGISTRY WHERE APP_ID = :id`,
      { id: appId },
      { outFormat: oracledb.OUT_FORMAT_OBJECT }
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "App not found",
      });
    }

    const app = {
      ...result.rows[0],
      APP_SECRET: maskSecret(result.rows[0].APP_SECRET),
    };

    res.json({ success: true, data: app });
  } catch (error) {
    console.error("Error fetching app:", error.message);
    res.status(500).json({
      success: false,
      message: "Failed to fetch app",
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
 * POST /api/apps
 * Register a new app (auto-generates secret)
 *
 * Body: { appName: string, channels?: string, description?: string }
 * - channels: comma-separated channel names, or null/empty for ALL channels
 */
router.post("/", async (req, res) => {
  const { appName, channels, description } = req.body;

  if (!appName || typeof appName !== "string") {
    return res.status(400).json({
      success: false,
      message: "appName is required",
    });
  }

  // Validate app name format (alphanumeric, hyphens, underscores only)
  if (!/^[A-Za-z0-9_-]+$/.test(appName.trim())) {
    return res.status(400).json({
      success: false,
      message:
        "appName must contain only alphanumeric characters, hyphens, and underscores",
    });
  }

  const appSecret = AppRegistry.generateSecret();
  const pool = getPool();
  let connection;

  try {
    connection = await pool.getConnection();

    const result = await connection.execute(
      `INSERT INTO WS_APP_REGISTRY (APP_NAME, APP_SECRET, APP_CHANNELS, DESCRIPTION, IS_ACTIVE)
       VALUES (:appName, :appSecret, :channels, :description, 1)
       RETURNING APP_ID INTO :id`,
      {
        appName: appName.trim().toUpperCase(),
        appSecret: appSecret,
        channels: channels ? channels.trim().toUpperCase() : null,
        description: description || null,
        id: { dir: oracledb.BIND_OUT, type: oracledb.NUMBER },
      },
      { autoCommit: true }
    );

    const newAppId = result.outBinds.id[0];

    // Reload registry in memory
    const appRegistry = AppRegistry.getInstance();
    await appRegistry.reload();

    res.status(201).json({
      success: true,
      message: "App registered successfully",
      data: {
        appId: newAppId,
        appName: appName.trim().toUpperCase(),
        appSecret: appSecret, // Show full secret only on creation
        channels: channels ? channels.trim().toUpperCase() : "ALL",
      },
    });
  } catch (error) {
    console.error("Error creating app:", error.message);

    if (error.message.includes("unique constraint")) {
      return res.status(409).json({
        success: false,
        message: "App name already exists",
      });
    }

    res.status(500).json({
      success: false,
      message: "Failed to register app",
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
 * PUT /api/apps/:id
 * Update app (name, channels, description — NOT the secret)
 */
router.put("/:id", async (req, res) => {
  const appId = parseInt(req.params.id);
  const { appName, channels, description } = req.body;

  if (!appName || typeof appName !== "string") {
    return res.status(400).json({
      success: false,
      message: "appName is required",
    });
  }

  const pool = getPool();
  let connection;

  try {
    connection = await pool.getConnection();

    const result = await connection.execute(
      `UPDATE WS_APP_REGISTRY
       SET APP_NAME = :appName,
           APP_CHANNELS = :channels,
           DESCRIPTION = :description
       WHERE APP_ID = :appId`,
      {
        appName: appName.trim().toUpperCase(),
        channels: channels ? channels.trim().toUpperCase() : null,
        description: description || null,
        appId: appId,
      },
      { autoCommit: true }
    );

    if (result.rowsAffected === 0) {
      return res.status(404).json({
        success: false,
        message: "App not found",
      });
    }

    // Reload registry in memory
    const appRegistry = AppRegistry.getInstance();
    await appRegistry.reload();

    res.json({
      success: true,
      message: "App updated successfully",
    });
  } catch (error) {
    console.error("Error updating app:", error.message);

    if (error.message.includes("unique constraint")) {
      return res.status(409).json({
        success: false,
        message: "App name already exists",
      });
    }

    res.status(500).json({
      success: false,
      message: "Failed to update app",
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
 * DELETE /api/apps/:id
 * Remove app from registry
 */
router.delete("/:id", async (req, res) => {
  const appId = parseInt(req.params.id);
  const pool = getPool();
  let connection;

  try {
    connection = await pool.getConnection();

    const result = await connection.execute(
      `DELETE FROM WS_APP_REGISTRY WHERE APP_ID = :appId`,
      { appId },
      { autoCommit: true }
    );

    if (result.rowsAffected === 0) {
      return res.status(404).json({
        success: false,
        message: "App not found",
      });
    }

    // Reload registry in memory
    const appRegistry = AppRegistry.getInstance();
    await appRegistry.reload();

    res.json({
      success: true,
      message: "App removed successfully",
    });
  } catch (error) {
    console.error("Error removing app:", error.message);
    res.status(500).json({
      success: false,
      message: "Failed to remove app",
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
 * PATCH /api/apps/:id/toggle
 * Activate/deactivate app
 */
router.patch("/:id/toggle", async (req, res) => {
  const appId = parseInt(req.params.id);
  const pool = getPool();
  let connection;

  try {
    connection = await pool.getConnection();

    const result = await connection.execute(
      `UPDATE WS_APP_REGISTRY
       SET IS_ACTIVE = CASE WHEN IS_ACTIVE = 1 THEN 0 ELSE 1 END
       WHERE APP_ID = :appId
       RETURNING IS_ACTIVE INTO :newStatus`,
      {
        appId,
        newStatus: { dir: oracledb.BIND_OUT, type: oracledb.NUMBER },
      },
      { autoCommit: true }
    );

    if (result.rowsAffected === 0) {
      return res.status(404).json({
        success: false,
        message: "App not found",
      });
    }

    const newStatus = result.outBinds.newStatus[0];

    // Reload registry in memory
    const appRegistry = AppRegistry.getInstance();
    await appRegistry.reload();

    res.json({
      success: true,
      message: `App ${newStatus === 1 ? "activated" : "deactivated"} successfully`,
      data: { isActive: newStatus },
    });
  } catch (error) {
    console.error("Error toggling app:", error.message);
    res.status(500).json({
      success: false,
      message: "Failed to toggle app status",
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
 * POST /api/apps/:id/rotate-secret
 * Rotate (regenerate) the app secret
 * Returns the new secret — save it immediately, it won't be shown again
 */
router.post("/:id/rotate-secret", async (req, res) => {
  const appId = parseInt(req.params.id);
  const newSecret = AppRegistry.generateSecret();
  const pool = getPool();
  let connection;

  try {
    connection = await pool.getConnection();

    const result = await connection.execute(
      `UPDATE WS_APP_REGISTRY
       SET APP_SECRET = :newSecret
       WHERE APP_ID = :appId
       RETURNING APP_NAME INTO :appName`,
      {
        newSecret,
        appId,
        appName: { dir: oracledb.BIND_OUT, type: oracledb.STRING, maxSize: 50 },
      },
      { autoCommit: true }
    );

    if (result.rowsAffected === 0) {
      return res.status(404).json({
        success: false,
        message: "App not found",
      });
    }

    // Reload registry in memory
    const appRegistry = AppRegistry.getInstance();
    await appRegistry.reload();

    res.json({
      success: true,
      message:
        "Secret rotated successfully. Save the new secret — it will not be shown again.",
      data: {
        appId: appId,
        appName: result.outBinds.appName[0],
        newSecret: newSecret,
      },
    });
  } catch (error) {
    console.error("Error rotating secret:", error.message);
    res.status(500).json({
      success: false,
      message: "Failed to rotate secret",
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
 * POST /api/apps/reload
 * Hot-reload the app registry from the database
 */
router.post("/reload", async (req, res) => {
  try {
    const appRegistry = AppRegistry.getInstance();
    await appRegistry.reload();

    res.json({
      success: true,
      message: "App registry reloaded",
      data: appRegistry.getRegisteredApps(),
    });
  } catch (error) {
    console.error("Error reloading registry:", error.message);
    res.status(500).json({
      success: false,
      message: "Failed to reload app registry",
    });
  }
});

/**
 * Helper: Mask secret for display
 */
function maskSecret(secret) {
  if (!secret || secret.length <= 8) {
    return "****";
  }
  return secret.substring(0, 4) + "****" + secret.substring(secret.length - 4);
}

module.exports = router;
