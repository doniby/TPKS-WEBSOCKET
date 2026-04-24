const mqtt = require("mqtt");
const { getPool, oracledb } = require("../config/db");
const { getLogger } = require("../utils/logger");

class MqttBridge {
  constructor(io) {
    this.io = io;
    this.client = null;
    this.connected = false;
    this.brokerUrl = process.env.MQTT_URL || "ws://10.130.0.240:49001/mqtt";
    this.subscribedTopics = new Set();
    this.logger = getLogger();
  }

  async start() {
    const topics = await this.loadTopicsFromDB();

    this.client = mqtt.connect(this.brokerUrl, this.buildConnectionOptions());

    this.client.on("connect", () => {
      this.connected = true;
      this.logger.info(`MQTT Connected: ${this.brokerUrl}`);
      this.subscribeTopics(topics);
    });

    this.client.on("message", (topic, payloadBuffer) => {
      const payloadText = payloadBuffer.toString("utf8");
      let payload;

      try {
        payload = JSON.parse(payloadText);
      } catch (error) {
        this.logger.warn(`MQTT Non-JSON payload skipped`, { topic: topic });
        return;
      }

      const channel = this.topicToChannel(topic);
      const message = {
        eventName: channel,
        source: "mqtt",
        topic,
        data: payload,
        timestamp: new Date().toISOString(),
      };

      let sentCount = 0;
      let failCount = 0;
      for (const [, socket] of this.io.sockets.sockets) {
        if (!socket.user?.channels || socket.user.channels.has(channel)) {
          try {
            socket.emit(channel, message);
            sentCount++;
          } catch (error) {
            this.logger.error("MQTT broadcast failed:", error, {
              socketId: socket.id,
              topic: topic,
              channel: channel,
            });
            failCount++;
          }
        }
      }

      if (sentCount > 0 || failCount > 0) {
        this.logger.debug(`MQTT broadcasted`, {
          topic: topic,
          channel: channel,
          sent: sentCount,
          failed: failCount,
        });
      }
    });

    this.client.on("reconnect", () => {
      this.logger.debug("MQTT Reconnecting");
    });

    this.client.on("close", () => {
      this.connected = false;
      this.logger.debug("MQTT Disconnected");
    });

    this.client.on("offline", () => {
      this.logger.warn("MQTT Offline");
    });

    this.client.on("end", () => {
      this.logger.debug("MQTT Ended");
    });

    this.client.on("error", (err) => {
      this.logger.error("[MQTT] Connection Error:", err, {
        code: err.code,
        reasonCode: err.reasonCode,
      });
    });
  }

  stop() {
    if (!this.client) {
      return;
    }

    this.client.end(true);
    this.client = null;
    this.connected = false;
    this.subscribedTopics.clear();
  }

  /**
   * Load active topic filters from WS_MQTT_TOPICS.
   * Falls back to MQTT_TOPIC_FILTER env var (or "#") if table is empty/missing.
   */
  async loadTopicsFromDB() {
    const pool = getPool();
    let connection;

    try {
      connection = await pool.getConnection();
      const result = await connection.execute(
        `SELECT TOPIC_ID, TOPIC_FILTER
           FROM WS_MQTT_TOPICS
          WHERE IS_ACTIVE = 1
          ORDER BY TOPIC_ID`,
        [],
        { outFormat: oracledb.OUT_FORMAT_OBJECT }
      );

      if (result.rows.length === 0) {
        const fallback = process.env.MQTT_TOPIC_FILTER || "#";
        this.logger.warn(
          `No active topics in WS_MQTT_TOPICS, using fallback: ${fallback}`
        );
        return [fallback];
      }

      return result.rows.map((r) => r.TOPIC_FILTER);
    } catch (error) {
      const fallback = process.env.MQTT_TOPIC_FILTER || "#";
      this.logger.warn(
        `Failed to load topics from DB (${error.message}), using fallback: ${fallback}`,
        error
      );
      return [fallback];
    } finally {
      if (connection) {
        try {
          await connection.close();
        } catch (e) {}
      }
    }
  }

  subscribeTopics(topics) {
    for (const filter of topics) {
      this.client.subscribe(filter, (err) => {
        if (err) {
          this.logger.error(`MQTT Subscribe failed`, { topic: filter }, err);
          return;
        }
        this.subscribedTopics.add(filter);
        this.logger.debug(`MQTT Subscribed: ${filter}`);
      });
    }
  }

  /**
   * Unsubscribe from all current topics and re-subscribe based on DB state.
   * Called after admin adds/removes/toggles a topic.
   */
  async reload() {
    if (!this.client || !this.connected) {
      throw new Error("MQTT client is not connected");
    }

    const previous = Array.from(this.subscribedTopics);
    if (previous.length > 0) {
      await new Promise((resolve) => {
        this.client.unsubscribe(previous, (err) => {
          if (err) this.logger.warn("MQTT Unsubscribe warning:", err);
          resolve();
        });
      });
      this.subscribedTopics.clear();
    }

    const topics = await this.loadTopicsFromDB();
    this.subscribeTopics(topics);

    return topics;
  }

  getStatus() {
    return {
      connected: this.connected,
      brokerUrl: this.brokerUrl,
      subscribedTopics: Array.from(this.subscribedTopics),
    };
  }

  topicToChannel(topic) {
    return topic
      .trim()
      .replace(/^\/+/, "")
      .toUpperCase()
      .replace(/[\/\s-]+/g, "_")
      .replace(/^_+|_+$/g, "");
  }

  buildConnectionOptions() {
    return {
      protocolVersion: Number(process.env.MQTT_PROTOCOL_VERSION) || 4,
      clientId:
        process.env.MQTT_CLIENT_ID ||
        `tpks-websocket-${Math.random().toString(16).slice(2, 10)}`,
      username: process.env.MQTT_USERNAME || "admin",
      password: process.env.MQTT_PASSWORD || "admin",
      reconnectPeriod: Number(process.env.MQTT_RECONNECT_PERIOD) || 3000,
      connectTimeout: Number(process.env.MQTT_CONNECT_TIMEOUT) || 10000,
      keepalive: Number(process.env.MQTT_KEEPALIVE) || 60,
      clean: true,
    };
  }
}

module.exports = MqttBridge;
