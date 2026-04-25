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
      dotClass: "success",
      text: "Server Online",
    },
    loading: {
      dotClass: "warn",
      text: "Connecting...",
    },
    error: {
      dotClass: "error",
      text: "Server Offline",
    },
  };

  const config = statusConfig[status];

  return (
    <div className="status-chip">
      <span className={`status-dot ${config.dotClass}`} />
      <div>
        <div>{config.text}</div>
        {status === "connected" && clients > 0 && (
          <div className="muted">
            {clients} client{clients !== 1 ? "s" : ""} connected
          </div>
        )}
      </div>
    </div>
  );
};

export default ConnectionStatus;
