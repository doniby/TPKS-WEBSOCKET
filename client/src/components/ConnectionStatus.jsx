import { useState, useEffect } from "react";
import { monitoringAPI } from "../services/api";

const ConnectionStatus = () => {
  const [clients, setClients] = useState(0);
  const [status, setStatus] = useState("loading");

  useEffect(() => {
    // Fetch client count periodically
    const fetchClientCount = async () => {
      try {
        const response = await monitoringAPI.getStats();
        setClients(response.data.data.websocket.connectedClients);
        setStatus("connected");
      } catch (err) {
        setStatus("error");
      }
    };

    fetchClientCount();
    const interval = setInterval(fetchClientCount, 5000);

    return () => {
      clearInterval(interval);
    };
  }, []);

  const statusConfig = {
    connected: {
      color: "#4caf50",
      bgColor: "rgba(76, 175, 80, 0.1)",
      text: "Server Online",
      icon: "●",
    },
    loading: {
      color: "#ff9800",
      bgColor: "rgba(255, 152, 0, 0.1)",
      text: "Connecting...",
      icon: "●",
    },
    error: {
      color: "#f44336",
      bgColor: "rgba(244, 67, 54, 0.1)",
      text: "Server Offline",
      icon: "●",
    },
  };

  const config = statusConfig[status];

  return (
    <div
      style={{
        ...styles.container,
        background: config.bgColor,
        borderLeft: `3px solid ${config.color}`,
      }}
    >
      <div style={styles.statusRow}>
        <span
          style={{
            ...styles.indicator,
            background: config.color,
            animation: status === "connected" ? "pulse 2s infinite" : "none",
          }}
        >
          {config.icon}
        </span>
        <div style={styles.statusText}>
          <div style={{ ...styles.statusLabel, color: config.color }}>
            {config.text}
          </div>
          {status === "connected" && clients > 0 && (
            <div style={styles.clientCount}>
              {clients} client{clients !== 1 ? "s" : ""} connected
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

const styles = {
  container: {
    padding: "12px 16px",
    borderRadius: "8px",
    transition: "all 0.3s ease",
  },
  statusRow: {
    display: "flex",
    alignItems: "center",
    gap: "10px",
  },
  indicator: {
    width: "10px",
    height: "10px",
    borderRadius: "50%",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: "8px",
    color: "white",
    flexShrink: 0,
    boxShadow: "0 0 10px currentColor",
  },
  statusText: {
    flex: 1,
  },
  statusLabel: {
    fontWeight: "600",
    fontSize: "13px",
    marginBottom: "2px",
  },
  clientCount: {
    fontSize: "11px",
    color: "rgba(255,255,255,0.7)",
    fontWeight: "400",
  },
};

// Add animations
if (
  typeof document !== "undefined" &&
  !document.querySelector("style[data-connection-animations]")
) {
  const style = document.createElement("style");
  style.setAttribute("data-connection-animations", "true");
  style.textContent = `
    @keyframes pulse {
      0%, 100% { opacity: 1; }
      50% { opacity: 0.6; }
    }
  `;
  document.head.appendChild(style);
}

export default ConnectionStatus;
