const express = require("express");
const { RateLimiterMemory } = require("rate-limiter-flexible");
const AppRegistry = require("../services/appRegistry");
const { generateToken } = require("../middleware/auth");
const router = express.Router();

/**
 * App token exchange — lets a registered app hand its browser pages a
 * short-lived, read-only socket token instead of the long-lived appSecret.
 *
 * Meant to be called SERVER-TO-SERVER (e.g. Eternal's /wsToken servlet).
 * The appSecret must never be sent from a browser.
 *
 *   POST /api/token
 *   { appId, appSecret, channels?: ["GATE_IN_FAIL", ...] }
 *   → { token, expiresIn, channels }
 *
 * `channels` is required and narrows the token to a subset of the app's allowed
 * channels (a public kiosk page only gets the channels it renders).
 */

// jsonwebtoken reads a bare number string as MILLISECONDS — use "10m"/"600s".
const TOKEN_TTL = process.env.APP_TOKEN_TTL || "10m";

// Brute-force guard on the secret check
const limiter = new RateLimiterMemory({ points: 30, duration: 60 });

router.post("/", async (req, res) => {
  try {
    await limiter.consume(req.ip);
  } catch (e) {
    return res.status(429).json({ success: false, message: "Too many requests" });
  }

  const { appId, appSecret, channels } = req.body || {};
  const result = AppRegistry.getInstance().validateApp(appId, appSecret);

  if (!result.valid) {
    console.warn(`[Token] App "${appId}" rejected: ${result.reason} (IP: ${req.ip})`);
    return res.status(401).json({ success: false, message: "Invalid app credentials" });
  }

  // A token without a channel list would carry the app's full access.
  if (!Array.isArray(channels) || channels.length === 0) {
    return res.status(400).json({ success: false, message: "channels array required" });
  }

  // Requested ∩ allowed. null allowed = unrestricted app.
  const allowed = result.app.channels;
  const requested = channels.map((c) => String(c).toUpperCase().replace(/\s+/g, "_"));
  const scoped = allowed ? requested.filter((c) => allowed.has(c)) : requested;

  const token = generateToken(
    { type: "app-token", appName: result.app.appName, channels: scoped, readonly: true },
    TOKEN_TTL,
  );

  res.json({ success: true, token, expiresIn: TOKEN_TTL, channels: scoped });
});

module.exports = router;
