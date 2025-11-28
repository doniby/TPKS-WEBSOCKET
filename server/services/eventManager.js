const { getPool, oracledb } = require('../config/db');
const crypto = require('crypto');

class EventManager {
  constructor(io) {
    this.io = io;
    this.events = new Map();
    this.isInitialized = false;

    // Caching configuration
    this.maxCacheSize = parseInt(process.env.MAX_EVENT_CACHE_MB) || 10; // 10MB per event

    // Staggered start configuration
    this.startupQueue = [];
    this.isStaggering = false;
    this.maxStaggerDelay = parseInt(process.env.MAX_STAGGER_DELAY) || 10000;

    // Sleep mode configuration
    this.isSleeping = false;
    this.sleepModeEnabled = (process.env.SLEEP_MODE_ENABLED !== 'false'); // Default: true
    this.sleepDelay = parseInt(process.env.SLEEP_MODE_DELAY) || 30000; // 30 seconds
    this.sleepTimer = null;
  }

  async initialize() {
    if (this.isInitialized) {
      console.warn('⚠️  EventManager already initialized');
      return;
    }

    try {
      // Use staggered load on startup to prevent connection pool exhaustion
      await this.loadEventsStaggered();
      this.isInitialized = true;
      console.log(`✅ EventManager initialized with ${this.events.size} active events`);
    } catch (error) {
      console.error('❌ EventManager initialization failed:', error.message);
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
            SQL_QUERY: { type: oracledb.STRING }  // Convert CLOB to string
          }
        }
      );

      this.stopAll();

      // Start timer for each active event
      for (const row of result.rows) {
        this.startEvent({
          eventId: row.EVENT_ID,
          eventName: row.EVENT_NAME,
          sqlQuery: row.SQL_QUERY,
          intervalSeconds: row.INTERVAL_SECONDS
        });
      }

      console.log(`📊 Loaded ${result.rows.length} active events from database`);

    } catch (error) {
      console.error('Error loading events:', error.message);
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
            SQL_QUERY: { type: oracledb.STRING }  // Convert CLOB to string
          }
        }
      );

      this.stopAll();

      const eventConfigs = result.rows.map(row => ({
        eventId: row.EVENT_ID,
        eventName: row.EVENT_NAME,
        sqlQuery: row.SQL_QUERY,
        intervalSeconds: row.INTERVAL_SECONDS
      }));

      if (eventConfigs.length === 0) {
        console.log('📊 No active events to load');
        return;
      }

      // Calculate stagger interval
      const smallestInterval = Math.min(...eventConfigs.map(e => e.intervalSeconds));
      const staggerDelay = Math.max(
        Math.min((smallestInterval * 1000) / eventConfigs.length, this.maxStaggerDelay / eventConfigs.length),
        500 // Minimum 500ms between starts
      );

      const totalStaggerTime = staggerDelay * eventConfigs.length;

      console.log(`🚀 EventManager starting with staggered load...`);
      console.log(`   Events to load: ${eventConfigs.length}`);
      console.log(`   Stagger interval: ${staggerDelay}ms`);
      console.log(`   Total stagger time: ~${totalStaggerTime}ms`);

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
        console.log(`✅ All ${eventConfigs.length} events started`);
      }, totalStaggerTime + 1000);

    } catch (error) {
      console.error('Error loading events with stagger:', error.message);
      this.isStaggering = false;
      // Fallback to immediate load
      console.warn('⚠️  Falling back to immediate load');
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
    const eventData = {
      config: config,
      timer: null,
      isRunning: false,
      lastDataHash: null,
      cachedData: null, // NEW: Store full query results
      cacheTimestamp: null, // NEW: When cache was last updated
      cacheSize: 0, // NEW: Byte size for monitoring
      cacheTruncated: false, // NEW: Flag if truncated due to size
      stats: {
        totalExecutions: 0,
        successCount: 0,
        errorCount: 0,
        lastExecutionTime: null,
        lastExecutionStatus: null,
        lastExecutionTimestamp: null,
        skippedCount: 0, // Skipped due to previous execution still running
        broadcasts: 0
      }
    };

    // Execute immediately on start
    this.executeEvent(eventId, eventData);

    // Set interval timer
    eventData.timer = setInterval(() => {
      this.executeEvent(eventId, eventData);
    }, intervalSeconds * 1000);

    this.events.set(eventId, eventData);

    console.log(`▶️  Started event: "${eventName}" (ID: ${eventId}) - Interval: ${intervalSeconds}s`);
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
    const eventData = {
      config: config,
      timer: null,
      isRunning: false,
      lastDataHash: null,
      cachedData: null,
      cacheTimestamp: null,
      cacheSize: 0,
      cacheTruncated: false,
      stats: {
        totalExecutions: 0,
        successCount: 0,
        errorCount: 0,
        lastExecutionTime: null,
        lastExecutionStatus: null,
        lastExecutionTimestamp: null,
        skippedCount: 0,
        broadcasts: 0
      }
    };

    this.events.set(eventId, eventData);

    // Execute immediately if requested (for staggered start)
    if (executeImmediately) {
      this.executeEvent(eventId, eventData);
    }

    // Set interval timer
    eventData.timer = setInterval(() => {
      this.executeEvent(eventId, eventData);
    }, intervalSeconds * 1000);

    console.log(`▶️  Started event: "${eventName}" (ID: ${eventId}) - Interval: ${intervalSeconds}s`);
  }

  /**
   * Execute event query and broadcast results
   */
  async executeEvent(eventId, eventData) {
    const { eventName, sqlQuery } = eventData.config;

    // Prevent overlap: Skip if previous execution still running
    if (eventData.isRunning) {
      eventData.stats.skippedCount++;
      console.warn(`⏭️  Skipping event "${eventName}" - Previous execution still running`);
      return;
    }

    eventData.isRunning = true;
    eventData.stats.totalExecutions++;
    const startTime = Date.now();

    const pool = getPool();
    let connection;

    try {
      connection = await pool.getConnection();

      const result = await connection.execute(
        sqlQuery,
        [],
        {
          outFormat: oracledb.OUT_FORMAT_OBJECT,
          maxRows: 50, // Limit result size
          fetchArraySize: 100
        }
      );

      const executionTime = Date.now() - startTime;
      const dataHash = crypto.createHash('md5').update(JSON.stringify(result.rows)).digest('hex');

      // Only broadcast if data has changed
      if (dataHash !== eventData.lastDataHash) {
        eventData.lastDataHash = dataHash;
        eventData.stats.broadcasts++;

        // NEW: Store cached data with memory management
        const dataString = JSON.stringify(result.rows);
        const dataSizeBytes = Buffer.byteLength(dataString, 'utf8');
        const maxSizeBytes = this.maxCacheSize * 1024 * 1024;

        if (dataSizeBytes > maxSizeBytes) {
          // Truncate to first 100 rows if exceeds limit
          eventData.cachedData = result.rows.slice(0, 100);
          eventData.cacheTruncated = true;
          eventData.cacheSize = Buffer.byteLength(JSON.stringify(eventData.cachedData), 'utf8');
          console.warn(`⚠️  Cache for "${eventName}" exceeds ${this.maxCacheSize}MB, truncated to 100 rows`);
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
          executionTime: executionTime
        };

        // Broadcast to all connected clients
        this.io.emit(this.getEventChannel(eventName), broadcastData);

        console.log(`✅ Event "${eventName}" executed and broadcasted (${executionTime}ms, ${result.rows.length} rows, cache: ${(eventData.cacheSize / 1024).toFixed(2)}KB)`);

      } else {
        console.log(`✅ Event "${eventName}" executed but data was unchanged (${executionTime}ms, ${result.rows.length} rows)`);
      }

      // Update stats (in memory only for success)
      eventData.stats.successCount++;
      eventData.stats.lastExecutionTime = executionTime;
      eventData.stats.lastExecutionStatus = 'success';
      eventData.stats.lastExecutionTimestamp = new Date();

      // REMOVED: Database write for success (now memory-only)
      // Success stats are kept in memory to reduce database writes by ~90%

    } catch (error) {
      const executionTime = Date.now() - startTime;

      eventData.stats.errorCount++;
      eventData.stats.lastExecutionTime = executionTime;
      eventData.stats.lastExecutionStatus = 'error';
      eventData.stats.lastExecutionTimestamp = new Date();

      // Update database stats
      await this.updateEventStats(eventId, executionTime, 'error');

      console.error(`❌ Event "${eventName}" execution failed:`, error.message);

      // Emit error to clients (without exposing sensitive error details)
      this.io.emit(this.getEventChannel(eventName), {
        eventName: eventName,
        error: true,
        message: 'Data temporarily unavailable',
        timestamp: new Date().toISOString()
      });

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
   * Update event execution stats in database (ERRORS ONLY)
   * Success stats are kept in memory only to reduce DB writes
   */
  async updateEventStats(eventId, executionTime, status) {
    // NEW: Only write to database on errors
    if (status !== 'error') {
      return; // Skip database write for success
    }

    const pool = getPool();
    let connection;

    try {
      connection = await pool.getConnection();

      await connection.execute(
        `UPDATE WS_EVENTS
         SET LAST_EXECUTION_TIME = :executionTime,
             LAST_EXECUTION_STATUS = :status,
             LAST_EXECUTION_TIMESTAMP = CURRENT_TIMESTAMP,
             UPDATED_AT = CURRENT_TIMESTAMP
         WHERE EVENT_ID = :eventId`,
        {
          executionTime: executionTime,
          status: status,
          eventId: eventId
        },
        { autoCommit: true }
      );

      console.warn(`⚠️  Error logged to database for event ${eventId}`);

    } catch (error) {
      console.error('Error updating event stats:', error.message);
      // Don't throw - error is already tracked in memory
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
      console.log(`⏸️  Stopped event ID: ${eventId}`);
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
    console.log('⏸️  All events stopped');
  }

  /**
   * Reload all events from database (for CRUD operations)
   */
  async reload() {
    console.log('🔄 Reloading events...');
    await this.loadEvents();
  }

  /**
   * Get event channel name for Socket.IO
   * Converts "Vessel Alongside" -> "VESSEL_ALONGSIDE"
   */
  getEventChannel(eventName) {
    return eventName.toUpperCase().replace(/\s+/g, '_');
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
        stats: eventData.stats
      });
    }

    return stats;
  }

  /**
   * Get specific event stats
   */
  getEventStats(eventId) {
    const eventData = this.events.get(eventId);
    return eventData ? {
      eventId: eventId,
      eventName: eventData.config.eventName,
      intervalSeconds: eventData.config.intervalSeconds,
      isRunning: eventData.isRunning,
      stats: eventData.stats
    } : null;
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
      age: eventData.cacheTimestamp ? Date.now() - eventData.cacheTimestamp.getTime() : null,
      truncated: eventData.cacheTruncated || false,
      cacheSize: eventData.cacheSize
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
        stats: {
          ...eventData.stats,
          cacheSize: eventData.cacheSize,
          cacheAge: eventData.cacheTimestamp ? Date.now() - eventData.cacheTimestamp.getTime() : null,
          cacheTruncated: eventData.cacheTruncated
        }
      });
    }

    return stats;
  }

  /**
   * Check sleep mode and wake/sleep accordingly based on client connections
   */
  checkSleepMode() {
    if (!this.sleepModeEnabled) return;

    const connectedClients = this.io.engine.clientsCount;

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

      this.sleepTimer = setTimeout(() => {
        // Double-check client count before sleeping
        if (this.io.engine.clientsCount === 0) {
          this.goToSleep();
        }
      }, this.sleepDelay);
    }

    // Cancel sleep timer if clients reconnect
    if (connectedClients > 0 && this.sleepTimer) {
      clearTimeout(this.sleepTimer);
      this.sleepTimer = null;
    }
  }

  /**
   * Put EventManager to sleep - pause all timers
   */
  goToSleep() {
    if (this.isSleeping) return;

    console.log('💤 Sleep mode activated - No clients connected');
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

    console.log('⏰ Waking up from sleep mode - Client connected');
    this.isSleeping = false;

    // Get all event configs
    const eventConfigs = [];
    for (const [eventId, eventData] of this.events.entries()) {
      eventConfigs.push(eventData.config);
    }

    if (eventConfigs.length === 0) {
      console.log('⚠️  No events to wake');
      return;
    }

    // Calculate stagger interval for wake-up
    const smallestInterval = Math.min(...eventConfigs.map(e => e.intervalSeconds));
    const staggerDelay = Math.max(
      Math.min((smallestInterval * 1000) / eventConfigs.length, this.maxStaggerDelay / eventConfigs.length),
      500
    );

    console.log(`▶️  Resuming ${eventConfigs.length} events with ${staggerDelay}ms stagger...`);

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
    }, (staggerDelay * eventConfigs.length) + 3000);
  }
}

module.exports = EventManager;
