require('dotenv').config();
const oracledb = require('oracledb');

// --- ENABLE ORACLE 11g SUPPORT (Thick Mode) ---
try {
  if (!oracledb.oracleClientVersion) {
    const clientOpts = process.env.ORACLE_CLIENT_PATH
      ? { libDir: process.env.ORACLE_CLIENT_PATH }
      : {}; // When empty, rely on LD_LIBRARY_PATH (e.g. Docker)
    oracledb.initOracleClient(clientOpts);
  }
} catch (err) {
  console.error("Oracle Client Init Failed. Check ORACLE_CLIENT_PATH in .env");
  console.error(err);
  process.exit(1);
}

// --- SETUP CONNECTION TO DB ---
const dbConfig = {
  user: process.env.DB_USER,
  password: process.env.DB_PASS,

  connectString: `(DESCRIPTION=
    (ADDRESS=(PROTOCOL=TCP)(HOST=${process.env.DB_HOST})(PORT=${process.env.DB_PORT}))
    (CONNECT_DATA=(SID=${process.env.DB_SID}))
  )`,

  // Pool sizing — keep minimal idle connections
  poolMin: parseInt(process.env.DB_POOL_MIN) || 2,
  poolMax: parseInt(process.env.DB_POOL_MAX) || 20,
  poolIncrement: 1,

  // Connection lifecycle — prevent stale/zombie sessions
  poolTimeout: 300,        // Close idle connections after 5 minutes (in seconds)
  expireTime: 3600,        // Recycle connections after 1 hour (in seconds) — prevents long-lived stale sessions
  poolPingInterval: 60,    // Ping connection before reuse if idle > 60s — detects dead connections

  // Timeouts
  queueTimeout: 10000,     // Wait 10 seconds for connection before error

  // Statement caching — controls server-side cursor count per connection
  stmtCacheSize: 20,

  // Enable pool statistics for monitoring
  enableStatistics: true,
};

// --- CREATE CONNECTION POOL ---
let pool;

async function initializePool() {
  try {
    pool = await oracledb.createPool(dbConfig);
    console.log(`✅ Database Pool Created (Oracle 11g via SID)`);
    console.log(`   Pool size: ${dbConfig.poolMin}-${dbConfig.poolMax} connections`);
    console.log(`   Pool timeout: ${dbConfig.poolTimeout}s | Expire time: ${dbConfig.expireTime}s | Ping interval: ${dbConfig.poolPingInterval}s`);
    console.log(`   Statement cache: ${dbConfig.stmtCacheSize} | Statistics: ${dbConfig.enableStatistics}`);
    return pool;
  } catch (err) {
    console.error("❌ Database Connection Failed:", err.message);
    throw err;
  }
}

function getPool() {
  if (!pool) {
    throw new Error("Pool not initialized. Call initializePool() first.");
  }
  return pool;
}

async function closePool() {
  if (pool) {
    try {
      await pool.close(10); // 10 second timeout
      console.log('✅ Database pool closed');
    } catch (err) {
      console.error('Error closing database pool:', err.message);
    }
  }
}

// Get pool statistics (enhanced with lifecycle metrics)
function getPoolStats() {
  if (!pool) return null;

  const stats = {
    connectionsOpen: pool.connectionsOpen,
    connectionsInUse: pool.connectionsInUse,
    connectionsIdle: pool.connectionsOpen - pool.connectionsInUse,
    poolMin: pool.poolMin,
    poolMax: pool.poolMax,
    poolIncrement: pool.poolIncrement,
    // Lifecycle settings
    poolTimeout: pool.poolTimeout,
    poolPingInterval: pool.poolPingInterval,
    stmtCacheSize: pool.stmtCacheSize,
  };

  // Add detailed statistics if available
  try {
    if (pool.enableStatistics) {
      const poolStats = pool.getStatistics();
      if (poolStats) {
        stats.statistics = {
          totalConnectionRequests: poolStats.totalConnectionRequests,
          totalRequestsEnqueued: poolStats.totalRequestsEnqueued,
          totalFailedRequests: poolStats.totalFailedRequests,
          totalTimedOutRequests: poolStats.totalTimedOutRequests,
          maximumConnectionsEverOpen: poolStats.maximumConnectionsEverOpen,
          currentQueueLength: poolStats.currentQueueLength,
          averageGetTimeInMillis: poolStats.averageGetTimeInMillis,
        };
      }
    }
  } catch (e) {
    // Statistics not available (older oracledb version)
  }

  return stats;
}

// Log pool health (for periodic diagnostics)
function logPoolHealth() {
  if (!pool) return;

  const open = pool.connectionsOpen;
  const inUse = pool.connectionsInUse;
  const idle = open - inUse;

  console.log(`📊 Pool Health: open=${open} | inUse=${inUse} | idle=${idle} | min=${pool.poolMin} | max=${pool.poolMax}`);

  // Warn if pool is near exhaustion
  if (inUse >= pool.poolMax * 0.8) {
    console.warn(`⚠️  Pool near exhaustion: ${inUse}/${pool.poolMax} connections in use!`);
  }
}

module.exports = {
  initializePool,
  getPool,
  closePool,
  getPoolStats,
  logPoolHealth,
  oracledb
};
