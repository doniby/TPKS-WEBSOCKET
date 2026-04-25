import { useState, useEffect } from "react";
import { monitoringAPI } from "../services/api";
import Layout from "../components/Layout";

const Monitoring = () => {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchStats();
    const interval = setInterval(fetchStats, 3000);
    return () => clearInterval(interval);
  }, []);

  const fetchStats = async () => {
    try {
      const response = await monitoringAPI.getStats();
      setStats(response.data.data);
    } catch {
      // Keep last known values if request fails.
    } finally {
      setLoading(false);
    }
  };

  const formatBytes = (bytes = 0) => `${(bytes / 1024 / 1024).toFixed(2)} MB`;

  const formatUptime = (seconds = 0) => {
    const days = Math.floor(seconds / 86400);
    const hours = Math.floor((seconds % 86400) / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    return days > 0 ? `${days}d ${hours}h` : `${hours}h ${minutes}m`;
  };

  const dbUsage =
    ((stats?.database.connectionsInUse || 0) / (stats?.database.poolMax || 1)) * 100;
  const heapUsage =
    ((stats?.system.memoryUsage.heapUsed || 0) / (stats?.system.memoryUsage.heapTotal || 1)) *
    100;

  return (
    <Layout>
      <div className="page-head">
        <div>
          <h1 className="page-title">Real-Time Monitoring</h1>
          <p className="page-subtitle">Auto-refreshing every 3 seconds</p>
        </div>
      </div>

      {loading ? (
        <div className="surface" style={{ display: "grid", placeItems: "center" }}>
          <div className="spinner" />
        </div>
      ) : (
        <>
          <section className="grid stats">
            <article className="surface">
              <h3 className="page-title" style={{ fontSize: "0.95rem" }}>WebSocket</h3>
              <div className="muted">Connected Clients: {stats?.websocket.connectedClients || 0}</div>
              <div className="muted">Rooms: {stats?.websocket.rooms || 0}</div>
            </article>

            <article className="surface">
              <h3 className="page-title" style={{ fontSize: "0.95rem" }}>Database Pool</h3>
              <div className="muted">
                In Use: {stats?.database.connectionsInUse || 0}/{stats?.database.poolMax || 0}
              </div>
              <div className="progress" style={{ margin: "0.5rem 0" }}>
                <span style={{ width: `${Math.min(dbUsage, 100)}%` }} />
              </div>
              <div className="muted">Open: {stats?.database.connectionsOpen || 0}</div>
            </article>

            <article className="surface">
              <h3 className="page-title" style={{ fontSize: "0.95rem" }}>System Resources</h3>
              <div className="muted">Heap Used: {formatBytes(stats?.system.memoryUsage.heapUsed)}</div>
              <div className="progress" style={{ margin: "0.5rem 0" }}>
                <span style={{ width: `${Math.min(heapUsage, 100)}%` }} />
              </div>
              <div className="muted">Uptime: {formatUptime(stats?.system.uptime)}</div>
            </article>
          </section>

          <section className="surface table-wrap">
            <h2 className="page-title" style={{ fontSize: "1.05rem" }}>Event Execution Statistics</h2>
            {!stats?.events || stats.events.length === 0 ? (
              <div className="empty" style={{ marginTop: "0.75rem" }}>No active events</div>
            ) : (
              <table className="ui-table" style={{ marginTop: "0.5rem" }}>
                <thead>
                  <tr>
                    <th>Event</th>
                    <th>Interval</th>
                    <th>Status</th>
                    <th>Total</th>
                    <th>Success</th>
                    <th>Errors</th>
                    <th>Skipped</th>
                    <th>Last Time</th>
                    <th>Last Status</th>
                  </tr>
                </thead>
                <tbody>
                  {stats.events.map((event) => (
                    <tr key={event.eventId}>
                      <td>{event.eventName}</td>
                      <td>{event.intervalSeconds}s</td>
                      <td>
                        <span className={`badge ${event.isRunning ? "warn" : ""}`}>
                          {event.isRunning ? "Running" : "Idle"}
                        </span>
                      </td>
                      <td>{event.stats.totalExecutions}</td>
                      <td>{event.stats.successCount}</td>
                      <td>{event.stats.errorCount}</td>
                      <td>{event.stats.skippedCount}</td>
                      <td>
                        {event.stats.lastExecutionTime
                          ? `${event.stats.lastExecutionTime}ms`
                          : "N/A"}
                      </td>
                      <td>
                        {event.stats.lastExecutionStatus ? (
                          <span
                            className={`badge ${
                              event.stats.lastExecutionStatus === "success" ? "success" : "error"
                            }`}
                          >
                            {event.stats.lastExecutionStatus}
                          </span>
                        ) : (
                          "-"
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>

          {stats?.events?.some((e) => e.stats.skippedCount > 0) && (
            <div className="alert warning">
              Some events were skipped due to overlapping runs. Increase their interval or optimize
              query performance.
            </div>
          )}
        </>
      )}
    </Layout>
  );
};

export default Monitoring;
