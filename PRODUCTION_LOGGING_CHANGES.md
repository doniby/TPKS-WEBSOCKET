# TPKS-WebSocket Production Logging & Failure Capture - Changes Summary

## Problem Identified

Your Portainer container showed increasing failure counts but no visible errors in logs. This was caused by:

1. **Socket.emit failures silent** - Broadcasting to clients could fail without logging
2. **No centralized logging** - All console.log went to stdout with no rotation → memory bloat
3. **Missing error handlers** - Socket.io, Express, and async errors weren't caught
4. **Excessive logging in production** - Slowed down health checks, caused timeouts

## Solutions Implemented

### 1. **New Logger Service** (`server/utils/logger.js`)
- File-based logging with daily rotation
- Configurable log levels: `debug`, `info`, `warn`, `error`
- Automatic cleanup of logs older than 7 days
- Production mode: Only `warn`/`error` to console (reduces noise)
- Development mode: All logs to console (easier debugging)

### 2. **Error Handlers Added**

#### Express Error Middleware (server.js:105)
```javascript
app.use((err, req, res, next) => {
  logger.error("Express Error:", err, { url: req.url, method: req.method });
  res.status(err.status || 500).json({ error: "Internal Server Error" });
});
```

#### Socket.io Error Handlers (server.js:131)
```javascript
io.on("error", (error) => logger.error("Socket.io Server Error:", error));
io.on("connect_error", (error) => logger.error("Connection Error:", error));
// Plus per-socket error handler on connection
socket.on("error", (error) => logger.error("Socket Error:", error));
```

#### Process Error Handlers (server.js:392)
```javascript
process.on("uncaughtException", async (error) => {
  logger.error("Uncaught Exception:", error);
  // Cleanup and exit
});

process.on("unhandledRejection", (reason) => {
  logger.error("Unhandled Rejection:", reason);
  // Continue running but log it
});
```

### 3. **Safe Broadcasting** (eventManager.js)
Added `safeBroadcast()` method to catch socket.emit failures:

```javascript
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
```

Updated both success and error broadcasts to use this method.

### 4. **MQTT Error Logging** (mqttBridge.js)
- Wrapped socket.emit calls in try-catch
- Now reports failed/sent counts
- Logs MQTT connection errors to file

### 5. **Docker & Environment Configuration**

#### docker-compose.yml
- Added `LOG_LEVEL` environment variable (default: `warn`)
- Added volume mount for logs: `./logs:/app/logs`
- Logs persist across container restarts

#### .env.example
- Added `LOG_LEVEL=warn` documentation
- Updated NODE_ENV guidance

### 6. **Documentation** (`LOGGING.md`)
- Complete guide for production optimization
- Log file locations and retention policy
- Troubleshooting steps for failure counts
- Examples of log output at different levels

## Files Changed

| File | Changes |
|------|---------|
| `server/server.js` | Added logger init, error handlers, socket.io error handling |
| `server/utils/logger.js` | **NEW** - Logger service with rotation |
| `server/services/eventManager.js` | Added safeBroadcast(), logger injection |
| `server/services/mqttBridge.js` | Added error handling, logger, safe emit |
| `server/services/appRegistry.js` | Added logger injection |
| `docker-compose.yml` | Added LOG_LEVEL env var, logs volume |
| `.env.example` | Added LOG_LEVEL documentation |
| `LOGGING.md` | **NEW** - Production logging guide |

## How to Use

### For Portainer Deployment

1. **Update your environment in Portainer**:
   ```
   LOG_LEVEL=warn
   ```

2. **Add volume mount**:
   - Container path: `/app/logs`
   - Host path: wherever you want logs stored

3. **Restart container** and monitor logs:
   ```bash
   docker compose logs -f tpks-websocket
   cat logs/app-2026-04-24.log
   ```

### Log Levels

- `warn` (production default) - Warnings & errors only
- `debug` (development default) - Everything
- `error` - Only critical failures
- `info` - Debug + informational messages

### Where Logs Go

```
logs/
├── app-2026-04-24.log  (Today, rotated daily)
├── app-2026-04-23.log  (Yesterday)
└── app-2026-04-22.log  (Older)
```

- Auto-deleted after 7 days
- Persisted to disk (survives container restarts)

## What Gets Logged Now

### Before (Lost)
- ❌ Socket.emit failures → Silent
- ❌ Express errors → No global handler
- ❌ Async rejections → Unhandled
- ❌ MQTT broadcast failures → No tracking

### After (Captured)
- ✅ Socket.emit failures → Logged with socket ID
- ✅ Express errors → Caught by middleware
- ✅ Async rejections → Logged and tracked
- ✅ MQTT failures → Logged with count
- ✅ Socket.io errors → Logged with details
- ✅ Database errors → Still logged as before

## Production Benefits

| Issue | Before | After |
|-------|--------|-------|
| Unlogged failures | ❌ Silent | ✅ Logged |
| Log file growth | ❌ Unbounded | ✅ Daily rotation |
| Console spam | ❌ Verbose | ✅ Configurable |
| Health check | ❌ May timeout | ✅ Fast |
| Portainer failures | ❌ Unknown cause | ✅ Visible in logs |
| Error investigation | ❌ Difficult | ✅ Easy (file-based logs) |

## Testing

To verify everything works:

```bash
# Development (debug logs to console + files)
npm run dev
LOG_LEVEL=debug npm run dev

# Check logs created
ls -la logs/

# Follow logs in real-time
tail -f logs/app-*.log

# Search for errors
grep ERROR logs/app-*.log
```

## Migration Notes

- **No breaking changes** - Existing functionality unchanged
- **Backward compatible** - Works with old .env files
- **Optional volume mount** - Logs work even without volume
- **Graceful degradation** - If /logs unavailable, still works (just slower)

---

**See `LOGGING.md` for detailed configuration and troubleshooting.**
