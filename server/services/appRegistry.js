const { getPool, oracledb } = require("../config/db");
const crypto = require("crypto");

/**
 * AppRegistry — Manages registered application identities for WebSocket authentication.
 *
 * Loaded from WS_APP_REGISTRY table on startup. Each registered app has:
 *   - appName:   Unique identifier (e.g., 'ETERNAL', 'CBS-MONITOR')
 *   - appSecret: Shared secret for authentication
 *   - channels:  Set of allowed channels, or null for unrestricted access
 *
 * Singleton pattern — use AppRegistry.getInstance() after initial construction.
 */
class AppRegistry {
  constructor() {
    if (AppRegistry._instance) {
      return AppRegistry._instance;
    }

    this.apps = new Map(); // Map<appName, { appId, appSecret, channels, description, isActive }>
    this.isInitialized = false;

    AppRegistry._instance = this;
  }

  /**
   * Get the singleton instance
   */
  static getInstance() {
    if (!AppRegistry._instance) {
      new AppRegistry();
    }
    return AppRegistry._instance;
  }

  /**
   * Initialize the registry by loading apps from the database
   */
  async initialize() {
    if (this.isInitialized) {
      console.warn("⚠️  AppRegistry already initialized");
      return;
    }

    await this.loadApps();
    this.isInitialized = true;
  }

  /**
   * Load or reload all active apps from WS_APP_REGISTRY table
   */
  async loadApps() {
    const pool = getPool();
    let connection;

    try {
      connection = await pool.getConnection();

      const result = await connection.execute(
        `SELECT APP_ID, APP_NAME, APP_SECRET, APP_CHANNELS, IS_ACTIVE, DESCRIPTION
         FROM WS_APP_REGISTRY
         WHERE IS_ACTIVE = 1
         ORDER BY APP_ID`,
        [],
        { outFormat: oracledb.OUT_FORMAT_OBJECT }
      );

      // Clear existing and reload
      this.apps.clear();

      for (const row of result.rows) {
        const channels = row.APP_CHANNELS
          ? new Set(
              row.APP_CHANNELS.split(",")
                .map((ch) => ch.trim().toUpperCase())
                .filter(Boolean)
            )
          : null; // null = unrestricted (all channels)

        this.apps.set(row.APP_NAME, {
          appId: row.APP_ID,
          appName: row.APP_NAME,
          appSecret: row.APP_SECRET,
          channels: channels,
          description: row.DESCRIPTION || "",
          isActive: row.IS_ACTIVE === 1,
        });
      }

      console.log(
        `🔐 AppRegistry loaded ${this.apps.size} registered app(s): [${[
          ...this.apps.keys(),
        ].join(", ")}]`
      );
    } catch (error) {
      console.error("❌ AppRegistry load failed:", error.message);
      throw error;
    } finally {
      if (connection) {
        try {
          await connection.close();
        } catch (e) {}
      }
    }
  }

  /**
   * Validate app credentials
   * @param {string} appName - App identifier
   * @param {string} appSecret - App secret
   * @returns {{ valid: boolean, app: object|null }}
   */
  validateApp(appName, appSecret) {
    if (!appName || !appSecret) {
      return { valid: false, app: null, reason: "Missing credentials" };
    }

    const app = this.apps.get(appName);

    if (!app) {
      return { valid: false, app: null, reason: "App not registered" };
    }

    if (!app.isActive) {
      return { valid: false, app: null, reason: "App is deactivated" };
    }

    // Constant-time comparison to prevent timing attacks
    const secretBuffer = Buffer.from(appSecret);
    const storedBuffer = Buffer.from(app.appSecret);

    if (secretBuffer.length !== storedBuffer.length) {
      return { valid: false, app: null, reason: "Invalid secret" };
    }

    const isValid = crypto.timingSafeEqual(secretBuffer, storedBuffer);

    if (!isValid) {
      return { valid: false, app: null, reason: "Invalid secret" };
    }

    return {
      valid: true,
      app: {
        appId: app.appId,
        appName: app.appName,
        channels: app.channels,
        description: app.description,
      },
    };
  }

  /**
   * Check if an app is authorized to receive data on a specific channel
   * @param {string} appName - App identifier
   * @param {string} channelName - Channel name (e.g., 'YOR', 'VESSELALONGSIDE')
   * @returns {boolean}
   */
  isChannelAllowed(appName, channelName) {
    const app = this.apps.get(appName);

    if (!app || !app.isActive) {
      return false;
    }

    // null channels = unrestricted access
    if (app.channels === null) {
      return true;
    }

    return app.channels.has(channelName.toUpperCase());
  }

  /**
   * Update the LAST_CONNECTED_AT timestamp for an app
   * Non-blocking — fire and forget
   * @param {string} appName - App identifier
   */
  updateLastConnected(appName) {
    const pool = getPool();

    pool
      .getConnection()
      .then((connection) => {
        connection
          .execute(
            `UPDATE WS_APP_REGISTRY
             SET LAST_CONNECTED_AT = CURRENT_TIMESTAMP
             WHERE APP_NAME = :appName`,
            { appName },
            { autoCommit: true }
          )
          .then(() => connection.close())
          .catch((err) => {
            console.error(
              `⚠️  Failed to update last connected for "${appName}":`,
              err.message
            );
            connection.close().catch(() => {});
          });
      })
      .catch((err) => {
        console.error("⚠️  Failed to get connection for audit:", err.message);
      });
  }

  /**
   * Get all registered apps (with secrets masked, for Admin API)
   * @returns {Array}
   */
  getRegisteredApps() {
    const apps = [];

    for (const [name, app] of this.apps.entries()) {
      apps.push({
        appId: app.appId,
        appName: app.appName,
        appSecret: this._maskSecret(app.appSecret),
        channels: app.channels ? [...app.channels] : null,
        description: app.description,
        isActive: app.isActive,
      });
    }

    return apps;
  }

  /**
   * Generate a cryptographically secure app secret
   * @returns {string} 64-character hex string
   */
  static generateSecret() {
    return crypto.randomBytes(32).toString("hex");
  }

  /**
   * Hot-reload the registry from the database (callable from Admin API)
   */
  async reload() {
    console.log("🔄 AppRegistry reloading...");
    await this.loadApps();
  }

  /**
   * Mask a secret for display (show first 4 and last 4 characters)
   * @param {string} secret
   * @returns {string}
   */
  _maskSecret(secret) {
    if (!secret || secret.length <= 8) {
      return "****";
    }
    return secret.substring(0, 4) + "****" + secret.substring(secret.length - 4);
  }
}

module.exports = AppRegistry;
