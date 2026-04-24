import { useState, useEffect } from "react";
import { mqttAPI } from "../services/api";
import Layout from "../components/Layout";
import { useToast } from "../components/Toast";

const MqttTopics = () => {
  const [topics, setTopics] = useState([]);
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({ topicFilter: "", description: "" });
  const [submitting, setSubmitting] = useState(false);
  const toast = useToast();

  useEffect(() => {
    fetchAll();
    const interval = setInterval(fetchStatus, 5000);
    return () => clearInterval(interval);
  }, []);

  const fetchAll = async () => {
    await Promise.all([fetchTopics(), fetchStatus()]);
    setLoading(false);
  };

  const fetchTopics = async () => {
    try {
      const res = await mqttAPI.getTopics();
      setTopics(res.data.data);
    } catch (error) {
      toast.error("Failed to fetch MQTT topics");
    }
  };

  const fetchStatus = async () => {
    try {
      const res = await mqttAPI.getStatus();
      setStatus(res.data.data);
    } catch (error) {
      setStatus({ connected: false, brokerUrl: "", subscribedTopics: [] });
    }
  };

  const handleAdd = async (e) => {
    e.preventDefault();
    if (!form.topicFilter.trim()) return;

    setSubmitting(true);
    try {
      await mqttAPI.addTopic({
        topicFilter: form.topicFilter.trim(),
        description: form.description.trim() || null,
      });
      toast.success("Topic added and subscribed");
      setForm({ topicFilter: "", description: "" });
      await fetchAll();
    } catch (error) {
      toast.error(error.response?.data?.message || "Failed to add topic");
    } finally {
      setSubmitting(false);
    }
  };

  const handleToggle = async (topic) => {
    try {
      await mqttAPI.toggle(topic.topicId);
      toast.success(
        topic.isActive ? "Topic deactivated" : "Topic activated"
      );
      await fetchAll();
    } catch (error) {
      toast.error("Failed to toggle topic");
    }
  };

  const handleDelete = async (topic) => {
    if (!confirm(`Remove topic "${topic.topicFilter}"?`)) return;
    try {
      await mqttAPI.delete(topic.topicId);
      toast.success("Topic removed");
      await fetchAll();
    } catch (error) {
      toast.error("Failed to remove topic");
    }
  };

  const handleReload = async () => {
    try {
      await mqttAPI.reload();
      toast.success("Bridge subscriptions reloaded");
      await fetchStatus();
    } catch (error) {
      toast.error(error.response?.data?.message || "Reload failed");
    }
  };

  if (loading) {
    return (
      <Layout>
        <div style={styles.loading}>Loading...</div>
      </Layout>
    );
  }

  const subscribedSet = new Set(status?.subscribedTopics || []);

  return (
    <Layout>
      <div style={styles.header}>
        <div>
          <h1 style={styles.title}>MQTT Topics</h1>
          <div style={styles.subtitle}>
            Configure broker subscriptions broadcast to WebSocket clients
          </div>
        </div>
        <button onClick={handleReload} style={styles.reloadBtn}>
          Reload Subscriptions
        </button>
      </div>

      <div style={styles.statusCard}>
        <div style={styles.statusRow}>
          <span style={styles.statusLabel}>Bridge:</span>
          <span
            style={{
              ...styles.badge,
              ...(status?.connected
                ? styles.badgeSuccess
                : styles.badgeError),
            }}
          >
            {status?.connected ? "Connected" : "Disconnected"}
          </span>
        </div>
        <div style={styles.statusRow}>
          <span style={styles.statusLabel}>Broker:</span>
          <code style={styles.code}>{status?.brokerUrl || "-"}</code>
        </div>
        <div style={styles.statusRow}>
          <span style={styles.statusLabel}>Subscribed:</span>
          <span style={styles.statusValue}>
            {status?.subscribedTopics?.length || 0} topic(s)
          </span>
        </div>
      </div>

      <div style={styles.card}>
        <h3 style={styles.cardTitle}>Add Topic</h3>
        <form onSubmit={handleAdd} style={styles.form}>
          <input
            type="text"
            placeholder="Topic filter (e.g. /monitoring/gate or #)"
            value={form.topicFilter}
            onChange={(e) =>
              setForm({ ...form, topicFilter: e.target.value })
            }
            style={styles.input}
            required
          />
          <input
            type="text"
            placeholder="Description (optional)"
            value={form.description}
            onChange={(e) =>
              setForm({ ...form, description: e.target.value })
            }
            style={styles.input}
          />
          <button type="submit" disabled={submitting} style={styles.addBtn}>
            {submitting ? "Adding..." : "Add"}
          </button>
        </form>
      </div>

      <div style={styles.section}>
        <h2 style={styles.sectionTitle}>Configured Topics</h2>
        {topics.length === 0 ? (
          <div style={styles.empty}>
            No topics yet. Add one above to start broadcasting MQTT messages.
          </div>
        ) : (
          <div style={styles.table}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr style={styles.tableHeader}>
                  <th style={styles.th}>Topic Filter</th>
                  <th style={styles.th}>Description</th>
                  <th style={styles.th}>Active</th>
                  <th style={styles.th}>Subscribed</th>
                  <th style={styles.th}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {topics.map((t) => (
                  <tr key={t.topicId} style={styles.tableRow}>
                    <td style={styles.td}>
                      <code style={styles.code}>{t.topicFilter}</code>
                    </td>
                    <td style={styles.td}>{t.description || "-"}</td>
                    <td style={styles.td}>
                      <span
                        style={{
                          ...styles.badge,
                          ...(t.isActive
                            ? styles.badgeSuccess
                            : styles.badgeIdle),
                        }}
                      >
                        {t.isActive ? "Active" : "Inactive"}
                      </span>
                    </td>
                    <td style={styles.td}>
                      <span
                        style={{
                          ...styles.badge,
                          ...(subscribedSet.has(t.topicFilter)
                            ? styles.badgeSuccess
                            : styles.badgeIdle),
                        }}
                      >
                        {subscribedSet.has(t.topicFilter) ? "Yes" : "No"}
                      </span>
                    </td>
                    <td style={styles.td}>
                      <button
                        onClick={() => handleToggle(t)}
                        style={styles.actionBtn}
                      >
                        {t.isActive ? "Deactivate" : "Activate"}
                      </button>
                      <button
                        onClick={() => handleDelete(t)}
                        style={{ ...styles.actionBtn, ...styles.deleteBtn }}
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </Layout>
  );
};

const styles = {
  loading: {
    padding: "40px",
    textAlign: "center",
    fontSize: "18px",
    color: "#666",
  },
  header: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-end",
    marginBottom: "20px",
  },
  title: {
    fontSize: "32px",
    fontWeight: "bold",
    color: "#333",
    marginBottom: "5px",
  },
  subtitle: { fontSize: "14px", color: "#999" },
  reloadBtn: {
    padding: "10px 18px",
    background: "linear-gradient(90deg, #667eea, #764ba2)",
    color: "white",
    border: "none",
    borderRadius: "8px",
    cursor: "pointer",
    fontWeight: 500,
    fontSize: "14px",
  },
  statusCard: {
    background: "white",
    borderRadius: "12px",
    padding: "20px 25px",
    boxShadow: "0 2px 8px rgba(0,0,0,0.1)",
    marginBottom: "20px",
    display: "flex",
    gap: "40px",
    flexWrap: "wrap",
  },
  statusRow: { display: "flex", alignItems: "center", gap: "10px" },
  statusLabel: { color: "#999", fontSize: "13px", textTransform: "uppercase" },
  statusValue: { color: "#333", fontWeight: 600 },
  code: {
    background: "#f5f5f7",
    padding: "3px 8px",
    borderRadius: "4px",
    fontSize: "13px",
    color: "#333",
    fontFamily: "monospace",
  },
  card: {
    background: "white",
    borderRadius: "12px",
    padding: "25px",
    boxShadow: "0 2px 8px rgba(0,0,0,0.1)",
    marginBottom: "30px",
  },
  cardTitle: {
    fontSize: "16px",
    fontWeight: 600,
    color: "#333",
    marginTop: 0,
    marginBottom: "15px",
  },
  form: { display: "flex", gap: "10px", flexWrap: "wrap" },
  input: {
    flex: 1,
    minWidth: "200px",
    padding: "10px 14px",
    border: "1px solid #e0e0e0",
    borderRadius: "8px",
    fontSize: "14px",
    outline: "none",
  },
  addBtn: {
    padding: "10px 22px",
    background: "#2e7d32",
    color: "white",
    border: "none",
    borderRadius: "8px",
    cursor: "pointer",
    fontWeight: 500,
    fontSize: "14px",
  },
  section: { marginBottom: "40px" },
  sectionTitle: {
    fontSize: "22px",
    fontWeight: 600,
    color: "#333",
    marginBottom: "20px",
  },
  empty: {
    padding: "40px",
    textAlign: "center",
    background: "white",
    borderRadius: "12px",
    color: "#999",
  },
  table: {
    background: "white",
    borderRadius: "12px",
    padding: "20px",
    boxShadow: "0 2px 8px rgba(0,0,0,0.1)",
    overflow: "auto",
  },
  tableHeader: { background: "#f8f9fa" },
  th: {
    padding: "12px",
    textAlign: "left",
    fontWeight: 600,
    color: "#333",
    fontSize: "13px",
    whiteSpace: "nowrap",
  },
  tableRow: { borderBottom: "1px solid #f0f0f0" },
  td: { padding: "12px", fontSize: "14px", color: "#666" },
  badge: {
    padding: "4px 12px",
    borderRadius: "12px",
    fontSize: "12px",
    fontWeight: 500,
    display: "inline-block",
  },
  badgeSuccess: { background: "#e8f5e9", color: "#2e7d32" },
  badgeError: { background: "#ffebee", color: "#c62828" },
  badgeIdle: { background: "#f5f5f5", color: "#999" },
  actionBtn: {
    padding: "6px 12px",
    background: "#f5f5f7",
    border: "1px solid #e0e0e0",
    borderRadius: "6px",
    cursor: "pointer",
    fontSize: "13px",
    marginRight: "8px",
    color: "#333",
  },
  deleteBtn: { background: "#ffebee", color: "#c62828", borderColor: "#ffcdd2" },
};

export default MqttTopics;
