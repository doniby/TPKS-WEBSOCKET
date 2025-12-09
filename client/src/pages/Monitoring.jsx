import { useState, useEffect } from 'react';
import { monitoringAPI } from '../services/api';
import Layout from '../components/Layout';

const Monitoring = () => {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchStats();
    const interval = setInterval(fetchStats, 3000); // Refresh every 3s
    return () => clearInterval(interval);
  }, []);

  const fetchStats = async () => {
    try {
      const response = await monitoringAPI.getStats();
      setStats(response.data.data);
    } catch (error) {
      console.error('Failed to fetch stats');
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return <Layout><div style={styles.loading}>Loading...</div></Layout>;
  }

  const formatBytes = (bytes) => (bytes / 1024 / 1024).toFixed(2) + ' MB';
  const formatUptime = (seconds) => {
    const days = Math.floor(seconds / 86400);
    const hours = Math.floor((seconds % 86400) / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    return days > 0 ? `${days}d ${hours}h` : `${hours}h ${minutes}m`;
  };

  return (
    <Layout>
      <h1 style={styles.title}>Real-Time Monitoring</h1>
      <div style={styles.subtitle}>Auto-refreshing every 3 seconds</div>

      <div style={styles.grid}>
        <div style={styles.card}>
          <h3 style={styles.cardTitle}>WebSocket Status</h3>
          <div style={styles.metric}>
            <span>Connected Clients:</span>
            <strong style={styles.metricValue}>
              {stats?.websocket.connectedClients || 0}
            </strong>
          </div>
          <div style={styles.metric}>
            <span>Rooms:</span>
            <strong style={styles.metricValue}>
              {stats?.websocket.rooms || 0}
            </strong>
          </div>
        </div>

        <div style={styles.card}>
          <h3 style={styles.cardTitle}>Database Pool</h3>
          <div style={styles.metric}>
            <span>Connections In Use:</span>
            <strong style={styles.metricValue}>
              {stats?.database.connectionsInUse || 0} / {stats?.database.poolMax || 0}
            </strong>
          </div>
          <div style={styles.progressBar}>
            <div
              style={{
                ...styles.progressFill,
                width: `${((stats?.database.connectionsInUse || 0) / (stats?.database.poolMax || 1)) * 100}%`
              }}
            />
          </div>
          <div style={styles.metric}>
            <span>Total Open:</span>
            <strong style={styles.metricValue}>
              {stats?.database.connectionsOpen || 0}
            </strong>
          </div>
        </div>

        <div style={styles.card}>
          <h3 style={styles.cardTitle}>System Resources</h3>
          <div style={styles.metric}>
            <span>Memory (Heap):</span>
            <strong style={styles.metricValue}>
              {formatBytes(stats?.system.memoryUsage.heapUsed || 0)}
            </strong>
          </div>
          <div style={styles.progressBar}>
            <div
              style={{
                ...styles.progressFill,
                width: `${((stats?.system.memoryUsage.heapUsed || 0) / (stats?.system.memoryUsage.heapTotal || 1)) * 100}%`
              }}
            />
          </div>
          <div style={styles.metric}>
            <span>Uptime:</span>
            <strong style={styles.metricValue}>
              {formatUptime(stats?.system.uptime || 0)}
            </strong>
          </div>
        </div>
      </div>

      <div style={styles.section}>
        <h2 style={styles.sectionTitle}>Event Execution Statistics</h2>
        {!stats?.events || stats.events.length === 0 ? (
          <div style={styles.empty}>No active events</div>
        ) : (
          <div style={styles.table}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={styles.tableHeader}>
                  <th style={styles.th}>Event</th>
                  <th style={styles.th}>Interval</th>
                  <th style={styles.th}>Status</th>
                  <th style={styles.th}>Total</th>
                  <th style={styles.th}>Success</th>
                  <th style={styles.th}>Errors</th>
                  <th style={styles.th}>Skipped</th>
                  <th style={styles.th}>Last Time</th>
                  <th style={styles.th}>Last Status</th>
                </tr>
              </thead>
              <tbody>
                {stats.events.map((event) => (
                  <tr key={event.eventId} style={styles.tableRow}>
                    <td style={styles.td}>
                      <strong>{event.eventName}</strong>
                    </td>
                    <td style={styles.td}>{event.intervalSeconds}s</td>
                    <td style={styles.td}>
                      <span style={{
                        ...styles.badge,
                        ...(event.isRunning ? styles.badgeRunning : styles.badgeIdle)
                      }}>
                        {event.isRunning ? 'Running' : 'Idle'}
                      </span>
                    </td>
                    <td style={styles.td}>{event.stats.totalExecutions}</td>
                    <td style={styles.td}>
                      <span style={styles.successText}>
                        {event.stats.successCount}
                      </span>
                    </td>
                    <td style={styles.td}>
                      <span style={event.stats.errorCount > 0 ? styles.errorText : {}}>
                        {event.stats.errorCount}
                      </span>
                    </td>
                    <td style={styles.td}>
                      <span style={event.stats.skippedCount > 0 ? styles.warningText : {}}>
                        {event.stats.skippedCount}
                      </span>
                    </td>
                    <td style={styles.td}>
                      {event.stats.lastExecutionTime ? `${event.stats.lastExecutionTime}ms` : 'N/A'}
                    </td>
                    <td style={styles.td}>
                      {event.stats.lastExecutionStatus && (
                        <span style={{
                          ...styles.badge,
                          ...(event.stats.lastExecutionStatus === 'success'
                            ? styles.badgeSuccess
                            : styles.badgeError)
                        }}>
                          {event.stats.lastExecutionStatus}
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {stats?.events && stats.events.some(e => e.stats.skippedCount > 0) && (
        <div style={styles.alert}>
          Some events have been skipped due to previous execution still running.
          Consider increasing their intervals or optimizing queries.
        </div>
      )}
    </Layout>
  );
};

const styles = {
  loading: { padding: '40px', textAlign: 'center', fontSize: '18px', color: '#666' },
  title: { fontSize: '32px', fontWeight: 'bold', color: '#333', marginBottom: '5px' },
  subtitle: { fontSize: '14px', color: '#999', marginBottom: '30px' },
  grid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '20px', marginBottom: '40px' },
  card: { background: 'white', borderRadius: '12px', padding: '25px', boxShadow: '0 2px 8px rgba(0,0,0,0.1)' },
  cardTitle: { fontSize: '16px', fontWeight: '600', color: '#333', marginBottom: '20px', marginTop: 0 },
  metric: { display: 'flex', justifyContent: 'space-between', padding: '10px 0', fontSize: '14px', color: '#666' },
  metricValue: { color: '#333', fontSize: '16px' },
  progressBar: { width: '100%', height: '8px', background: '#f0f0f0', borderRadius: '4px', overflow: 'hidden', margin: '5px 0 15px 0' },
  progressFill: { height: '100%', background: 'linear-gradient(90deg, #667eea, #764ba2)', transition: 'width 0.3s' },
  section: { marginBottom: '40px' },
  sectionTitle: { fontSize: '22px', fontWeight: '600', color: '#333', marginBottom: '20px' },
  empty: { padding: '40px', textAlign: 'center', background: 'white', borderRadius: '12px', color: '#999' },
  table: { background: 'white', borderRadius: '12px', padding: '20px', boxShadow: '0 2px 8px rgba(0,0,0,0.1)', overflow: 'auto' },
  tableHeader: { background: '#f8f9fa' },
  th: { padding: '12px', textAlign: 'left', fontWeight: '600', color: '#333', fontSize: '13px', whiteSpace: 'nowrap' },
  tableRow: { borderBottom: '1px solid #f0f0f0' },
  td: { padding: '12px', fontSize: '14px', color: '#666', whiteSpace: 'nowrap' },
  badge: { padding: '4px 12px', borderRadius: '12px', fontSize: '12px', fontWeight: '500', display: 'inline-block' },
  badgeRunning: { background: '#fff3e0', color: '#f57c00' },
  badgeIdle: { background: '#f5f5f5', color: '#999' },
  badgeSuccess: { background: '#e8f5e9', color: '#2e7d32' },
  badgeError: { background: '#ffebee', color: '#c62828' },
  successText: { color: '#2e7d32', fontWeight: '500' },
  errorText: { color: '#c62828', fontWeight: '500' },
  warningText: { color: '#f57c00', fontWeight: '500' },
  alert: { padding: '15px 20px', background: '#fff3e0', border: '1px solid #ffb74d', borderRadius: '8px', color: '#e65100', fontSize: '14px' },
};

export default Monitoring;
