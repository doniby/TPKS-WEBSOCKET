import { useState, useEffect } from "react";
import { monitoringAPI } from "../services/api";
import Layout from "../components/Layout";

const Dashboard = () => {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    fetchStats();
    const interval = setInterval(fetchStats, 5000);
    return () => clearInterval(interval);
  }, []);

  const fetchStats = async () => {
    try {
      const response = await monitoringAPI.getStats();
      setStats(response.data.data);
      setError("");
    } catch {
      setError("Failed to fetch dashboard stats.");
    } finally {
      setLoading(false);
    }
  };

  const formatUptime = (seconds = 0) => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    return `${hours}h ${minutes}m`;
  };

  return (
    <Layout>
      <div className="page-head">
        <div>
          <h1 className="page-title">Dashboard</h1>
          <p className="page-subtitle">Live overview of websocket and event health</p>
        </div>
      </div>

      {loading && (
        <div className="surface" style={{ display: "grid", placeItems: "center" }}>
          <div className="spinner" />
        </div>
      )}

      {!loading && error && <div className="alert error">{error}</div>}

      {!loading && !error && (
        <>
          <section className="grid stats">
            <article className="surface stat-card">
              <h3>WebSocket Connections</h3>
              <div className="stat-value">{stats?.websocket.connectedClients || 0}</div>
              <div className="stat-note">Active clients</div>
            </article>
            <article className="surface stat-card">
              <h3>Active Events</h3>
              <div className="stat-value">{stats?.events?.length || 0}</div>
              <div className="stat-note">Running queries</div>
            </article>
            <article className="surface stat-card">
              <h3>Database Pool</h3>
              <div className="stat-value">
                {stats?.database.connectionsInUse || 0}/{stats?.database.poolMax || 0}
              </div>
              <div className="stat-note">Connections in use</div>
            </article>
            <article className="surface stat-card">
              <h3>Uptime</h3>
              <div className="stat-value">{formatUptime(stats?.system.uptime)}</div>
              <div className="stat-note">Server running</div>
            </article>
          </section>

          <section className="surface">
            <h2 className="page-title" style={{ fontSize: "1.05rem" }}>System</h2>
            <div className="grid" style={{ gap: "0.4rem", marginTop: "0.5rem" }}>
              <div className="muted">Node: {stats?.system.nodeVersion || "-"}</div>
              <div className="muted">Environment: {stats?.system.env || "-"}</div>
              <div className="muted">Platform: {stats?.system.platform || "-"}</div>
              <div className="muted">Memory (RSS): {stats?.system.memoryBreakdownMB?.total || "0"} MB</div>
            </div>
          </section>

          {stats?.events?.length > 0 && (
            <section className="surface table-wrap">
              <h2 className="page-title" style={{ fontSize: "1.05rem" }}>Event Status</h2>
              <table className="ui-table" style={{ marginTop: "0.5rem" }}>
                <thead>
                  <tr>
                    <th>Event</th>
                    <th>Interval</th>
                    <th>Status</th>
                    <th>Executions</th>
                    <th>Success Rate</th>
                    <th>Last Execution</th>
                  </tr>
                </thead>
                <tbody>
                  {stats.events.map((event) => {
                    const total = event.stats.totalExecutions;
                    const successRate =
                      total > 0
                        ? `${((event.stats.successCount / total) * 100).toFixed(1)}%`
                        : "N/A";

                    return (
                      <tr key={event.eventId}>
                        <td>{event.eventName}</td>
                        <td>{event.intervalSeconds}s</td>
                        <td>
                          <span className={`badge ${event.isRunning ? "success" : ""}`}>
                            {event.isRunning ? "Running" : "Idle"}
                          </span>
                        </td>
                        <td>{total}</td>
                        <td>{successRate}</td>
                        <td>
                          {event.stats.lastExecutionTime
                            ? `${event.stats.lastExecutionTime}ms`
                            : "N/A"}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </section>
          )}
        </>
      )}
    </Layout>
  );
};

export default Dashboard;
