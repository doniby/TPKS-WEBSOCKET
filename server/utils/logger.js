const fs = require("fs");
const path = require("path");

class Logger {
  constructor(options = {}) {
    this.logDir = options.logDir || path.join(__dirname, "../../logs");
    this.maxFileSize = options.maxFileSize || 10 * 1024 * 1024; // 10MB
    this.retentionDays = options.retentionDays || 7;
    this.minLogLevel = options.minLogLevel || (process.env.NODE_ENV === "production" ? "warn" : "debug");
    this.useConsole = options.useConsole !== false; // Log to console too

    this.levels = { debug: 0, info: 1, warn: 2, error: 3 };
    this.levelNames = { 0: "DEBUG", 1: "INFO", 2: "WARN", 3: "ERROR" };

    // Ensure log directory exists
    if (!fs.existsSync(this.logDir)) {
      fs.mkdirSync(this.logDir, { recursive: true });
    }

    // Cleanup old logs on startup
    this.cleanupOldLogs();
  }

  getLogFilePath(date = new Date()) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return path.join(this.logDir, `app-${year}-${month}-${day}.log`);
  }

  /**
   * Delete logs older than retentionDays
   */
  cleanupOldLogs() {
    try {
      const files = fs.readdirSync(this.logDir);
      const now = Date.now();
      const maxAge = this.retentionDays * 24 * 60 * 60 * 1000;

      files.forEach((file) => {
        const filePath = path.join(this.logDir, file);
        const stat = fs.statSync(filePath);
        if (now - stat.mtimeMs > maxAge) {
          fs.unlinkSync(filePath);
          console.log(`[Logger] Deleted old log: ${file}`);
        }
      });
    } catch (error) {
      console.error("[Logger] Cleanup failed:", error.message);
    }
  }

  /**
   * Format log message
   */
  formatMessage(level, message, meta = {}) {
    const timestamp = new Date().toISOString();
    const levelName = this.levelNames[this.levels[level]] || "INFO";

    let logLine = `${timestamp} [${levelName}] ${message}`;

    if (Object.keys(meta).length > 0) {
      logLine += ` | ${JSON.stringify(meta)}`;
    }

    return logLine;
  }

  /**
   * Write log to file
   */
  writeToFile(logLine) {
    try {
      const logPath = this.getLogFilePath();
      fs.appendFileSync(logPath, logLine + "\n", "utf8");
    } catch (error) {
      console.error("[Logger] Write failed:", error.message);
    }
  }

  /**
   * Log with level check
   */
  log(level, message, meta = {}) {
    // Skip if below min log level
    if (this.levels[level] < this.levels[this.minLogLevel]) {
      return;
    }

    const logLine = this.formatMessage(level, message, meta);

    // Write to file
    this.writeToFile(logLine);

    // Write to console (only if enabled and level >= warn in production)
    if (this.useConsole) {
      if (process.env.NODE_ENV === "production") {
        // In production, only console.error for errors, suppress debug/info
        if (level === "error") {
          console.error(logLine);
        } else if (level === "warn") {
          console.warn(logLine);
        }
      } else {
        // In development, log everything
        if (level === "error") {
          console.error(logLine);
        } else if (level === "warn") {
          console.warn(logLine);
        } else {
          console.log(logLine);
        }
      }
    }
  }

  debug(message, meta = {}) {
    this.log("debug", message, meta);
  }

  info(message, meta = {}) {
    this.log("info", message, meta);
  }

  warn(message, meta = {}) {
    this.log("warn", message, meta);
  }

  error(message, error = null, meta = {}) {
    const errorMeta = { ...meta };
    if (error) {
      errorMeta.error = {
        message: error.message,
        stack: error.stack,
        code: error.code,
      };
    }
    this.log("error", message, errorMeta);
  }
}

// Singleton instance
let loggerInstance = null;

function getLogger(options = {}) {
  if (!loggerInstance) {
    loggerInstance = new Logger(options);
  }
  return loggerInstance;
}

module.exports = { getLogger, Logger };
