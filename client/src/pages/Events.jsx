import { useState, useEffect } from "react";
import { FlaskConical, Pause, Pencil, Play, Plus, Save, Trash2, X } from "lucide-react";
import Layout from "../components/Layout";
import Dialog from "../components/ui/Dialog";
import Button from "../components/ui/Button";
import Card from "../components/ui/Card";
import Input from "../components/ui/Input";
import Textarea from "../components/ui/Textarea";
import { eventsAPI } from "../services/api";
import { useToast } from "../components/Toast";

const initialForm = {
  eventName: "",
  sqlQuery: "",
  intervalSeconds: 5,
};

const Events = () => {
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingEvent, setEditingEvent] = useState(null);
  const [formData, setFormData] = useState(initialForm);
  const [testResult, setTestResult] = useState(null);
  const [testing, setTesting] = useState(false);
  const toast = useToast();

  useEffect(() => {
    fetchEvents();
  }, []);

  const fetchEvents = async () => {
    try {
      const response = await eventsAPI.getAll();
      setEvents(response.data.data || []);
    } catch {
      toast.error("Failed to fetch events");
    } finally {
      setLoading(false);
    }
  };

  const openCreateModal = () => {
    setEditingEvent(null);
    setFormData(initialForm);
    setTestResult(null);
    setShowModal(true);
  };

  const handleEdit = (event) => {
    setEditingEvent(event);
    setFormData({
      eventName: event.EVENT_NAME,
      sqlQuery: event.SQL_QUERY,
      intervalSeconds: event.INTERVAL_SECONDS,
    });
    setTestResult(null);
    setShowModal(true);
  };

  const handleDelete = async (id, name) => {
    if (!confirm(`Delete event "${name}"?`)) return;

    try {
      await eventsAPI.delete(id);
      toast.success("Event deleted successfully");
      fetchEvents();
    } catch {
      toast.error("Failed to delete event");
    }
  };

  const handleToggle = async (id, name) => {
    try {
      await eventsAPI.toggle(id);
      toast.info(`Event "${name}" toggled`);
      fetchEvents();
    } catch {
      toast.error("Failed to toggle event");
    }
  };

  const handleTestQuery = async () => {
    if (!formData.sqlQuery.trim()) {
      toast.warning("Please enter a SQL query");
      return;
    }

    setTesting(true);
    setTestResult(null);

    try {
      const response = await eventsAPI.testQuery(formData.sqlQuery);
      setTestResult(response.data.data);

      if (!editingEvent && formData.intervalSeconds === 5) {
        setFormData((prev) => ({
          ...prev,
          intervalSeconds: response.data.data.suggestedInterval,
        }));
      }
    } catch (error) {
      setTestResult({
        error: true,
        message: error.response?.data?.message || "Query execution failed",
        details: error.response?.data?.error,
      });
    } finally {
      setTesting(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    try {
      if (editingEvent) {
        await eventsAPI.update(editingEvent.EVENT_ID, formData);
        toast.success("Event updated successfully");
      } else {
        await eventsAPI.create(formData);
        toast.success("Event created successfully");
      }

      setShowModal(false);
      setEditingEvent(null);
      setFormData(initialForm);
      setTestResult(null);
      fetchEvents();
    } catch (error) {
      toast.error(error.response?.data?.message || "Operation failed");
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
          <h1 className="page-title">Event Management</h1>
          <p className="page-subtitle">Manage SQL events and broadcast intervals</p>
        </div>
        <Button onClick={openCreateModal} variant="primary" icon={Plus}>
          Create Event
        </Button>
      </div>

      {events.length === 0 ? (
        <div className="empty">No events yet. Create your first event to start broadcasting data.</div>
      ) : (
        <Card className="table-wrap">
          <table className="ui-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Interval</th>
                <th>Status</th>
                <th>Last Execution</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {events.map((event) => (
                <tr key={event.EVENT_ID}>
                  <td>{event.EVENT_NAME}</td>
                  <td>{event.INTERVAL_SECONDS}s</td>
                  <td>
                    <span className={`badge ${event.IS_ACTIVE ? "success" : ""}`}>
                      {event.IS_ACTIVE ? "Active" : "Inactive"}
                    </span>{" "}
                    {(event.RUNTIME_STATUS || event.LAST_EXECUTION_STATUS) && (
                      <span
                        className={`badge ${
                          (event.RUNTIME_STATUS || event.LAST_EXECUTION_STATUS) === "success"
                            ? "success"
                            : "error"
                        }`}
                      >
                        {event.RUNTIME_STATUS || event.LAST_EXECUTION_STATUS}
                      </span>
                    )}
                  </td>
                  <td>
                    {event.RUNTIME_LAST_EXECUTION_TIME || event.LAST_EXECUTION_TIME
                      ? `${event.RUNTIME_LAST_EXECUTION_TIME || event.LAST_EXECUTION_TIME}ms`
                      : "N/A"}
                  </td>
                  <td>
                    <div className="actions">
                      <Button
                        onClick={() => handleToggle(event.EVENT_ID, event.EVENT_NAME)}
                        icon={event.IS_ACTIVE ? Pause : Play}
                      >
                        {event.IS_ACTIVE ? "Pause" : "Resume"}
                      </Button>
                      <Button onClick={() => handleEdit(event)} icon={Pencil}>
                        Edit
                      </Button>
                      <Button
                        onClick={() => handleDelete(event.EVENT_ID, event.EVENT_NAME)}
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

      <Dialog
        open={showModal}
        onClose={() => setShowModal(false)}
        title={editingEvent ? "Edit Event" : "Create New Event"}
      >
        <form onSubmit={handleSubmit} className="grid">
          <div className="field">
            <label>Event Name</label>
            <Input
              type="text"
              value={formData.eventName}
              onChange={(e) => setFormData({ ...formData, eventName: e.target.value })}
              required
              placeholder="e.g., Vessel Alongside"
            />
          </div>

          <div className="field">
            <label>SQL Query</label>
            <Textarea
              value={formData.sqlQuery}
              onChange={(e) => setFormData({ ...formData, sqlQuery: e.target.value })}
              required
              rows={8}
              style={{ fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace" }}
              placeholder="SELECT ..."
            />
            <div>
              <Button type="button" onClick={handleTestQuery} disabled={testing} icon={FlaskConical}>
                {testing ? "Testing..." : "Test Query"}
              </Button>
            </div>
          </div>

          {testResult && (
            <div className={`alert ${testResult.error ? "error" : ""}`}>
              {testResult.error ? (
                <>
                  <strong>Query Failed:</strong> {testResult.message}
                  {testResult.details && <div className="help">{testResult.details}</div>}
                </>
              ) : (
                <div className="grid" style={{ gap: "0.2rem" }}>
                  <div>Execution Time: <strong>{testResult.executionTime}ms</strong></div>
                  <div>Rows Returned: <strong>{testResult.rowCount}</strong></div>
                  <div>Suggested Interval: <strong>{testResult.suggestedInterval}s</strong></div>
                  {testResult.warning && <div className="badge warn">{testResult.warning}</div>}
                  {testResult.preview && testResult.preview.length > 0 && (
                    <details>
                      <summary>Preview Data ({testResult.preview.length} rows)</summary>
                      <pre className="surface" style={{ overflow: "auto", marginTop: "0.5rem" }}>
                        {JSON.stringify(testResult.preview, null, 2)}
                      </pre>
                    </details>
                  )}
                </div>
              )}
            </div>
          )}

          <div className="field">
            <label>Interval (seconds)</label>
            <Input
              type="number"
              value={formData.intervalSeconds}
              onChange={(e) =>
                setFormData({ ...formData, intervalSeconds: parseInt(e.target.value, 10) })
              }
              min="1"
              required
            />
            {testResult && !testResult.error && formData.intervalSeconds < testResult.suggestedInterval && (
              <div className="help">Recommended minimum: {testResult.suggestedInterval}s</div>
            )}
          </div>

          <div className="modal-actions">
            <Button type="button" onClick={() => setShowModal(false)} icon={X}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" icon={Save}>
              {editingEvent ? "Update Event" : "Create Event"}
            </Button>
          </div>
        </form>
      </Dialog>
    </Layout>
  );
};

export default Events;
