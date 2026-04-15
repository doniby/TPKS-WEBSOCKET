require("dotenv").config();
const express = require("express");
const http = require("http");
const helmet = require("helmet");
const { Server } = require("socket.io");
const { RateLimiterMemory } = require("rate-limiter-flexible");
const path = require("path");

const { initializePool, closePool, logPoolHealth } = require("./config/db");
const { authenticateSocket } = require("./middleware/auth");
const EventManager = require("./services/eventManager");
const AppRegistry = require("./services/appRegistry");

// Import API routes
const apiAuth = require("./routes/api-auth");
const apiEvents = require("./routes/api-events");
const apiMonitoring = require("./routes/api-monitoring");
const apiApps = require("./routes/api-apps");

const app = express();

// --- MIDDLEWARE ---
// Helmet security headers - configure for non-HTTPS environment
app.use(
  helmet({
    contentSecurityPolicy: false, // Disable CSP (can cause asset loading issues)
    hsts: false, // Disable HSTS (forces HTTPS)
    crossOriginEmbedderPolicy: false,
    crossOriginOpenerPolicy: false,
  })
);
app.disable("x-powered-by");

// Parse JSON bodies
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true }));

// CORS for API endpoints (allow React dev server)
app.use((req, res, next) => {
  const allowedOrigins = process.env.ALLOWED_ORIGINS
    ? process.env.ALLOWED_ORIGINS.split(",")
    : ["http://localhost:3000", "http://localhost:5173"];

  const origin = req.headers.origin;

  const host = req.headers.host;
  const isSameOrigin =
    origin && (origin === `http://${host}` || origin === `https://${host}`);

  if (allowedOrigins.includes(origin) || isSameOrigin) {
    res.setHeader("Access-Control-Allow-Origin", origin);
  }

  res.setHeader(
    "Access-Control-Allow-Methods",
    "GET, POST, PUT, DELETE, PATCH, OPTIONS"
  );
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  res.setHeader("Access-Control-Allow-Credentials", "true");

  if (req.method === "OPTIONS") {
    return res.sendStatus(200);
  }

  next();
});

// --- API ROUTES ---
app.use("/api/admin", apiAuth);
app.use("/api/events", apiEvents);
app.use("/api/monitoring", apiMonitoring);
app.use("/api/apps", apiApps);

// Basic health check (no auth required)
app.get("/health", (req, res) => {
  res.json({
    status: "ok",
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
  });
});

// Serve React admin UI in production
if (process.env.NODE_ENV === "production") {
  const clientBuildPath = path.join(__dirname, "../client/dist");
  app.use("/admin", express.static(clientBuildPath));

  // Use regex to catch all /admin/* routes for client-side routing
  app.get(/^\/admin(?:\/.*)?$/, (req, res) => {
    res.sendFile(path.join(clientBuildPath, "index.html"));
  });
}

// Default route
app.get("/", (req, res) => {
  res.json({
    name: "TPKS Dashboard WebSocket Server",
    version: "1.0.0",
    status: "running",
    endpoints: {
      health: "/health",
      admin: "/admin",
      api: "/api",
    },
  });
});

const server = http.createServer(app);

// --- WEBSOCKET CONFIGURATION ---
const allowedOrigins = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(",")
  : ["http://localhost:3000", "http://localhost:5173", "http://localhost:8080"];

const io = new Server(server, {
  cors: {
    origin: allowedOrigins,
    methods: ["GET", "POST"],
    credentials: true,
  },
  maxHttpBufferSize: 1e6,
  pingTimeout: 60000,
  pingInterval: 15000,
  connectionStateRecovery: {
    maxDisconnectionDuration: 2 * 60 * 1000,
  },
});

// --- RATE LIMITING ---
const rateLimiter = new RateLimiterMemory({
  points: parseInt(process.env.RATE_LIMIT_POINTS) || 10,
  duration: parseInt(process.env.RATE_LIMIT_DURATION) || 1,
});

const connectionLimiter = new RateLimiterMemory({
  points: 1,
  duration: 10,
});

// Track active connections
let activeConnections = 0;
const MAX_CONNECTIONS = parseInt(process.env.MAX_CONNECTIONS) || 100;

// --- WEBSOCKET AUTHENTICATION ---
io.use(authenticateSocket);

// --- CONNECTION RATE LIMITING ---
io.use(async (socket, next) => {
  const ip = socket.handshake.address;

  try {
    await connectionLimiter.consume(ip);
    next();
  } catch (error) {
    console.warn(`⚠️  Rate limit exceeded for IP: ${ip}`);
    next(new Error("Too many connection attempts. Please try again later."));
  }
});

