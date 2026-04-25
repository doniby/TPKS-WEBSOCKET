import { useState, useEffect } from "react";
import {
  Copy,
  KeyRound,
  Pause,
  Pencil,
  Play,
  Plus,
  RefreshCw,
  Save,
  Trash2,
  X,
} from "lucide-react";
import Layout from "../components/Layout";
import { appsAPI } from "../services/api";
import { useToast } from "../components/Toast";
import Dialog from "../components/ui/Dialog";
import Button from "../components/ui/Button";
import Card from "../components/ui/Card";
import Input from "../components/ui/Input";

const initialForm = {
  appName: "",
  channels: "",
  description: "",
};

const Apps = () => {
  const [apps, setApps] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingApp, setEditingApp] = useState(null);
  const [newSecret, setNewSecret] = useState(null);
  const [formData, setFormData] = useState(initialForm);
  const toast = useToast();

  useEffect(() => {
    fetchApps();
  }, []);

  const fetchApps = async () => {
    try {
      const response = await appsAPI.getAll();
      setApps(response.data.data || []);
    } catch {
      toast.error("Failed to fetch registered apps");
    } finally {
      setLoading(false);
    }
  };

  const openCreateModal = () => {
    setEditingApp(null);
    setFormData(initialForm);
    setShowModal(true);
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

  const handleSubmit = async (e) => {
    e.preventDefault();

    try {
      if (editingApp) {
        await appsAPI.update(editingApp.APP_ID, formData);
        toast.success("App updated successfully");
      } else {
        const response = await appsAPI.create(formData);
        setNewSecret({
          appName: response.data.data.appName,
          appSecret: response.data.data.appSecret,
        });
        toast.success("App registered successfully");
      }

      setShowModal(false);
      setEditingApp(null);
      setFormData(initialForm);
      fetchApps();
    } catch (error) {
      toast.error(error.response?.data?.message || "Operation failed");
    }
  };

  const handleDelete = async (id, name) => {
    if (!confirm(`Remove app "${name}"? This will disconnect active sessions.`)) return;

    try {
      await appsAPI.delete(id);
      toast.success("App removed successfully");
      fetchApps();
    } catch {
      toast.error("Failed to remove app");
    }
  };

  const handleToggle = async (id, name) => {
    try {
      const response = await appsAPI.toggle(id);
      toast.info(`App "${name}" ${response.data.data.isActive ? "activated" : "deactivated"}`);
      fetchApps();
    } catch {
      toast.error("Failed to toggle app");
    }
  };

  const handleRotateSecret = async (id, name) => {
    if (!confirm(`Rotate secret for "${name}"? The old secret will stop working.`)) return;

    try {
      const response = await appsAPI.rotateSecret(id);
      setNewSecret({
        appName: response.data.data.appName,
        appSecret: response.data.data.newSecret,
      });
      toast.success("Secret rotated successfully");
      fetchApps();
    } catch {
      toast.error("Failed to rotate secret");
    }
  };

  const handleReload = async () => {
    try {
      await appsAPI.reload();
      toast.success("App registry reloaded from database");
      fetchApps();
    } catch {
      toast.error("Failed to reload registry");
    }
  };

  const copyToClipboard = (text) => {
    navigator.clipboard.writeText(text).then(() => {
      toast.success("Copied to clipboard");
    });
  };

  if (loading) {
    return (
      <Layout>
        <Card style={{ display: "grid", placeItems: "center" }}>
          <div className="spinner" />
        </Card>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="page-head">
        <div>
          <h1 className="page-title">App Registry</h1>
          <p className="page-subtitle">Allowed applications and secrets for websocket auth</p>
        </div>
        <div className="actions">
          <Button onClick={handleReload} icon={RefreshCw}>
            Reload
          </Button>
          <Button onClick={openCreateModal} variant="primary" icon={Plus}>
            Register App
          </Button>
        </div>
      </div>

      <Card className="muted">
        Manage which applications can connect. Restrict channels by comma-separated values,
        or leave empty to grant all channels.
      </Card>

      {newSecret && (
        <Card>
          <div className="page-head" style={{ alignItems: "center" }}>
            <div>
              <h2 className="page-title" style={{ fontSize: "1rem" }}>New Secret</h2>
              <p className="page-subtitle">
                Save this now. For {newSecret.appName}, it may not be shown again.
              </p>
            </div>
            <Button onClick={() => copyToClipboard(newSecret.appSecret)} icon={Copy}>
              Copy
            </Button>
          </div>
          <pre className="surface" style={{ marginTop: "0.6rem", overflow: "auto" }}>
            {newSecret.appSecret}
          </pre>
        </Card>
      )}

      {apps.length === 0 ? (
        <div className="empty">No apps registered yet.</div>
      ) : (
        <Card className="table-wrap">
          <table className="ui-table">
            <thead>
              <tr>
                <th>App Name</th>
                <th>Secret</th>
                <th>Channels</th>
                <th>Status</th>
                <th>Last Connected</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {apps.map((app) => (
                <tr key={app.APP_ID}>
                  <td>
                    <div style={{ fontWeight: 700 }}>{app.APP_NAME}</div>
                    {app.DESCRIPTION && <div className="help">{app.DESCRIPTION}</div>}
                  </td>
                  <td><code>{app.APP_SECRET}</code></td>
                  <td>
                    {app.APP_CHANNELS ? (
                      <div className="actions">
                        {app.APP_CHANNELS.split(",").map((ch) => (
                          <span key={ch.trim()} className="badge">{ch.trim()}</span>
                        ))}
                      </div>
                    ) : (
                      <span className="badge">ALL</span>
                    )}
                  </td>
                  <td>
                    <span className={`badge ${app.IS_ACTIVE ? "success" : ""}`}>
                      {app.IS_ACTIVE ? "Active" : "Inactive"}
                    </span>
                  </td>
                  <td>{app.LAST_CONNECTED_AT ? new Date(app.LAST_CONNECTED_AT).toLocaleString() : "Never"}</td>
                  <td>
                    <div className="actions">
                      <Button
                        onClick={() => handleToggle(app.APP_ID, app.APP_NAME)}
                        icon={app.IS_ACTIVE ? Pause : Play}
                      >
                        {app.IS_ACTIVE ? "Pause" : "Resume"}
                      </Button>
                      <Button onClick={() => handleEdit(app)} icon={Pencil}>Edit</Button>
                      <Button
                        onClick={() => handleRotateSecret(app.APP_ID, app.APP_NAME)}
                        variant="warn"
                        icon={KeyRound}
                      >
                        Rotate
                      </Button>
                      <Button
                        onClick={() => handleDelete(app.APP_ID, app.APP_NAME)}
                        variant="destructive"
                        icon={Trash2}
                      >
                        Delete
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}

      <Dialog open={showModal} onClose={() => setShowModal(false)} title={editingApp ? "Edit App" : "Register App"}>
        <form onSubmit={handleSubmit} className="grid">
          <div className="field">
            <label>App Name</label>
            <Input
              type="text"
              value={formData.appName}
              onChange={(e) => setFormData({ ...formData, appName: e.target.value })}
              required
              disabled={!!editingApp}
              placeholder="e.g., ETERNAL, CBS-MONITOR"
            />
            <div className="help">Alphanumeric, hyphens, and underscores only.</div>
          </div>

          <div className="field">
            <label>Allowed Channels (optional)</label>
            <Input
              type="text"
              value={formData.channels}
              onChange={(e) => setFormData({ ...formData, channels: e.target.value })}
              placeholder="Leave empty for ALL channels"
            />
            <div className="help">Comma-separated channel names.</div>
          </div>

          <div className="field">
            <label>Description</label>
            <Input
              type="text"
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              placeholder="e.g., Main dashboard"
            />
          </div>

          {!editingApp && (
            <div className="alert warning">A secure secret will be generated and shown once after creation.</div>
          )}

          <div className="modal-actions">
            <Button type="button" onClick={() => setShowModal(false)} icon={X}>Cancel</Button>
            <Button type="submit" variant="primary" icon={Save}>
              {editingApp ? "Update App" : "Register App"}
            </Button>
          </div>
        </form>
      </Dialog>
    </Layout>
  );
};

export default Apps;
