import { useState, useEffect } from "react";
import { appsAPI } from "../services/api";
import Layout from "../components/Layout";
import { useToast } from "../components/Toast";

const Apps = () => {
  const [apps, setApps] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingApp, setEditingApp] = useState(null);
  const [newSecret, setNewSecret] = useState(null); // Shown after create or rotate
  const [formData, setFormData] = useState({
    appName: "",
    channels: "",
    description: "",
  });
  const toast = useToast();

  useEffect(() => {
    fetchApps();
  }, []);

  const fetchApps = async () => {
    try {
      const response = await appsAPI.getAll();
      setApps(response.data.data);
    } catch (error) {
      toast.error("Failed to fetch registered apps");
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    try {
      if (editingApp) {
        await appsAPI.update(editingApp.APP_ID, formData);
        toast.success("App updated successfully!");
      } else {
        const response = await appsAPI.create(formData);
        // Show the generated secret
        setNewSecret({
          appName: response.data.data.appName,
          appSecret: response.data.data.appSecret,
        });
        toast.success("App registered successfully!");
      }

      setShowModal(false);
      setEditingApp(null);
      setFormData({ appName: "", channels: "", description: "" });
      fetchApps();
    } catch (error) {
      toast.error(error.response?.data?.message || "Operation failed");
    }
  };

  const handleEdit = (app) => {
    setEditingApp(app);
    setFormData({
      appName: app.APP_NAME,
      channels: app.APP_CHANNELS || "",
      description: app.DESCRIPTION || "",
    });
    setShowModal(true);
  };

  const handleDelete = async (id, name) => {
    if (!confirm(`Remove app "${name}"? This will disconnect any active sessions.`))
      return;

    try {
      await appsAPI.delete(id);
      toast.success("App removed successfully");
      fetchApps();
    } catch (error) {
      toast.error("Failed to remove app");
    }
  };

  const handleToggle = async (id, name) => {
    try {
      const response = await appsAPI.toggle(id);
      fetchApps();
      toast.info(
        `App "${name}" ${response.data.data.isActive ? "activated" : "deactivated"}`
      );
    } catch (error) {
      toast.error("Failed to toggle app");
    }
  };

  const handleRotateSecret = async (id, name) => {
    if (
      !confirm(
        `Rotate secret for "${name}"?\n\nThe old secret will stop working immediately. You must update the app's configuration with the new secret.`
      )
    )
      return;

    try {
      const response = await appsAPI.rotateSecret(id);
      setNewSecret({
        appName: response.data.data.appName,
        appSecret: response.data.data.newSecret,
      });
      toast.success("Secret rotated successfully!");
      fetchApps();
    } catch (error) {
      toast.error("Failed to rotate secret");
    }
  };

  const handleReload = async () => {
    try {
      await appsAPI.reload();
      toast.success("App registry reloaded from database");
      fetchApps();
    } catch (error) {
      toast.error("Failed to reload registry");
    }
  };

  const openCreateModal = () => {
    setEditingApp(null);
    setFormData({ appName: "", channels: "", description: "" });
    setShowModal(true);
  };

  const copyToClipboard = (text) => {
    navigator.clipboard.writeText(text).then(() => {
      toast.success("Copied to clipboard!");
    });
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
      <div style={styles.header}>
        <h1 style={styles.title}>App Registry</h1>
        <div style={{ display: "flex", gap: "10px" }}>
          <button onClick={handleReload} style={styles.reloadBtn}>
            🔄 Reload
          </button>
          <button onClick={openCreateModal} style={styles.createBtn}>
            + Register App
          </button>
        </div>
      </div>

      <p style={styles.subtitle}>
        Manage which applications are allowed to connect to the WebSocket server.
        Each app gets a unique secret for authentication. Use channels to
        restrict which data an app can receive.
      </p>

      {apps.length === 0 ? (
        <div style={styles.empty}>
          No apps registered yet. Register your first app to enable WebSocket
          connections.
        </div>
      ) : (
        <div style={styles.table}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={styles.tableHeader}>
                <th style={styles.th}>App Name</th>
                <th style={styles.th}>Secret</th>
                <th style={styles.th}>Channels</th>
                <th style={styles.th}>Status</th>
                <th style={styles.th}>Last Connected</th>
                <th style={styles.th}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {apps.map((app) => (
                <tr key={app.APP_ID} style={styles.tableRow}>
                  <td style={styles.td}>
                    <div style={{ fontWeight: "600", color: "#333" }}>
                      {app.APP_NAME}
                    </div>
                    {app.DESCRIPTION && (
                      <div style={{ fontSize: "12px", color: "#999", marginTop: "2px" }}>
                        {app.DESCRIPTION}
                      </div>
                    )}
                  </td>
                  <td style={styles.td}>
                    <code style={styles.secretCode}>{app.APP_SECRET}</code>
                  </td>
                  <td style={styles.td}>
                    {app.APP_CHANNELS ? (
                      <div style={{ display: "flex", gap: "4px", flexWrap: "wrap" }}>
                        {app.APP_CHANNELS.split(",").map((ch) => (
                          <span key={ch.trim()} style={styles.channelBadge}>
                            {ch.trim()}
                          </span>
                        ))}
                      </div>
                    ) : (
                      <span style={styles.allChannelsBadge}>ALL</span>
                    )}
                  </td>
                  <td style={styles.td}>
                    <span
                      style={{
                        ...styles.badge,
                        ...(app.IS_ACTIVE
                          ? styles.badgeActive
                          : styles.badgeInactive),
                      }}
                    >
                      {app.IS_ACTIVE ? "Active" : "Inactive"}
                    </span>
                  </td>
                  <td style={styles.td}>
                    {app.LAST_CONNECTED_AT
                      ? new Date(app.LAST_CONNECTED_AT).toLocaleString()
                      : "Never"}
                  </td>
                  <td style={styles.td}>
                    <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
                      <button
                        onClick={() => handleToggle(app.APP_ID, app.APP_NAME)}
                        style={styles.actionBtn}
                      >
                        {app.IS_ACTIVE ? "Pause" : "Resume"}
                      </button>
                      <button
                        onClick={() => handleEdit(app)}
                        style={styles.actionBtn}
                      >
                        Edit
                      </button>
                      <button
                        onClick={() =>
                          handleRotateSecret(app.APP_ID, app.APP_NAME)
                        }
                        style={{
                          ...styles.actionBtn,
                          ...styles.actionBtnWarning,
                        }}
                      >
                        🔑 Rotate
                      </button>
                      <button
                        onClick={() =>
                          handleDelete(app.APP_ID, app.APP_NAME)
                        }
                        style={{
                          ...styles.actionBtn,
                          ...styles.actionBtnDanger,
                        }}
                      >
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Create/Edit Modal */}
      {showModal && (
        <div style={styles.modal} onClick={() => setShowModal(false)}>
          <div style={styles.modalContent} onClick={(e) => e.stopPropagation()}>
            <h2 style={styles.modalTitle}>
              {editingApp ? "Edit App" : "Register New App"}
            </h2>

            <form onSubmit={handleSubmit}>
              <div style={styles.formGroup}>
                <label style={styles.label}>App Name</label>
                <input
                  type="text"
                  value={formData.appName}
                  onChange={(e) =>
                    setFormData({ ...formData, appName: e.target.value })
                  }
                  required
                  style={styles.input}
                  placeholder="e.g., ETERNAL, CBS-MONITOR"
                  disabled={!!editingApp}
                />
                <div style={styles.helpText}>
                  Alphanumeric, hyphens, and underscores only. Will be
                  uppercased.
                </div>
              </div>

              <div style={styles.formGroup}>
                <label style={styles.label}>
                  Allowed Channels{" "}
                  <span style={{ fontWeight: "normal", color: "#999" }}>
                    (optional)
                  </span>
                </label>
                <input
                  type="text"
                  value={formData.channels}
                  onChange={(e) =>
                    setFormData({ ...formData, channels: e.target.value })
                  }
                  style={styles.input}
                  placeholder="Leave empty for ALL channels, or: YOR,BOR,BSH"
                />
                <div style={styles.helpText}>
                  Comma-separated channel names. Empty = unrestricted access to
                  all events.
                </div>
              </div>

              <div style={styles.formGroup}>
                <label style={styles.label}>Description</label>
                <input
                  type="text"
                  value={formData.description}
                  onChange={(e) =>
                    setFormData({ ...formData, description: e.target.value })
                  }
                  style={styles.input}
                  placeholder="e.g., Main Dashboard Application"
                />
              </div>

              {!editingApp && (
                <div style={styles.infoBox}>
                  💡 A secure secret will be auto-generated and shown once after
                  creation. Make sure to save it.
                </div>
              )}

              <div style={styles.modalActions}>
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  style={styles.cancelBtn}
                >
                  Cancel
                </button>
                <button type="submit" style={styles.submitBtn}>
                  {editingApp ? "Update App" : "Register App"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Secret Display Modal */}
      {newSecret && (
        <div style={styles.modal} onClick={() => setNewSecret(null)}>
          <div style={styles.modalContent} onClick={(e) => e.stopPropagation()}>
            <h2 style={{ ...styles.modalTitle, color: "#2e7d32" }}>
              🔑 App Secret Generated
            </h2>

            <div style={styles.secretDisplayBox}>
              <div style={{ marginBottom: "15px" }}>
                <div style={styles.secretLabel}>App Name</div>
                <div style={styles.secretValue}>{newSecret.appName}</div>
              </div>

              <div>
                <div style={styles.secretLabel}>Secret</div>
                <div style={styles.secretDisplay}>
                  <code style={styles.secretFullCode}>
                    {newSecret.appSecret}
                  </code>
                  <button
                    onClick={() => copyToClipboard(newSecret.appSecret)}
                    style={styles.copyBtn}
                  >
                    📋 Copy
                  </button>
                </div>
              </div>
            </div>

            <div style={styles.warningBox}>
              ⚠️ <strong>Save this secret now!</strong> It will not be shown
              again. You need to set this as the{" "}
              <code>WS_APP_SECRET</code> environment variable in the
              connecting application.
            </div>

            <div style={styles.modalActions}>
              <button
                onClick={() => setNewSecret(null)}
                style={styles.submitBtn}
              >
                I've Saved It
              </button>
            </div>
          </div>
        </div>
      )}
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
    alignItems: "center",
    marginBottom: "10px",
  },
  title: { fontSize: "32px", fontWeight: "bold", color: "#333", margin: 0 },
  subtitle: {
    fontSize: "14px",
    color: "#888",
    marginBottom: "25px",
    lineHeight: "1.5",
  },
  createBtn: {
    padding: "12px 24px",
    background: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
    color: "white",
    border: "none",
    borderRadius: "8px",
    fontSize: "15px",
    fontWeight: "600",
    cursor: "pointer",
  },
  reloadBtn: {
    padding: "12px 20px",
    background: "#e3f2fd",
    color: "#1976d2",
    border: "1px solid #90caf9",
    borderRadius: "8px",
    fontSize: "14px",
    fontWeight: "500",
    cursor: "pointer",
  },
  empty: {
    padding: "60px 20px",
    textAlign: "center",
    background: "white",
    borderRadius: "12px",
    color: "#666",
    fontSize: "16px",
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
    fontWeight: "600",
    color: "#333",
    fontSize: "14px",
  },
  tableRow: { borderBottom: "1px solid #f0f0f0" },
  td: { padding: "12px", fontSize: "14px", color: "#666" },
  secretCode: {
    padding: "3px 6px",
    background: "#f5f5f5",
    borderRadius: "4px",
    fontSize: "11px",
    fontFamily: "monospace",
    color: "#999",
  },
  channelBadge: {
    padding: "2px 8px",
    background: "#e8eaf6",
    color: "#3949ab",
    borderRadius: "10px",
    fontSize: "11px",
    fontWeight: "500",
  },
  allChannelsBadge: {
    padding: "2px 10px",
    background: "#e8f5e9",
    color: "#2e7d32",
    borderRadius: "10px",
    fontSize: "11px",
    fontWeight: "600",
  },
  badge: {
    padding: "4px 12px",
    borderRadius: "12px",
    fontSize: "12px",
    fontWeight: "500",
    display: "inline-block",
  },
  badgeActive: { background: "#e8f5e9", color: "#2e7d32" },
  badgeInactive: { background: "#f5f5f5", color: "#999" },
  actionBtn: {
    padding: "5px 10px",
    background: "#f5f5f5",
    border: "1px solid #ddd",
    borderRadius: "6px",
    fontSize: "12px",
    cursor: "pointer",
  },
  actionBtnWarning: {
    background: "#fff3e0",
    border: "1px solid #ffcc80",
    color: "#e65100",
  },
  actionBtnDanger: {
    background: "#ffebee",
    border: "1px solid #ffcdd2",
    color: "#c62828",
  },
  modal: {
    position: "fixed",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    background: "rgba(0,0,0,0.5)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 1000,
    padding: "20px",
  },
  modalContent: {
    background: "white",
    borderRadius: "12px",
    padding: "30px",
    maxWidth: "600px",
    width: "100%",
    maxHeight: "90vh",
    overflow: "auto",
  },
  modalTitle: {
    fontSize: "24px",
    fontWeight: "600",
    marginBottom: "25px",
    color: "#333",
  },
  formGroup: { marginBottom: "20px" },
  label: {
    display: "block",
    marginBottom: "8px",
    fontSize: "14px",
    fontWeight: "500",
    color: "#333",
  },
  input: {
    width: "100%",
    padding: "10px",
    fontSize: "14px",
    border: "1px solid #ddd",
    borderRadius: "6px",
    boxSizing: "border-box",
  },
  helpText: {
    marginTop: "5px",
    fontSize: "12px",
    color: "#999",
  },
  infoBox: {
    padding: "12px 15px",
    background: "#e3f2fd",
    border: "1px solid #90caf9",
    borderRadius: "8px",
    fontSize: "13px",
    color: "#1565c0",
    marginBottom: "20px",
  },
  modalActions: {
    display: "flex",
    gap: "10px",
    justifyContent: "flex-end",
    marginTop: "25px",
  },
  cancelBtn: {
    padding: "10px 20px",
    background: "#f5f5f5",
    border: "1px solid #ddd",
    borderRadius: "6px",
    fontSize: "14px",
    cursor: "pointer",
  },
  submitBtn: {
    padding: "10px 24px",
    background: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
    color: "white",
    border: "none",
    borderRadius: "6px",
    fontSize: "14px",
    fontWeight: "600",
    cursor: "pointer",
  },
  // Secret display styles
  secretDisplayBox: {
    padding: "20px",
    background: "#f8f9fa",
    borderRadius: "8px",
    marginBottom: "20px",
  },
  secretLabel: {
    fontSize: "12px",
    fontWeight: "600",
    color: "#999",
    textTransform: "uppercase",
    marginBottom: "5px",
  },
  secretValue: {
    fontSize: "18px",
    fontWeight: "600",
    color: "#333",
  },
  secretDisplay: {
    display: "flex",
    alignItems: "center",
    gap: "10px",
  },
  secretFullCode: {
    flex: 1,
    padding: "10px",
    background: "#263238",
    color: "#4caf50",
    borderRadius: "6px",
    fontSize: "13px",
    fontFamily: "monospace",
    wordBreak: "break-all",
  },
  copyBtn: {
    padding: "10px 15px",
    background: "#667eea",
    color: "white",
    border: "none",
    borderRadius: "6px",
    fontSize: "13px",
    cursor: "pointer",
    whiteSpace: "nowrap",
  },
  warningBox: {
    padding: "15px",
    background: "#fff3e0",
    border: "1px solid #ffb74d",
    borderRadius: "8px",
    fontSize: "14px",
    color: "#e65100",
    lineHeight: "1.5",
  },
};

export default Apps;
