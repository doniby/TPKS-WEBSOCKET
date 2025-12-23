import { useState, useEffect } from "react";
import { originsAPI } from "../services/api";
import { useToast } from "../components/Toast";
import Layout from "../components/Layout";

const Settings = () => {
  const [origins, setOrigins] = useState([]);
  const [newOrigin, setNewOrigin] = useState("");
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState(null);
  const { showToast } = useToast();

  useEffect(() => {
    fetchOrigins();
  }, []);

  const fetchOrigins = async () => {
    try {
      setLoading(true);
      const response = await originsAPI.getAll();
      setOrigins(response.data.data || []);
      setError(null);
    } catch (err) {
      setError("Failed to fetch allowed origins");
      showToast("Failed to load origins", "error");
    } finally {
      setLoading(false);
    }
  };

  const handleAddOrigin = async (e) => {
    e.preventDefault();
    if (!newOrigin.trim()) return;

    try {
      setAdding(true);
      const response = await originsAPI.add(newOrigin.trim());
      setOrigins(response.data.data);
      setNewOrigin("");
      showToast("Origin added successfully", "success");
    } catch (err) {
      const message = err.response?.data?.message || "Failed to add origin";
      showToast(message, "error");
    } finally {
      setAdding(false);
    }
  };

  const handleRemoveOrigin = async (origin) => {
    if (!confirm(`Remove "${origin}" from allowed origins?`)) return;

    try {
      const response = await originsAPI.remove(origin);
      setOrigins(response.data.data);
      showToast("Origin removed successfully", "success");
    } catch (err) {
      const message = err.response?.data?.message || "Failed to remove origin";
      showToast(message, "error");
    }
  };

  if (loading) {
    return (
      <Layout>
        <div style={styles.loading}>Loading...</div>
      </Layout>
    );
  }

  return (
    <Layout>
      <h1 style={styles.title}>Settings</h1>

      {/* Warning Banner */}
      <div style={styles.warningBanner}>
        <span style={styles.warningIcon}>⚠️</span>
        <div>
          <strong>Server Restart Required</strong>
          <p style={styles.warningText}>
            Changes to allowed origins are saved to the .env file. You must
            restart the server for changes to take effect on WebSocket
            connections.
          </p>
        </div>
      </div>

      {error && <div style={styles.error}>{error}</div>}

      {/* Allowed Origins Section */}
      <div style={styles.section}>
        <h2 style={styles.sectionTitle}>Allowed Origins (CORS)</h2>
        <p style={styles.sectionDesc}>
          These origins are allowed to connect to the WebSocket server and make
          API requests.
        </p>

        {/* Add Form */}
        <form onSubmit={handleAddOrigin} style={styles.addForm}>
          <input
            type="text"
            value={newOrigin}
            onChange={(e) => setNewOrigin(e.target.value)}
            placeholder="https://example.com"
            style={styles.input}
            disabled={adding}
          />
          <button
            type="submit"
            style={styles.addBtn}
            disabled={adding || !newOrigin.trim()}
          >
            {adding ? "Adding..." : "Add Origin"}
          </button>
        </form>

        {/* Origins List */}
        <div style={styles.originsList}>
          {origins.length === 0 ? (
            <div style={styles.emptyState}>No allowed origins configured</div>
          ) : (
            origins.map((origin, index) => (
              <div key={index} style={styles.originItem}>
                <span style={styles.originText}>{origin}</span>
                <button
                  onClick={() => handleRemoveOrigin(origin)}
                  style={styles.removeBtn}
                  title="Remove origin"
                >
                  ✕
                </button>
              </div>
            ))
          )}
        </div>
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
  error: {
    padding: "15px 20px",
    background: "#fee",
    border: "1px solid #fcc",
    borderRadius: "8px",
    color: "#c33",
    marginBottom: "20px",
  },
  title: {
    fontSize: "32px",
    fontWeight: "bold",
    color: "#333",
    marginBottom: "30px",
  },
  warningBanner: {
    display: "flex",
    gap: "15px",
    padding: "20px",
    background: "linear-gradient(135deg, #fff8e1 0%, #ffecb3 100%)",
    border: "1px solid #ffc107",
    borderRadius: "12px",
    marginBottom: "30px",
    alignItems: "flex-start",
  },
  warningIcon: {
    fontSize: "24px",
  },
  warningText: {
    margin: "5px 0 0 0",
    color: "#666",
    fontSize: "14px",
  },
  section: {
    background: "white",
    borderRadius: "12px",
    padding: "25px",
    boxShadow: "0 2px 8px rgba(0,0,0,0.1)",
  },
  sectionTitle: {
    fontSize: "20px",
    fontWeight: "600",
    color: "#333",
    marginTop: 0,
    marginBottom: "8px",
  },
  sectionDesc: {
    color: "#666",
    fontSize: "14px",
    marginBottom: "20px",
  },
  addForm: {
    display: "flex",
    gap: "10px",
    marginBottom: "20px",
  },
  input: {
    flex: 1,
    padding: "12px 16px",
    border: "1px solid #ddd",
    borderRadius: "8px",
    fontSize: "14px",
    outline: "none",
    transition: "border-color 0.2s",
  },
  addBtn: {
    padding: "12px 24px",
    background: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
    color: "white",
    border: "none",
    borderRadius: "8px",
    fontSize: "14px",
    fontWeight: "500",
    cursor: "pointer",
    transition: "opacity 0.2s",
  },
  originsList: {
    display: "flex",
    flexDirection: "column",
    gap: "8px",
  },
  originItem: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "12px 16px",
    background: "#f8f9fa",
    borderRadius: "8px",
    border: "1px solid #eee",
  },
  originText: {
    fontFamily: "monospace",
    fontSize: "14px",
    color: "#333",
  },
  removeBtn: {
    width: "28px",
    height: "28px",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    background: "#fee",
    border: "1px solid #fcc",
    borderRadius: "6px",
    color: "#c33",
    cursor: "pointer",
    fontSize: "14px",
    transition: "background 0.2s",
  },
  emptyState: {
    padding: "30px",
    textAlign: "center",
    color: "#999",
    background: "#f8f9fa",
    borderRadius: "8px",
  },
};

export default Settings;
