# Logging Configuration & Production Optimization

## Overview

The TPKS WebSocket Server now includes:
- **File-based logging** with daily rotation
- **Configurable log levels** to minimize production noise
- **Error capture** for unlogged failures (socket.emit, database, MQTT)
- **Log retention** policy (default: 7 days)

## Log Levels

Set `LOG_LEVEL` in your `.env` or Docker environment:

| Level | What's Logged | Use Case |
|-------|---------------|----------|
| `debug` | Everything | Local development |
| `info` | Info + warnings + errors | Development debugging |
| `warn` | Warnings + errors | **Production (recommended)** |
| `error` | Errors only | Critical production |

## Configuration

### Environment Variables

```env
# Log level (debug, info, warn, error)
LOG_LEVEL=warn

# Node environment (automatically sets production defaults)
NODE_ENV=production
```

### Docker Deployment

The docker-compose.yml now includes:

```yaml
volumes:
  - ./logs:/app/logs              # Log files persisted to host
environment:
  - LOG_LEVEL=${LOG_LEVEL:-warn}  # Default: warn
```

### Volume Mounting

To access logs from your Portainer container:

1. **In Docker Compose**: Logs are stored in `./logs/` directory relative to docker-compose.yml
2. **View logs**: 
   ```bash
   docker compose logs -f tpks-websocket
   ```
3. **Access log files**:
   ```bash
   ls -la logs/
   cat logs/app-2026-04-24.log
   ```

## What Changed

### Before (Issues)
- ❌ All console.log statements went to stdout (unbounded growth)
- ❌ Socket.emit failures were silent (unlogged)
- ❌ No error middleware for Express
- ❌ MQTT errors not fully captured
- ❌ Health check failures due to excessive logging

### After (Fixed)
- ✅ File-based logging with daily rotation
- ✅ Configurable log levels for production
- ✅ Socket.emit errors now caught and logged
- ✅ Express error middleware added
- ✅ Socket.io error handlers added
- ✅ MQTT errors logged to file
- ✅ Daily cleanup of old logs (7-day retention)

## Production Recommendations

### For Portainer Deployment

1. **Set LOG_LEVEL to "warn"** (excludes debug/info spam):
   ```
   LOG_LEVEL=warn
   ```

2. **Mount logs volume** in Portainer:
   - Add volume: `/app/logs`
   - Points to container path for persistent storage

3. **Monitor log files**:
   ```bash
   # Check log file size (max 10MB per day before rotation)
   du -sh logs/

   # Follow real-time logs
   tail -f logs/app-*.log

   # Search for errors
   grep ERROR logs/*.log
   ```

4. **Container Restart**: 
   - Health check still uses `/health` endpoint
   - Logs are persisted even after container restart

## Daily Log Files

Logs are automatically split by day:

```
logs/
├── app-2026-04-24.log  (Today)
├── app-2026-04-23.log  (Yesterday)
└── app-2026-04-22.log  (Older)
```

- **Rotation**: Automatic at midnight (UTC)
- **Retention**: 7 days (configurable via `retentionDays` in logger.js)
- **Max size**: 10MB per day (soft limit, doesn't prevent writes)

## Troubleshooting

### Failure Counts Increasing in Portainer?

Check the logs for:

```bash
# Health check failures
grep "health" logs/app-*.log

# Socket connection errors
grep "Socket Error" logs/app-*.log

# MQTT connection issues
grep "MQTT.*Error" logs/app-*.log

# Database connection pool exhaustion
grep "Pool near exhaustion" logs/app-*.log
```

### How to Enable Debug Logging

Temporarily increase verbosity:

```env
LOG_LEVEL=debug
```

This will log:
- All connection details
- All broadcast events
- Query execution times
- Socket.emit success/failure

### Memory Issues After Restart?

If logs are consuming too much disk:

```bash
# Check log directory size
du -sh logs/

# Remove old logs manually
rm logs/app-2026-04-*.log  # Keep only recent

# Adjust retention in logger.js
# Change: retentionDays: 7  (to 3 for shorter retention)
```

## Log Output Examples

### Production (LOG_LEVEL=warn)

```
2026-04-24T10:30:45.123Z [WARN] Rate limit exceeded for IP: 192.168.1.100
2026-04-24T10:31:10.456Z [ERROR] Socket Error: { socketId: 'abc123', channel: 'VESSEL_ALONGSIDE' }
2026-04-24T10:32:15.789Z [ERROR] Event "Vessel Alongside" execution failed: connection timeout
```

### Development (LOG_LEVEL=debug)

```
2026-04-24T10:30:45.123Z [DEBUG] Client connected: socket123 | App: ETERNAL | Channels: [VESSEL_ALONGSIDE] | Total: 5
2026-04-24T10:30:46.234Z [INFO] Event "Vessel Alongside" executed and broadcasted (234ms, 42 rows, cache: 2.34KB)
2026-04-24T10:30:50.567Z [WARN] Rate limit exceeded for IP: 192.168.1.100
```

## Console vs File Logging

- **Console**: Production only logs warnings and errors to reduce visual noise
- **File**: All logs at configured level are written to file for analysis
- **Dev**: Console shows everything for easy debugging

## Health Check Status

The `/health` endpoint now logs failures:

```bash
curl http://localhost:3000/health
# Response: { "status": "ok", "timestamp": "2026-04-24T10:30:45.123Z", "uptime": 3600 }
```

If Portainer health checks fail, check logs:
```bash
grep "health\|Health" logs/app-*.log
```

## Next Steps

1. **Restart container** with `LOG_LEVEL=warn`
2. **Monitor logs** for 24 hours to catch failures
3. **Adjust LOG_LEVEL** based on verbosity needs
4. **Set up alerts** if specific errors appear in logs

---

For more details, see the logger implementation in `server/utils/logger.js`.
