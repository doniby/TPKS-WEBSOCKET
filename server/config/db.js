require('dotenv').config();
const oracledb = require('oracledb');

// --- ENABLE ORACLE 11g SUPPORT (Thick Mode) ---
try {
  if (!oracledb.oracleClientVersion) {
    oracledb.initOracleClient({ libDir: process.env.ORACLE_CLIENT_PATH });
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
  // Increased pool size for multiple concurrent events
  poolMin: parseInt(process.env.DB_POOL_MIN) || 5,
  poolMax: parseInt(process.env.DB_POOL_MAX) || 30,
  poolIncrement: 2,
  poolTimeout: 60, // Close idle connections after 60 seconds
  queueTimeout: 10000 // Wait 10 seconds for connection before error
};

// --- CREATE CONNECTION POOL ---
let pool;

async function initializePool() {
  try {
    pool = await oracledb.createPool(dbConfig);
    console.log(`✅ Database Pool Created (Oracle 11g via SID)`);
    console.log(`   Pool size: ${dbConfig.poolMin}-${dbConfig.poolMax} connections`);
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

// Get pool statistics
function getPoolStats() {
  if (!pool) return null;

  return {
    connectionsOpen: pool.connectionsOpen,
    connectionsInUse: pool.connectionsInUse,
    poolMin: pool.poolMin,
    poolMax: pool.poolMax,
    poolIncrement: pool.poolIncrement
  };
}

module.exports = {
  initializePool,
  getPool,
  closePool,
  getPoolStats,
  oracledb
};
