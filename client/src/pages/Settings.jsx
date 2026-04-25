import { useState, useEffect } from "react";
import { Plus, Trash2 } from "lucide-react";
import Layout from "../components/Layout";
import { originsAPI } from "../services/api";
import { useToast } from "../components/Toast";
import Button from "../components/ui/Button";
import Card from "../components/ui/Card";
import Input from "../components/ui/Input";

const Settings = () => {
  const [origins, setOrigins] = useState([]);
  const [newOrigin, setNewOrigin] = useState("");
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState("");
  const toast = useToast();

  useEffect(() => {
    fetchOrigins();
  }, []);

  const fetchOrigins = async () => {
    try {
      setLoading(true);
      const response = await originsAPI.getAll();
      setOrigins(response.data.data || []);
      setError("");
    } catch {
      setError("Failed to fetch allowed origins");
      toast.error("Failed to load origins");
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
      setOrigins(response.data.data || []);
      setNewOrigin("");
      toast.success("Origin added successfully");
    } catch (err) {
      const message = err.response?.data?.message || "Failed to add origin";
      toast.error(message);
    } finally {
      setAdding(false);
    }
  };

  const handleRemoveOrigin = async (origin) => {
    if (!confirm(`Remove "${origin}" from allowed origins?`)) return;

    try {
      const response = await originsAPI.remove(origin);
      setOrigins(response.data.data || []);
      toast.success("Origin removed successfully");
    } catch (err) {
      const message = err.response?.data?.message || "Failed to remove origin";
      toast.error(message);
    }
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
          <h1 className="page-title">Settings</h1>
          <p className="page-subtitle">Control security and CORS origins</p>
        </div>
      </div>

      <div className="alert warning">
        <strong>Server restart required.</strong> Origin updates are saved to the .env file and
        take effect after restart.
      </div>

      {error && <div className="alert error">{error}</div>}

      <Card>
        <h2 className="page-title" style={{ fontSize: "1.05rem" }}>Allowed Origins (CORS)</h2>
        <p className="page-subtitle">These origins are allowed to connect to websocket and API endpoints.</p>

        <form onSubmit={handleAddOrigin} className="grid" style={{ marginTop: "0.8rem" }}>
          <Input
            type="text"
            value={newOrigin}
            onChange={(e) => setNewOrigin(e.target.value)}
            placeholder="https://example.com"
            disabled={adding}
          />
          <div>
            <Button type="submit" variant="primary" disabled={adding || !newOrigin.trim()} icon={Plus}>
              {adding ? "Adding..." : "Add Origin"}
            </Button>
          </div>
        </form>

        <div className="grid" style={{ marginTop: "0.9rem" }}>
          {origins.length === 0 ? (
            <div className="empty">No allowed origins configured.</div>
          ) : (
            origins.map((origin) => (
              <Card
                key={origin}
                as="div"
                style={{ padding: "0.7rem", display: "flex", justifyContent: "space-between", alignItems: "center" }}
              >
                <code>{origin}</code>
                <Button variant="destructive" onClick={() => handleRemoveOrigin(origin)} icon={Trash2}>
                  Remove
                </Button>
              </Card>
            ))
          )}
        </div>
      </Card>
    </Layout>
  );
};

export default Settings;
