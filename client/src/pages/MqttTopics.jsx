import { useState, useEffect } from "react";
import { Pause, Play, Plus, RefreshCw, Trash2 } from "lucide-react";
import Layout from "../components/Layout";
import { mqttAPI } from "../services/api";
import { useToast } from "../components/Toast";
import Button from "../components/ui/Button";
import Card from "../components/ui/Card";
import Input from "../components/ui/Input";

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
      setTopics(res.data.data || []);
    } catch {
      toast.error("Failed to fetch MQTT topics");
    }
  };

  const fetchStatus = async () => {
    try {
      const res = await mqttAPI.getStatus();
      setStatus(res.data.data);
    } catch {
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
      toast.success(topic.isActive ? "Topic deactivated" : "Topic activated");
      await fetchAll();
    } catch {
      toast.error("Failed to toggle topic");
    }
  };

  const handleDelete = async (topic) => {
    if (!confirm(`Remove topic "${topic.topicFilter}"?`)) return;

    try {
      await mqttAPI.delete(topic.topicId);
      toast.success("Topic removed");
      await fetchAll();
    } catch {
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
        <Card style={{ display: "grid", placeItems: "center" }}>
          <div className="spinner" />
        </Card>
      </Layout>
    );
  }

  const subscribedSet = new Set(status?.subscribedTopics || []);

  return (
    <Layout>
      <div className="page-head">
        <div>
          <h1 className="page-title">MQTT Topics</h1>
          <p className="page-subtitle">Configure broker subscriptions sent to websocket clients</p>
        </div>
        <Button onClick={handleReload} icon={RefreshCw}>Reload Subscriptions</Button>
      </div>

      <Card className="grid" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))" }}>
        <div>
          <div className="muted">Bridge</div>
          <span className={`badge ${status?.connected ? "success" : "error"}`}>
            {status?.connected ? "Connected" : "Disconnected"}
          </span>
        </div>
        <div>
          <div className="muted">Broker</div>
          <code>{status?.brokerUrl || "-"}</code>
        </div>
        <div>
          <div className="muted">Subscribed</div>
          <strong>{status?.subscribedTopics?.length || 0} topic(s)</strong>
        </div>
      </Card>

      <Card>
        <h2 className="page-title" style={{ fontSize: "1.05rem" }}>Add Topic</h2>
        <form onSubmit={handleAdd} className="grid" style={{ marginTop: "0.7rem" }}>
          <Input
            type="text"
            placeholder="Topic filter (e.g. /monitoring/gate or #)"
            value={form.topicFilter}
            onChange={(e) => setForm({ ...form, topicFilter: e.target.value })}
            required
          />
          <Input
            type="text"
            placeholder="Description (optional)"
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
          />
          <div>
            <Button type="submit" disabled={submitting} variant="primary" icon={Plus}>
              {submitting ? "Adding..." : "Add"}
            </Button>
          </div>
        </form>
      </Card>

      <Card className="table-wrap">
        <h2 className="page-title" style={{ fontSize: "1.05rem" }}>Configured Topics</h2>
        {topics.length === 0 ? (
          <div className="empty" style={{ marginTop: "0.75rem" }}>
            No topics yet. Add one above to start broadcasting MQTT messages.
          </div>
        ) : (
          <table className="ui-table" style={{ marginTop: "0.5rem" }}>
            <thead>
              <tr>
                <th>Topic Filter</th>
                <th>Description</th>
                <th>Active</th>
                <th>Subscribed</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {topics.map((topic) => (
                <tr key={topic.topicId}>
                  <td><code>{topic.topicFilter}</code></td>
                  <td>{topic.description || "-"}</td>
                  <td>
                    <span className={`badge ${topic.isActive ? "success" : ""}`}>
                      {topic.isActive ? "Active" : "Inactive"}
                    </span>
                  </td>
                  <td>
                    <span className={`badge ${subscribedSet.has(topic.topicFilter) ? "success" : ""}`}>
                      {subscribedSet.has(topic.topicFilter) ? "Yes" : "No"}
                    </span>
                  </td>
                  <td>
                    <div className="actions">
                      <Button onClick={() => handleToggle(topic)} icon={topic.isActive ? Pause : Play}>
                        {topic.isActive ? "Deactivate" : "Activate"}
                      </Button>
                      <Button onClick={() => handleDelete(topic)} variant="destructive" icon={Trash2}>
                        Delete
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </Layout>
  );
};

export default MqttTopics;
