import { useState, useEffect, useRef } from "react";
import { getSocket } from "../services/websocket";
import { eventsAPI } from "../services/api";
import Layout from "../components/Layout";
import { useToast } from "../components/Toast";
import config from "../config";

const BroadcastViewer = () => {
  const [events, setEvents] = useState([]);
  const [selectedEvent, setSelectedEvent] = useState(null);
  const [broadcasts, setBroadcasts] = useState([]);
  const [autoScroll, setAutoScroll] = useState(true);
  const [isPaused, setIsPaused] = useState(false);
  const [loading, setLoading] = useState(true);
  const broadcasterEndRef = useRef(null);
  const toast = useToast();

  useEffect(() => {
    fetchEvents();
  }, []);

  useEffect(() => {
    if (autoScroll && !isPaused) {
      broadcasterEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [broadcasts, autoScroll, isPaused]);

  useEffect(() => {
    if (!selectedEvent) return;

    const socket = getSocket();
    if (!socket) {
      toast.error("WebSocket not connected");
      return;
    }

    const channel = selectedEvent.EVENT_NAME.toUpperCase().replace(/\s+/g, "_");

    const handleBroadcast = (data) => {
      if (isPaused) return; // Don't add broadcasts if paused

      const broadcastItem = {
        ...data,
        receivedAt: new Date(),
        id: Date.now() + Math.random(),
        hasError: data.error || false,
      };

      setBroadcasts((prev) => {
        const newBroadcasts = [broadcastItem, ...prev];
        return newBroadcasts.slice(0, config.maxBroadcastHistory);
      });

      // Show toast for errors
      if (data.error) {
        toast.error(`Broadcast error: ${data.message || "Unknown error"}`);
      }
    };

    console.log(`📡 Listening to channel: ${channel}`);
    socket.on(channel, handleBroadcast);

    toast.info(`Monitoring "${selectedEvent.EVENT_NAME}"`);

    return () => {
      console.log(`📡 Stopped listening to: ${channel}`);
      socket.off(channel, handleBroadcast);
    };
  }, [selectedEvent, isPaused, toast]);

  const fetchEvents = async () => {
    try {
      const response = await eventsAPI.getAll();
      setEvents(response.data.data.filter((e) => e.IS_ACTIVE === 1));
    } catch (error) {
      toast.error("Failed to fetch events");
    } finally {
      setLoading(false);
    }
  };

  const handleEventChange = (eventId) => {
    const event = events.find((ev) => ev.EVENT_ID === parseInt(eventId));
    setSelectedEvent(event);
    setBroadcasts([]);
    setIsPaused(false);
  };

  const clearBroadcasts = () => {
    setBroadcasts([]);
    toast.info("Broadcast history cleared");
  };

  const formatTime = (date) => {
    return date.toLocaleTimeString("en-US", {
      hour12: false,
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
  };

  const formatDate = (date) => {
    return date.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
    });
  };

  if (loading) {
    return (
      <Layout>
        <div style={styles.loading}>Loading events...</div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div style={styles.header}>
        <div>
          <h1 style={styles.title}>🔴 Live Broadcast Monitor</h1>
          <p style={styles.subtitle}>
            Real-time WebSocket broadcast monitoring for IT operations
          </p>
        </div>
      </div>

      <div style={styles.controls}>
        <div style={styles.controlGroup}>
          <label style={styles.label}>Select Event:</label>
          <select
            value={selectedEvent?.EVENT_ID || ""}
            onChange={(e) => handleEventChange(e.target.value)}
            style={styles.select}
          >
            <option value="">Choose an event to monitor...</option>
            {events.map((event) => (
              <option key={event.EVENT_ID} value={event.EVENT_ID}>
                {event.EVENT_NAME} ({event.INTERVAL_SECONDS}s interval)
              </option>
            ))}
          </select>
        </div>

        {selectedEvent && (
          <div style={styles.controlActions}>
            <label style={styles.checkboxLabel}>
              <input
                type="checkbox"
                checked={autoScroll}
                onChange={(e) => setAutoScroll(e.target.checked)}
              />
              Auto-scroll
            </label>

            <label style={styles.checkboxLabel}>
              <input
                type="checkbox"
                checked={isPaused}
                onChange={(e) => setIsPaused(e.target.checked)}
              />
              Pause
            </label>

            <button onClick={clearBroadcasts} style={styles.clearBtn}>
              🗑️ Clear ({broadcasts.length})
            </button>
          </div>
        )}
      </div>

      {!selectedEvent ? (
        <div style={styles.empty}>
          <span style={styles.emptyIcon}>📡</span>
          <h3>No Event Selected</h3>
          <p>
            Select an event from the dropdown above to start monitoring
            broadcasts
          </p>
        </div>
      ) : broadcasts.length === 0 ? (
        <div style={styles.waiting}>
          <div style={styles.spinner}></div>
          <p>
            Waiting for broadcasts from{" "}
            <strong>"{selectedEvent.EVENT_NAME}"</strong>...
          </p>
          <small>
            Next broadcast expected in {selectedEvent.INTERVAL_SECONDS} seconds
          </small>
        </div>
      ) : (
        <div style={styles.broadcastContainer}>
          <div style={styles.broadcastList}>
            {broadcasts.map((broadcast, index) => (
              <div
                key={broadcast.id}
                style={{
                  ...styles.broadcastCard,
                  ...(broadcast.hasError ? styles.broadcastCardError : {}),
                  animation: index === 0 ? "slideDown 0.3s ease" : "none",
                }}
              >
                <div style={styles.broadcastHeader}>
                  <div style={styles.broadcastTime}>
                    <span style={styles.time}>
                      {formatTime(broadcast.receivedAt)}
                    </span>
                    <span style={styles.date}>
                      {formatDate(broadcast.receivedAt)}
                    </span>
                  </div>

                  <div style={styles.broadcastMeta}>
                    {broadcast.hasError ? (
                      <span style={styles.errorBadge}>❌ ERROR</span>
                    ) : (
                      <>
                        <span style={styles.metaItem}>
                          📊 {broadcast.rowCount} row
                          {broadcast.rowCount !== 1 ? "s" : ""}
                        </span>
                        <span style={styles.metaItem}>
                          ⚡ {broadcast.executionTime}ms
                        </span>
                        {broadcast.fromCache && (
                          <span style={styles.cacheBadge}>📦 Cached</span>
                        )}
                      </>
                    )}
                  </div>
                </div>

                {broadcast.hasError ? (
                  <div style={styles.errorMessage}>
                    <strong>Error Message:</strong>{" "}
                    {broadcast.message || "Unknown error occurred"}
                  </div>
                ) : (
                  <details style={styles.details}>
                    <summary style={styles.summary}>
                      📄 View Data ({broadcast.rowCount} rows)
                    </summary>
                    <pre style={styles.dataPreview}>
                      {JSON.stringify(broadcast.data, null, 2)}
                    </pre>
                  </details>
                )}
              </div>
            ))}
            <div ref={broadcasterEndRef} />
          </div>
        </div>
      )}
    </Layout>
  );
};

const styles = {
  header: {
    marginBottom: "30px",
  },
  title: {
    fontSize: "32px",
    fontWeight: "bold",
    color: "#333",
    margin: "0 0 8px 0",
  },
  subtitle: {
    fontSize: "15px",
    color: "#666",
    margin: 0,
  },
  controls: {
    background: "white",
    borderRadius: "12px",
    padding: "20px",
    marginBottom: "20px",
    boxShadow: "0 2px 8px rgba(0,0,0,0.1)",
    display: "flex",
    flexDirection: "column",
    gap: "15px",
  },
  controlGroup: {
    display: "flex",
    flexDirection: "column",
    gap: "8px",
  },
  label: {
    fontSize: "13px",
    fontWeight: "600",
    color: "#333",
  },
  select: {
    padding: "12px",
    fontSize: "14px",
    border: "2px solid #e0e0e0",
    borderRadius: "8px",
    background: "white",
    cursor: "pointer",
    transition: "border-color 0.2s",
    fontFamily: "inherit",
  },
  controlActions: {
    display: "flex",
    gap: "20px",
    alignItems: "center",
    paddingTop: "10px",
    borderTop: "1px solid #f0f0f0",
  },
  checkboxLabel: {
    display: "flex",
    alignItems: "center",
    gap: "6px",
    fontSize: "14px",
    cursor: "pointer",
    userSelect: "none",
  },
  clearBtn: {
    marginLeft: "auto",
    padding: "8px 16px",
    background: "#f44336",
    color: "white",
    border: "none",
    borderRadius: "6px",
    cursor: "pointer",
    fontSize: "13px",
    fontWeight: "600",
    transition: "background 0.2s",
  },
  empty: {
    padding: "80px 20px",
    textAlign: "center",
    background: "white",
    borderRadius: "12px",
    boxShadow: "0 2px 8px rgba(0,0,0,0.1)",
    color: "#666",
  },
  emptyIcon: {
    fontSize: "64px",
    display: "block",
    marginBottom: "20px",
  },
  waiting: {
    padding: "60px 20px",
    textAlign: "center",
    background: "linear-gradient(135deg, #fff3e0 0%, #ffe0b2 100%)",
    borderRadius: "12px",
    color: "#e65100",
    border: "2px dashed #ff9800",
  },
  spinner: {
    width: "40px",
    height: "40px",
    border: "4px solid #ffe0b2",
    borderTop: "4px solid #ff9800",
    borderRadius: "50%",
    animation: "spin 1s linear infinite",
    margin: "0 auto 20px",
  },
  broadcastContainer: {
    background: "white",
    borderRadius: "12px",
    padding: "20px",
    boxShadow: "0 2px 8px rgba(0,0,0,0.1)",
  },
  broadcastList: {
    display: "flex",
    flexDirection: "column",
    gap: "12px",
    maxHeight: "600px",
    overflowY: "auto",
    paddingRight: "10px",
  },
  broadcastCard: {
    background: "#f8f9fa",
    borderRadius: "10px",
    padding: "16px",
    border: "2px solid #e0e0e0",
    transition: "all 0.2s",
  },
  broadcastCardError: {
    background: "#ffebee",
    borderColor: "#f44336",
  },
  broadcastHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: "12px",
    flexWrap: "wrap",
    gap: "10px",
  },
  broadcastTime: {
    display: "flex",
    alignItems: "baseline",
    gap: "8px",
  },
  time: {
    fontWeight: "700",
    fontSize: "16px",
    color: "#333",
    fontFamily: "monospace",
  },
  date: {
    fontSize: "12px",
    color: "#999",
    fontWeight: "500",
  },
  broadcastMeta: {
    display: "flex",
    gap: "12px",
    alignItems: "center",
    flexWrap: "wrap",
  },
  metaItem: {
    fontSize: "13px",
    color: "#666",
    fontWeight: "500",
  },
  cacheBadge: {
    background: "#e3f2fd",
    color: "#1976d2",
    padding: "4px 10px",
    borderRadius: "12px",
    fontSize: "11px",
    fontWeight: "600",
  },
  errorBadge: {
    background: "#f44336",
    color: "white",
    padding: "6px 12px",
    borderRadius: "12px",
    fontSize: "12px",
    fontWeight: "700",
  },
  errorMessage: {
    background: "white",
    padding: "12px",
    borderRadius: "6px",
    color: "#c62828",
    fontSize: "14px",
    border: "1px solid #ffcdd2",
  },
  details: {
    marginTop: "10px",
  },
  summary: {
    cursor: "pointer",
    fontWeight: "600",
    color: "#667eea",
    fontSize: "13px",
    userSelect: "none",
    padding: "8px 0",
  },
  dataPreview: {
    marginTop: "10px",
    padding: "16px",
    background: "white",
    borderRadius: "8px",
    fontSize: "11px",
    fontFamily: "monospace",
    overflow: "auto",
    maxHeight: "300px",
    border: "1px solid #e0e0e0",
    color: "#333",
    lineHeight: "1.6",
  },
  loading: {
    padding: "40px",
    textAlign: "center",
    fontSize: "18px",
    color: "#666",
  },
};

// Add animations
if (
  typeof document !== "undefined" &&
  !document.querySelector("style[data-broadcast-animations]")
) {
  const style = document.createElement("style");
  style.setAttribute("data-broadcast-animations", "true");
  style.textContent = `
    @keyframes spin {
      0% { transform: rotate(0deg); }
      100% { transform: rotate(360deg); }
    }
    @keyframes slideDown {
      from {
        opacity: 0;
        transform: translateY(-20px);
      }
      to {
        opacity: 1;
        transform: translateY(0);
      }
    }
  `;
  document.head.appendChild(style);
}

export default BroadcastViewer;
