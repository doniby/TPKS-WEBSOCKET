import { useState, useEffect } from 'react';
import { eventsAPI } from '../services/api';
import Layout from '../components/Layout';

const Events = () => {
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingEvent, setEditingEvent] = useState(null);
  const [formData, setFormData] = useState({
    eventName: '',
    sqlQuery: '',
    intervalSeconds: 5,
  });
  const [testResult, setTestResult] = useState(null);
  const [testing, setTesting] = useState(false);

  useEffect(() => {
    fetchEvents();
  }, []);

  const fetchEvents = async () => {
    try {
      const response = await eventsAPI.getAll();
      setEvents(response.data.data);
    } catch (error) {
      alert('Failed to fetch events');
    } finally {
      setLoading(false);
    }
  };

  const handleTestQuery = async () => {
    if (!formData.sqlQuery.trim()) {
      alert('Please enter a SQL query');
      return;
    }

    setTesting(true);
    setTestResult(null);

    try {
      const response = await eventsAPI.testQuery(formData.sqlQuery);
      setTestResult(response.data.data);

      // Auto-suggest interval if not modified
      if (!editingEvent && formData.intervalSeconds === 5) {
        setFormData(prev => ({
          ...prev,
          intervalSeconds: response.data.data.suggestedInterval
        }));
      }
    } catch (error) {
      setTestResult({
        error: true,
        message: error.response?.data?.message || 'Query execution failed',
        details: error.response?.data?.error
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
        alert('Event updated successfully');
      } else {
        await eventsAPI.create(formData);
        alert('Event created successfully');
      }

      setShowModal(false);
      setEditingEvent(null);
      setFormData({ eventName: '', sqlQuery: '', intervalSeconds: 5 });
      setTestResult(null);
      fetchEvents();
    } catch (error) {
      alert(error.response?.data?.message || 'Operation failed');
    }
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
      alert('Event deleted successfully');
      fetchEvents();
    } catch (error) {
      alert('Failed to delete event');
    }
  };

  const handleToggle = async (id, name) => {
    try {
      await eventsAPI.toggle(id);
      fetchEvents();
    } catch (error) {
      alert('Failed to toggle event');
    }
  };

  const openCreateModal = () => {
    setEditingEvent(null);
    setFormData({ eventName: '', sqlQuery: '', intervalSeconds: 5 });
    setTestResult(null);
    setShowModal(true);
  };

  if (loading) {
    return <Layout><div style={styles.loading}>Loading...</div></Layout>;
  }

  return (
    <Layout>
      <div style={styles.header}>
        <h1 style={styles.title}>Event Management</h1>
        <button onClick={openCreateModal} style={styles.createBtn}>
          + Create New Event
        </button>
      </div>

      {events.length === 0 ? (
        <div style={styles.empty}>
          No events yet. Create your first event to start broadcasting data.
        </div>
      ) : (
        <div style={styles.table}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={styles.tableHeader}>
                <th style={styles.th}>Name</th>
                <th style={styles.th}>Interval</th>
                <th style={styles.th}>Status</th>
                <th style={styles.th}>Last Execution</th>
                <th style={styles.th}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {events.map((event) => (
                <tr key={event.EVENT_ID} style={styles.tableRow}>
                  <td style={styles.td}>{event.EVENT_NAME}</td>
                  <td style={styles.td}>{event.INTERVAL_SECONDS}s</td>
                  <td style={styles.td}>
                    <span style={{
                      ...styles.badge,
                      ...(event.IS_ACTIVE ? styles.badgeActive : styles.badgeInactive)
                    }}>
                      {event.IS_ACTIVE ? 'Active' : 'Inactive'}
                    </span>
                    {event.LAST_EXECUTION_STATUS && (
                      <span style={{
                        ...styles.badge,
                        marginLeft: '5px',
                        ...(event.LAST_EXECUTION_STATUS === 'success'
                          ? styles.badgeSuccess
                          : styles.badgeError)
                      }}>
                        {event.LAST_EXECUTION_STATUS}
                      </span>
                    )}
                  </td>
                  <td style={styles.td}>
                    {event.LAST_EXECUTION_TIME ? `${event.LAST_EXECUTION_TIME}ms` : 'N/A'}
                  </td>
                  <td style={styles.td}>
                    <button
                      onClick={() => handleToggle(event.EVENT_ID, event.EVENT_NAME)}
                      style={styles.actionBtn}
                    >
                      {event.IS_ACTIVE ? 'Pause' : 'Resume'}
                    </button>
                    <button
                      onClick={() => handleEdit(event)}
                      style={{ ...styles.actionBtn, marginLeft: '8px' }}
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => handleDelete(event.EVENT_ID, event.EVENT_NAME)}
                      style={{ ...styles.actionBtn, ...styles.actionBtnDanger, marginLeft: '8px' }}
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

      {showModal && (
        <div style={styles.modal} onClick={() => setShowModal(false)}>
          <div style={styles.modalContent} onClick={(e) => e.stopPropagation()}>
            <h2 style={styles.modalTitle}>
              {editingEvent ? 'Edit Event' : 'Create New Event'}
            </h2>

            <form onSubmit={handleSubmit}>
              <div style={styles.formGroup}>
                <label style={styles.label}>Event Name</label>
                <input
                  type="text"
                  value={formData.eventName}
                  onChange={(e) => setFormData({ ...formData, eventName: e.target.value })}
                  required
                  style={styles.input}
                  placeholder="e.g., Vessel Alongside"
                />
              </div>

              <div style={styles.formGroup}>
                <label style={styles.label}>SQL Query</label>
                <textarea
                  value={formData.sqlQuery}
                  onChange={(e) => setFormData({ ...formData, sqlQuery: e.target.value })}
                  required
                  rows={8}
                  style={{ ...styles.input, fontFamily: 'monospace', fontSize: '13px' }}
                  placeholder="SELECT ..."
                />
                <button
                  type="button"
                  onClick={handleTestQuery}
                  disabled={testing}
                  style={styles.testBtn}
                >
                  {testing ? 'Testing...' : 'Test Query'}
                </button>
              </div>

              {testResult && (
                <div style={{
                  ...styles.testResult,
                  ...(testResult.error ? styles.testResultError : styles.testResultSuccess)
                }}>
                  {testResult.error ? (
                    <>
                      <strong>Query Failed:</strong> {testResult.message}
                      {testResult.details && <div style={{ marginTop: '5px', fontSize: '12px' }}>{testResult.details}</div>}
                    </>
                  ) : (
                    <>
                      <div style={styles.testResultRow}>
                        <span>Execution Time:</span>
                        <strong>{testResult.executionTime}ms</strong>
                      </div>
                      <div style={styles.testResultRow}>
                        <span>Rows Returned:</span>
                        <strong>{testResult.rowCount}</strong>
                      </div>
                      <div style={styles.testResultRow}>
                        <span>Suggested Interval:</span>
                        <strong>{testResult.suggestedInterval}s</strong>
                      </div>
                      {testResult.warning && (
                        <div style={styles.warning}>{testResult.warning}</div>
                      )}
                      {testResult.preview && testResult.preview.length > 0 && (
                        <details style={{ marginTop: '10px' }}>
                          <summary style={{ cursor: 'pointer', fontWeight: '500' }}>
                            Preview Data ({testResult.preview.length} rows)
                          </summary>
                          <pre style={styles.previewData}>
                            {JSON.stringify(testResult.preview, null, 2)}
                          </pre>
                        </details>
                      )}
                    </>
                  )}
                </div>
              )}

              <div style={styles.formGroup}>
                <label style={styles.label}>Interval (seconds)</label>
                <input
                  type="number"
                  value={formData.intervalSeconds}
                  onChange={(e) => setFormData({ ...formData, intervalSeconds: parseInt(e.target.value) })}
                  required
                  min="1"
                  style={styles.input}
                />
                {testResult && !testResult.error && formData.intervalSeconds < testResult.suggestedInterval && (
                  <div style={styles.intervalWarning}>
                    Recommended minimum: {testResult.suggestedInterval}s (based on query execution time)
                  </div>
                )}
              </div>

              <div style={styles.modalActions}>
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  style={styles.cancelBtn}
                >
                  Cancel
                </button>
                <button type="submit" style={styles.submitBtn}>
                  {editingEvent ? 'Update Event' : 'Create Event'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </Layout>
  );
};

const styles = {
  loading: { padding: '40px', textAlign: 'center', fontSize: '18px', color: '#666' },
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '30px' },
  title: { fontSize: '32px', fontWeight: 'bold', color: '#333', margin: 0 },
  createBtn: { padding: '12px 24px', background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)', color: 'white', border: 'none', borderRadius: '8px', fontSize: '15px', fontWeight: '600', cursor: 'pointer' },
  empty: { padding: '60px 20px', textAlign: 'center', background: 'white', borderRadius: '12px', color: '#666', fontSize: '16px' },
  table: { background: 'white', borderRadius: '12px', padding: '20px', boxShadow: '0 2px 8px rgba(0,0,0,0.1)', overflow: 'auto' },
  tableHeader: { background: '#f8f9fa' },
  th: { padding: '12px', textAlign: 'left', fontWeight: '600', color: '#333', fontSize: '14px' },
  tableRow: { borderBottom: '1px solid #f0f0f0' },
  td: { padding: '12px', fontSize: '14px', color: '#666' },
  badge: { padding: '4px 12px', borderRadius: '12px', fontSize: '12px', fontWeight: '500', display: 'inline-block' },
  badgeActive: { background: '#e8f5e9', color: '#2e7d32' },
  badgeInactive: { background: '#f5f5f5', color: '#999' },
  badgeSuccess: { background: '#e3f2fd', color: '#1976d2' },
  badgeError: { background: '#ffebee', color: '#c62828' },
  actionBtn: { padding: '6px 12px', background: '#f5f5f5', border: '1px solid #ddd', borderRadius: '6px', fontSize: '13px', cursor: 'pointer' },
  actionBtnDanger: { background: '#ffebee', border: '1px solid #ffcdd2', color: '#c62828' },
  modal: { position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '20px' },
  modalContent: { background: 'white', borderRadius: '12px', padding: '30px', maxWidth: '700px', width: '100%', maxHeight: '90vh', overflow: 'auto' },
  modalTitle: { fontSize: '24px', fontWeight: '600', marginBottom: '25px', color: '#333' },
  formGroup: { marginBottom: '20px' },
  label: { display: 'block', marginBottom: '8px', fontSize: '14px', fontWeight: '500', color: '#333' },
  input: { width: '100%', padding: '10px', fontSize: '14px', border: '1px solid #ddd', borderRadius: '6px', boxSizing: 'border-box' },
  testBtn: { marginTop: '10px', padding: '8px 16px', background: '#e3f2fd', border: '1px solid #90caf9', borderRadius: '6px', fontSize: '13px', cursor: 'pointer', fontWeight: '500', color: '#1976d2' },
  testResult: { padding: '15px', borderRadius: '8px', marginTop: '10px', fontSize: '14px' },
  testResultSuccess: { background: '#e8f5e9', border: '1px solid #a5d6a7' },
  testResultError: { background: '#ffebee', border: '1px solid #ffcdd2', color: '#c62828' },
  testResultRow: { display: 'flex', justifyContent: 'space-between', padding: '5px 0' },
  warning: { marginTop: '10px', padding: '10px', background: '#fff3e0', border: '1px solid #ffb74d', borderRadius: '6px', fontSize: '13px', color: '#e65100' },
  intervalWarning: { marginTop: '5px', fontSize: '13px', color: '#f57c00' },
  previewData: { marginTop: '10px', padding: '10px', background: '#f5f5f5', borderRadius: '6px', fontSize: '12px', overflow: 'auto', maxHeight: '200px' },
  modalActions: { display: 'flex', gap: '10px', justifyContent: 'flex-end', marginTop: '25px' },
  cancelBtn: { padding: '10px 20px', background: '#f5f5f5', border: '1px solid #ddd', borderRadius: '6px', fontSize: '14px', cursor: 'pointer' },
  submitBtn: { padding: '10px 24px', background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)', color: 'white', border: 'none', borderRadius: '6px', fontSize: '14px', fontWeight: '600', cursor: 'pointer' },
};

export default Events;