// --- WEBSOCKET CONNECTION HANDLER ---
io.on("connection", (socket) => {
  activeConnections++;

  // Check connection limit
  if (activeConnections > MAX_CONNECTIONS) {
    console.warn(
      `⚠️  Max connections reached (${MAX_CONNECTIONS}). Rejecting connection.`
    );
    socket.emit("error", { message: "Server at capacity" });
    socket.disconnect(true);
    activeConnections--;
    return;
  }

  // Build identity string for logging
  const identity = socket.user?.appName || socket.user?.userId || socket.user?.type || "unknown";
  const channelInfo = socket.user?.channels ? `[${[...socket.user.channels].join(",")}]` : "[ALL]";

  console.log(
    "✅ User connected:",
    socket.id,
    `| App: ${identity}`,
    `| Channels: ${channelInfo}`,
    `| Total: ${activeConnections}`
  );

  // Check sleep mode on connection
  const eventManager = app.get("eventManager");
  if (eventManager) {
    console.log(`🔄 Client connected, checking sleep mode...`);
    eventManager.checkSleepMode();
  }

  // Handle client request for updates
  socket.on("REQUEST_UPDATE", async (data) => {
    try {
      await rateLimiter.consume(socket.id);

      if (data && typeof data === "object") {
        // Client requested update - handled by event manager broadcasts
        console.log("Client requested update:", socket.id);
      }
    } catch (error) {
      if (error instanceof Error) {
        socket.emit("error", { message: "Request rate limit exceeded" });
      }
    }
  });

  // Handle client request for initial cached state (Data Hydration)
  socket.on("REQUEST_INITIAL_STATE", async (data) => {
    try {
      await rateLimiter.consume(socket.id);

      const eventManager = app.get("eventManager");

      // Require client to specify event names
      if (
        !data?.eventNames ||
        !Array.isArray(data.eventNames) ||
        data.eventNames.length === 0
      ) {
        socket.emit("error", {
          message: "eventNames array required",
          example: { eventNames: ["Vessel Alongside"] },
        });
        return;
      }

      // Send only requested events (with channel authorization check)
      for (const eventName of data.eventNames) {
        const channel = eventManager.getEventChannel(eventName);

        // Channel authorization: skip channels the app is not allowed to receive
        if (socket.user?.channels && !socket.user.channels.has(channel)) {
          console.warn(
            `⚠️  App "${socket.user.appName}" not authorized for channel "${channel}" — skipping`
          );
          continue;
        }

        const cached = eventManager.getCachedDataByName(eventName);
        if (cached) {
          socket.emit(channel, {
            eventName: eventName,
            data: cached.data,
            rowCount: cached.rowCount,
            timestamp: cached.timestamp.toISOString(),
            fromCache: true,
            cacheAge: cached.age,
          });
          console.log(
            `📦 Sent cached "${eventName}" to ${socket.id} (${cached.age}ms old)`
          );
        } else {
          console.warn(
            `⚠️  No cache found for "${eventName}", triggering immediate query...`
          );
          // Trigger immediate execution for this event
          const triggered = await eventManager.triggerEventByName(eventName);
          if (!triggered) {
            console.error(`❌ Failed to trigger event: "${eventName}"`);
          }
        }
      }
    } catch (error) {
      if (error instanceof Error) {
        socket.emit("error", { message: "Request rate limit exceeded" });
      }
    }
  });

  // Disconnect handler
  socket.on("disconnect", (reason) => {
    activeConnections--;
    console.log(
      "❌ User disconnected:",
      socket.id,
      `| Reason: ${reason}`,
      `| Total: ${activeConnections}`
    );

    // Check sleep mode on disconnect
    const eventManager = app.get("eventManager");
    if (eventManager) {
      console.log(`🔄 Client disconnected, checking sleep mode...`);
      eventManager.checkSleepMode();
    }
  });
});

// --- STARTUP SEQUENCE ---
async function startApp() {
  try {
    // 1. Initialize database pool
    await initializePool();

    // 2. Initialize App Registry (must be before EventManager)
    const appRegistry = new AppRegistry();
    await appRegistry.initialize();

    // 3. Initialize EventManager
    const eventManager = new EventManager(io);
    await eventManager.initialize();

    // Make eventManager, appRegistry and io available to routes
    app.set("eventManager", eventManager);
    app.set("appRegistry", appRegistry);
    app.set("io", io);

    // 4. Start server
    const PORT = process.env.PORT || 3000;
    const HOST = process.env.HOST || "0.0.0.0"; // Bind to all interfaces
    server.listen(PORT, HOST, () => {
      console.log(`\n${"=".repeat(60)}`);
      console.log(`🚀 TPKS Dashboard WebSocket Server`);
      console.log(`${"=".repeat(60)}`);
      console.log(`📍 Port: ${PORT}`);
      console.log(`📍 Environment: ${process.env.NODE_ENV || "development"}`);
      console.log(`🔒 Allowed origins: ${allowedOrigins.join(", ")}`);
      console.log(`🔐 Registered apps: ${appRegistry.apps.size}`);
      console.log(`📊 Active events: ${eventManager.events.size}`);
      console.log(`${"=".repeat(60)}\n`);
    });

    // 4. Start periodic pool health monitoring (every 5 minutes)
    setInterval(() => {
      logPoolHealth();
    }, 5 * 60 * 1000);
  } catch (error) {
    console.error("❌ Startup failed:", error.message);
    process.exit(1);
  }
}

// --- GRACEFUL SHUTDOWN ---
async function gracefulShutdown(signal) {
  console.log(`\n${signal} received, closing server gracefully...`);

  // Stop accepting new connections
  server.close(() => {
    console.log("✅ HTTP server closed");
  });

  // Stop event manager
  const eventManager = app.get("eventManager");
  if (eventManager) {
    eventManager.stopAll();
    console.log("✅ Event manager stopped");
  }

  // Close database pool
  await closePool();

  console.log("✅ Graceful shutdown complete");
  process.exit(0);
}

process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
process.on("SIGINT", () => gracefulShutdown("SIGINT"));

// --- CRASH HANDLERS (prevent orphaned DB sessions) ---
process.on("uncaughtException", async (error) => {
  console.error("💥 Uncaught Exception:", error.message);
  console.error(error.stack);
  try {
    const eventManager = app.get("eventManager");
    if (eventManager) eventManager.stopAll();
    await closePool();
  } catch (e) {
    console.error("Error during crash cleanup:", e.message);
  }
  process.exit(1);
});

process.on("unhandledRejection", (reason, promise) => {
  console.error("💥 Unhandled Rejection at:", promise, "reason:", reason);
  // Don't exit — just log. The pool ping will handle stale connections.
});

// Start the application
startApp();
