const express = require("express");
const {
  verifyAdminCredentials,
  generateAdminToken,
  requireAdminAuth,
} = require("../middleware/adminAuth");
const { getPool, oracledb } = require("../config/db");
const router = express.Router();

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

module.exports = router;
