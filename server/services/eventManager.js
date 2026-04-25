const { getPool, oracledb } = require("../config/db");
const crypto = require("crypto");
const { getLogger } = require("../utils/logger");

class EventManager {
  constructor(io) {
    this.io = io;
    this.events = new Map();
    this.isInitialized = false;
    this.logger = getLogger();

    // Caching configuration
    this.maxCacheSize = parseInt(process.env.MAX_EVENT_CACHE_MB) || 10; // 10MB per event

    // Staggered start configuration
    this.startupQueue = [];
    this.isStaggering = false;
    this.maxStaggerDelay = parseInt(process.env.MAX_STAGGER_DELAY) || 10000;

    // Sleep mode configuration
    this.isSleeping = false;
    this.sleepModeEnabled = process.env.SLEEP_MODE_ENABLED !== "false"; // Default: true
    this.sleepOnStartup = process.env.SLEEP_ON_STARTUP !== "false"; // NEW: Default: true
    this.sleepDelay = parseInt(process.env.SLEEP_MODE_DELAY) || 30000; // 30 seconds
    this.sleepTimer = null;

    // Persist success heartbeat occasionally (avoid writing each successful run)
    this.successHeartbeatMs =
      parseInt(process.env.SUCCESS_HEALTH_HEARTBEAT_MS) || 30 * 60 * 1000;

    // Track whether schema has new health columns to avoid repeating failing writes
    this.healthColumnsAvailable = true;
  }

  createEventData(config) {
    return {
      config: config,
      timer: null,
      isRunning: false,
      lastDataHash: null,
      cachedData: null,
      cacheTimestamp: null,
      cacheSize: 0,
      cacheTruncated: false,
      health: {
        currentState: "INIT",
        lastSuccessAt: null,
        lastErrorAt: null,
        lastErrorMessage: null,
        consecutiveErrors: 0,
        lastPersistedSuccessAt: null,
      },
      stats: {
        totalExecutions: 0,
        successCount: 0,
        errorCount: 0,
        lastExecutionTime: null,
        lastExecutionStatus: null,
        lastExecutionTimestamp: null,
        skippedCount: 0,
        broadcasts: 0,
      },
    };
  }

  /**
   * Safely broadcast to a socket with error handling
   */
  safeBroadcast(socket, channel, data) {
    try {
      socket.emit(channel, data);
    } catch (error) {
      this.logger.error("Failed to emit to socket:", error, {
        socketId: socket.id,
        channel: channel,
      });
    }
  }

  async initialize() {
    if (this.isInitialized) {
      this.logger.warn("EventManager already initialized");
      return;
    }

    try {
      // Use staggered load on startup to prevent connection pool exhaustion
      await this.loadEventsStaggered();
      this.isInitialized = true;
      this.logger.info(`EventManager initialized with ${this.events.size} active events`);
    } catch (error) {
      this.logger.error("EventManager initialization failed:", error);
      throw error;
    }
  }

  async loadEvents() {
    const pool = getPool();
    let connection;

    try {
      connection = await pool.getConnection();

      const result = await connection.execute(
        `SELECT EVENT_ID, EVENT_NAME, SQL_QUERY, INTERVAL_SECONDS, IS_ACTIVE
         FROM WS_EVENTS
         WHERE IS_ACTIVE = 1
         ORDER BY EVENT_ID`,
        [],
        {
          outFormat: oracledb.OUT_FORMAT_OBJECT,
          fetchInfo: {
            SQL_QUERY: { type: oracledb.STRING }, // Convert CLOB to string
          },
        }
      );

      this.stopAll();

      // Start timer for each active event
      for (const row of result.rows) {
        this.startEvent({
          eventId: row.EVENT_ID,
          eventName: row.EVENT_NAME,
          sqlQuery: row.SQL_QUERY,
          intervalSeconds: row.INTERVAL_SECONDS,
        });
      }

      console.log(
        `📊 Loaded ${result.rows.length} active events from database`
      );
    } catch (error) {
      console.error("Error loading events:", error.message);
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
   * Load events with staggered start to prevent connection pool exhaustion
   */
  async loadEventsStaggered() {
    const pool = getPool();
    let connection;

    try {
      connection = await pool.getConnection();

      const result = await connection.execute(
        `SELECT EVENT_ID, EVENT_NAME, SQL_QUERY, INTERVAL_SECONDS, IS_ACTIVE
         FROM WS_EVENTS
         WHERE IS_ACTIVE = 1
         ORDER BY EVENT_ID`,
        [],
        {
          outFormat: oracledb.OUT_FORMAT_OBJECT,
          fetchInfo: {
            SQL_QUERY: { type: oracledb.STRING }, // Convert CLOB to string
          },
        }
      );

      this.stopAll();

      const eventConfigs = result.rows.map((row) => ({
        eventId: row.EVENT_ID,
        eventName: row.EVENT_NAME,
        sqlQuery: row.SQL_QUERY,
        intervalSeconds: row.INTERVAL_SECONDS,
      }));

      if (eventConfigs.length === 0) {
        this.logger.info("No active events to load");
        return;
      }

      // Calculate stagger interval
      const smallestInterval = Math.min(
        ...eventConfigs.map((e) => e.intervalSeconds)
      );
      const staggerDelay = Math.max(
        Math.min(
          (smallestInterval * 1000) / eventConfigs.length,
          this.maxStaggerDelay / eventConfigs.length
        ),
        500 // Minimum 500ms between starts
      );

      const totalStaggerTime = staggerDelay * eventConfigs.length;

      this.logger.info(`EventManager starting with staggered load`, {
        events: eventConfigs.length,
        staggerInterval: staggerDelay,
        totalTime: totalStaggerTime,
      });

      // Start events with staggered delays
      this.isStaggering = true;
      eventConfigs.forEach((config, index) => {
        setTimeout(() => {
          this.startEventDelayed(config, true);
        }, index * staggerDelay);
      });

      // Mark staggering as complete after all events are scheduled
      setTimeout(() => {
        this.isStaggering = false;
        this.logger.info(`All ${eventConfigs.length} events started`);

        // NEW: Check if we should immediately go to sleep (no clients connected)
        if (this.sleepOnStartup) {
          setTimeout(() => {
            this.checkSleepMode();
          }, 1000); // Check after 1 second to ensure all events are initialized
        }
      }, totalStaggerTime + 1000);
    } catch (error) {
      this.logger.error("Error loading events with stagger:", error);
      this.isStaggering = false;
      // Fallback to immediate load
      this.logger.warn("Falling back to immediate load");
      await this.loadEvents();
    } finally {
      if (connection) {
        try {
          await connection.close();
        } catch (e) {}
      }
    }
  }

  /**
   * Start a single event timer
   */
  startEvent(config) {
    const { eventId, eventName, sqlQuery, intervalSeconds } = config;

    // Stop existing timer if running
    if (this.events.has(eventId)) {
      this.stopEvent(eventId);
    }

    // Create event data structure
    const eventData = this.createEventData(config);

    // Execute immediately on start
    this.executeEvent(eventId, eventData);

    // Set interval timer
    eventData.timer = setInterval(() => {
      this.executeEvent(eventId, eventData);
    }, intervalSeconds * 1000);

    this.events.set(eventId, eventData);

    this.logger.info(`Started event: "${eventName}" (ID: ${eventId}) - Interval: ${intervalSeconds}s`);
  }

  /**
   * Start a single event timer with optional delayed execution
   * @param {Object} config - Event configuration
   * @param {Boolean} executeImmediately - Whether to execute immediately or wait for first interval
   */
  startEventDelayed(config, executeImmediately = true) {
    const { eventId, eventName, sqlQuery, intervalSeconds } = config;

    // Stop existing timer if running
    if (this.events.has(eventId)) {
      this.stopEvent(eventId);
    }

    // Create event data structure
    const eventData = this.createEventData(config);

    this.events.set(eventId, eventData);

    // Execute immediately if requested (for staggered start)
    if (executeImmediately) {
      this.executeEvent(eventId, eventData);
    }

    // Set interval timer
    eventData.timer = setInterval(() => {
      this.executeEvent(eventId, eventData);
    }, intervalSeconds * 1000);

    this.logger.info(`Started event: "${eventName}" (ID: ${eventId}) - Interval: ${intervalSeconds}s`);
  }

  /**
   * Execute event query and broadcast results
   */
  async executeEvent(eventId, eventData) {
    const { eventName, sqlQuery } = eventData.config;

    // Prevent overlap: Skip if previous execution still running
    if (eventData.isRunning) {
      eventData.stats.skippedCount++;
      this.logger.warn(`Skipping event "${eventName}" - Previous execution still running`);
      return;
    }

    eventData.isRunning = true;
    eventData.stats.totalExecutions++;
    const startTime = Date.now();

    const pool = getPool();
    let connection;
    const previousStatus = eventData.stats.lastExecutionStatus;

    try {
      connection = await pool.getConnection();

      const result = await connection.execute(sqlQuery, [], {
        outFormat: oracledb.OUT_FORMAT_OBJECT,
        maxRows: 1000, // Increased limit from 50 to allow full dashboard payloads
        fetchArraySize: 1000,
      });

      const executionTime = Date.now() - startTime;
      const dataHash = crypto
        .createHash("md5")
        .update(JSON.stringify(result.rows))
        .digest("hex");

      // Only broadcast if data has changed
      if (dataHash !== eventData.lastDataHash) {
        eventData.lastDataHash = dataHash;
        eventData.stats.broadcasts++;

        // NEW: Store cached data with memory management
        const dataString = JSON.stringify(result.rows);
        const dataSizeBytes = Buffer.byteLength(dataString, "utf8");
        const maxSizeBytes = this.maxCacheSize * 1024 * 1024;

        if (dataSizeBytes > maxSizeBytes) {
          // Truncate to first 100 rows if exceeds limit
          eventData.cachedData = result.rows.slice(0, 100);
          eventData.cacheTruncated = true;
          eventData.cacheSize = Buffer.byteLength(
            JSON.stringify(eventData.cachedData),
            "utf8"
          );
          this.logger.warn(
            `Cache for "${eventName}" exceeds ${this.maxCacheSize}MB, truncated to 100 rows`
          );
        } else {
          eventData.cachedData = result.rows;
          eventData.cacheTruncated = false;
          eventData.cacheSize = dataSizeBytes;
        }

        eventData.cacheTimestamp = new Date();

        // Prepare broadcast data
        const broadcastData = {
          eventName: eventName,
          data: result.rows,
          rowCount: result.rows.length,
          timestamp: new Date().toISOString(),
          executionTime: executionTime,
        };

        // Broadcast to authorized clients only (channel-scoped)
        const channel = this.getEventChannel(eventName);
        let sentCount = 0;

        for (const [socketId, socket] of this.io.sockets.sockets) {
          // If user has no channel restrictions (null), they get everything
          // If user has channel restrictions, check if this channel is allowed
          if (!socket.user?.channels || socket.user.channels.has(channel)) {
            this.safeBroadcast(socket, channel, broadcastData);
            sentCount++;
          }
        }


        this.logger.debug(
          `Event "${eventName}" executed and broadcasted (${executionTime}ms, ${result.rows.length} rows)`
        );
      } else {
        this.logger.debug(
          `Event "${eventName}" executed but data unchanged (${executionTime}ms, ${result.rows.length} rows)`
        );
      }

      // Update stats (in memory only for success)
      eventData.stats.successCount++;
      eventData.stats.lastExecutionTime = executionTime;
      eventData.stats.lastExecutionStatus = "success";
      eventData.stats.lastExecutionTimestamp = new Date();
      eventData.health.currentState = "OK";
      eventData.health.lastSuccessAt = new Date();
      eventData.health.consecutiveErrors = 0;
      eventData.health.lastErrorMessage = null;

      // Persist success health on transition (error -> success) or heartbeat cadence.
      const shouldPersistTransition = previousStatus === "error";
      const shouldPersistHeartbeat =
        !eventData.health.lastPersistedSuccessAt ||
        Date.now() - eventData.health.lastPersistedSuccessAt.getTime() >=
          this.successHeartbeatMs;

      if (shouldPersistTransition || shouldPersistHeartbeat) {
        await this.persistHealthSnapshot(eventId, {
          currentState: "OK",
          lastSuccessAt: eventData.health.lastSuccessAt,
          consecutiveErrors: 0,
          lastExecutionTime: executionTime,
          legacyStatus: "success",
        });
        eventData.health.lastPersistedSuccessAt = new Date();
      }

      // REMOVED: Database write for success (now memory-only)
      // Success stats are kept in memory to reduce database writes by ~90%
    } catch (error) {
      const executionTime = Date.now() - startTime;

      eventData.stats.errorCount++;
      eventData.stats.lastExecutionTime = executionTime;
      eventData.stats.lastExecutionStatus = "error";
      eventData.stats.lastExecutionTimestamp = new Date();
      eventData.health.currentState = "ERROR";
      eventData.health.lastErrorAt = new Date();
      eventData.health.lastErrorMessage = this.truncateErrorMessage(error.message);
      eventData.health.consecutiveErrors += 1;

      // Persist error snapshot to DB (with backward-compatible fallback).
      await this.persistHealthSnapshot(eventId, {
        currentState: "ERROR",
        lastErrorAt: eventData.health.lastErrorAt,
        lastErrorMessage: eventData.health.lastErrorMessage,
        consecutiveErrors: eventData.health.consecutiveErrors,
        lastExecutionTime: executionTime,
        legacyStatus: "error",
      });

      this.logger.error(`Event "${eventName}" execution failed:`, error);

      // Emit error to clients (without exposing sensitive error details)
      const errorChannel = this.getEventChannel(eventName);
      const errorData = {
        eventName: eventName,
        error: true,
        message: "Data temporarily unavailable",
        timestamp: new Date().toISOString(),
      };

      for (const [, socket] of this.io.sockets.sockets) {
        if (!socket.user?.channels || socket.user.channels.has(errorChannel)) {
          this.safeBroadcast(socket, errorChannel, errorData);
        }
      }
    } finally {
      eventData.isRunning = false;

      if (connection) {
        try {
          await connection.close();
        } catch (e) {}
      }
    }
  }

  /**
   * Keep DB error message compact and safe for VARCHAR2 column
   */
  truncateErrorMessage(message) {
    if (!message) return null;
    return String(message).slice(0, 1000);
  }

  /**
   * Persist compact health snapshot. Falls back to legacy columns when new schema not yet applied.
   */
  async persistHealthSnapshot(eventId, payload) {
    const {
      currentState,
      lastSuccessAt,
      lastErrorAt,
      lastErrorMessage,
      consecutiveErrors,
      lastExecutionTime,
      legacyStatus,
    } = payload;

    const pool = getPool();
    let connection;

    try {
      connection = await pool.getConnection();

      if (this.healthColumnsAvailable) {
        try {
          await connection.execute(
            `UPDATE WS_EVENTS
             SET CURRENT_STATE = NVL(:currentState, CURRENT_STATE),
                 LAST_SUCCESS_AT = NVL(:lastSuccessAt, LAST_SUCCESS_AT),
                 LAST_ERROR_AT = NVL(:lastErrorAt, LAST_ERROR_AT),
                 LAST_ERROR_MESSAGE = NVL(:lastErrorMessage, LAST_ERROR_MESSAGE),
                 CONSECUTIVE_ERRORS = NVL(:consecutiveErrors, CONSECUTIVE_ERRORS),
                 LAST_EXECUTION_TIME = NVL(:executionTime, LAST_EXECUTION_TIME),
                 LAST_EXECUTION_STATUS = NVL(:legacyStatus, LAST_EXECUTION_STATUS),
                 LAST_EXECUTION_TIMESTAMP = CURRENT_TIMESTAMP,
                 UPDATED_AT = CURRENT_TIMESTAMP
             WHERE EVENT_ID = :eventId`,
            {
              currentState,
              lastSuccessAt,
              lastErrorAt,
              lastErrorMessage,
              consecutiveErrors,
              executionTime: lastExecutionTime,
              legacyStatus,
              eventId,
            },
            { autoCommit: true }
          );
          return;
        } catch (error) {
          if (String(error.message).includes("ORA-00904")) {
            this.healthColumnsAvailable = false;
            this.logger.warn(
              "WS_EVENTS health columns not available yet; using legacy status fields only"
            );
          } else {
            throw error;
          }
        }
      }

      await connection.execute(
        `UPDATE WS_EVENTS
         SET LAST_EXECUTION_TIME = NVL(:executionTime, LAST_EXECUTION_TIME),
             LAST_EXECUTION_STATUS = NVL(:legacyStatus, LAST_EXECUTION_STATUS),
             LAST_EXECUTION_TIMESTAMP = CURRENT_TIMESTAMP,
             UPDATED_AT = CURRENT_TIMESTAMP
         WHERE EVENT_ID = :eventId`,
        {
          executionTime: lastExecutionTime,
          legacyStatus,
          eventId,
        },
        { autoCommit: true }
      );
    } catch (error) {
      this.logger.error("Error persisting event health snapshot:", error);
    } finally {
      if (connection) {
        try {
          await connection.close();
        } catch (e) {}
      }
    }
  }

  /**
   * Stop a single event
   */
  stopEvent(eventId) {
    const eventData = this.events.get(eventId);

    if (eventData && eventData.timer) {
      clearInterval(eventData.timer);
      this.events.delete(eventId);
      this.logger.debug(`Stopped event ID: ${eventId}`);
    }
  }

  /**
   * Stop all events
   */
  stopAll() {
    for (const [eventId, eventData] of this.events.entries()) {
      if (eventData.timer) {
        clearInterval(eventData.timer);
      }
    }
    this.events.clear();
    this.logger.debug("All events stopped");
  }

  /**
   * Reload all events from database (for CRUD operations)
   */
  async reload() {
    console.log("🔄 Reloading events...");
    await this.loadEvents();
  }

  /**
   * Get event channel name for Socket.IO
   * Converts "Vessel Alongside" -> "VESSEL_ALONGSIDE"
   */
  getEventChannel(eventName) {
    return eventName.toUpperCase().replace(/\s+/g, "_");
  }

  /**
   * Get all event statistics
   */
  getAllStats() {
    const stats = [];

    for (const [eventId, eventData] of this.events.entries()) {
      stats.push({
        eventId: eventId,
        eventName: eventData.config.eventName,
        intervalSeconds: eventData.config.intervalSeconds,
        isRunning: eventData.isRunning,
        health: eventData.health,
        stats: eventData.stats,
      });
    }

    return stats;
  }

  /**
   * Get specific event stats
   */
  getEventStats(eventId) {
    const eventData = this.events.get(eventId);
    return eventData
      ? {
          eventId: eventId,
          eventName: eventData.config.eventName,
          intervalSeconds: eventData.config.intervalSeconds,
          isRunning: eventData.isRunning,
          health: eventData.health,
          stats: eventData.stats,
        }
      : null;
  }

  /**
   * Get cached data for an event by ID
   */
  getCachedData(eventId) {
    const eventData = this.events.get(eventId);

    if (!eventData || !eventData.cachedData) {
      return null;
    }

    return {
      eventName: eventData.config.eventName,
      data: eventData.cachedData,
      rowCount: eventData.cachedData.length,
      timestamp: eventData.cacheTimestamp,
      age: eventData.cacheTimestamp
        ? Date.now() - eventData.cacheTimestamp.getTime()
        : null,
      truncated: eventData.cacheTruncated || false,
      cacheSize: eventData.cacheSize,
    };
  }

  /**
   * Get cached data for an event by name
   */
  getCachedDataByName(eventName) {
    for (const [eventId, eventData] of this.events.entries()) {
      if (eventData.config.eventName === eventName) {
        return this.getCachedData(eventId);
      }
    }
    return null;
  }

  /**
   * Trigger immediate execution of an event by name
   * Used when client requests data but cache is not populated yet
   */
  async triggerEventByName(eventName) {
    for (const [eventId, eventData] of this.events.entries()) {
      if (eventData.config.eventName === eventName) {
        console.log(`🔄 Triggering immediate execution for "${eventName}"`);
        await this.executeEvent(eventId, eventData);
        return true;
      }
    }
    console.warn(`⚠️  Event not found: "${eventName}"`);
    return false;
  }

  /**
   * Get in-memory statistics for all events (including cache metrics)
   */
  getMemoryStats() {
    const stats = [];

    for (const [eventId, eventData] of this.events.entries()) {
      stats.push({
        eventId: eventId,
        eventName: eventData.config.eventName,
        intervalSeconds: eventData.config.intervalSeconds,
        isRunning: eventData.isRunning,
        isSleeping: this.isSleeping,
        health: eventData.health,
        stats: {
          ...eventData.stats,
          cacheSize: eventData.cacheSize,
          cacheAge: eventData.cacheTimestamp
            ? Date.now() - eventData.cacheTimestamp.getTime()
            : null,
          cacheTruncated: eventData.cacheTruncated,
        },
      });
    }

    return stats;
  }

  /**
   * Check sleep mode and wake/sleep accordingly based on client connections
   */
  checkSleepMode() {
    if (!this.sleepModeEnabled) {
      console.log("💡 Sleep mode disabled via config");
      return;
    }

    const connectedClients = this.io.engine.clientsCount;

    console.log(
      `🔍 Sleep check: ${connectedClients} client(s) connected, sleeping: ${this.isSleeping}`
    );

    // Wake up: Clients connected and we're sleeping
    if (connectedClients > 0 && this.isSleeping) {
      this.wakeUp();
    }

    // Go to sleep: No clients and we're awake
    if (connectedClients === 0 && !this.isSleeping) {
      // Don't sleep immediately (prevent flapping)
      if (this.sleepTimer) {
        clearTimeout(this.sleepTimer);
      }

      console.log(`⏱️  Scheduling sleep in ${this.sleepDelay / 1000}s...`);

      this.sleepTimer = setTimeout(() => {
        // Double-check client count before sleeping
        if (this.io.engine.clientsCount === 0) {
          this.goToSleep();
        }
      }, this.sleepDelay);
    }

    // Cancel sleep timer if clients reconnect
    if (connectedClients > 0 && this.sleepTimer) {
      console.log("⏰ Sleep cancelled - client connected");
      clearTimeout(this.sleepTimer);
      this.sleepTimer = null;
    }
  }

  /**
   * Put EventManager to sleep - pause all timers
   */
  goToSleep() {
    if (this.isSleeping) return;

    console.log("💤 Sleep mode activated - No clients connected");
    this.isSleeping = true;

    // Pause all timers (but keep event config and cache)
    for (const [eventId, eventData] of this.events.entries()) {
      if (eventData.timer) {
        clearInterval(eventData.timer);
        eventData.timer = null;
        if (eventData.stats) {
          eventData.stats.lastSleepTimestamp = new Date();
        }
      }
    }

    console.log(`⏸️  Paused ${this.events.size} events`);
  }

  /**
   * Wake up EventManager - resume all timers with staggering
   */
  async wakeUp() {
    if (!this.isSleeping) return;

    console.log("⏰ Waking up from sleep mode - Client connected");
    this.isSleeping = false;

    // Get all event configs
    const eventConfigs = [];
    for (const [eventId, eventData] of this.events.entries()) {
      eventConfigs.push(eventData.config);
    }

    if (eventConfigs.length === 0) {
      console.log("⚠️  No events to wake");
      return;
    }

    // Calculate stagger interval for wake-up
    const smallestInterval = Math.min(
      ...eventConfigs.map((e) => e.intervalSeconds)
    );
    const staggerDelay = Math.max(
      Math.min(
        (smallestInterval * 1000) / eventConfigs.length,
        this.maxStaggerDelay / eventConfigs.length
      ),
      500
    );

    console.log(
      `▶️  Resuming ${eventConfigs.length} events with ${staggerDelay}ms stagger...`
    );

    // Restart timers with staggering
    eventConfigs.forEach((config, index) => {
      setTimeout(() => {
        const eventData = this.events.get(config.eventId);
        if (eventData) {
          // Set interval timer (don't execute immediately, will execute at interval)
          eventData.timer = setInterval(() => {
            this.executeEvent(config.eventId, eventData);
          }, config.intervalSeconds * 1000);

          // Execute once with random jitter to refresh cache
          const jitter = Math.random() * 2000; // 0-2s random delay
          setTimeout(() => {
            this.executeEvent(config.eventId, eventData);
          }, jitter);
        }
      }, index * staggerDelay);
    });

    setTimeout(() => {
      console.log(`✅ All ${eventConfigs.length} events resumed`);
    }, staggerDelay * eventConfigs.length + 3000);
  }
}

module.exports = EventManager;
