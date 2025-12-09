import { useState, useEffect } from 'react';
import { monitoringAPI } from '../services/api';
import Layout from '../components/Layout';

const Dashboard = () => {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetchStats();
    const interval = setInterval(fetchStats, 5000); // Refresh every 5s
    return () => clearInterval(interval);
  }, []);

  const fetchStats = async () => {
    try {
      const response = await monitoringAPI.getStats();
      setStats(response.data.data);
      setError(null);
    } catch (err) {
      setError('Failed to fetch stats');
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <Layout>
        <div style={styles.loading}>Loading...</div>
      </Layout>
    );
  }

  if (error) {
    return (
      <Layout>
        <div style={styles.error}>{error}</div>
      </Layout>
    );
  }

  const formatBytes = (bytes) => {
    return (bytes / 1024 / 1024).toFixed(2) + ' MB';
  };

  const formatUptime = (seconds) => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    return `${hours}h ${minutes}m`;
  };

  return (
    <Layout>
      <h1 style={styles.title}>Dashboard Overview</h1>

      <div style={styles.grid}>
        <div style={styles.card}>
          <div style={styles.cardIcon}>🔌</div>
          <div style={styles.cardTitle}>WebSocket Connections</div>
          <div style={styles.cardValue}>{stats?.websocket.connectedClients || 0}</div>
          <div style={styles.cardSubtext}>Active clients</div>
        </div>

        <div style={styles.card}>
          <div style={styles.cardIcon}>📊</div>
          <div style={styles.cardTitle}>Active Events</div>
          <div style={styles.cardValue}>{stats?.events.length || 0}</div>
          <div style={styles.cardSubtext}>Running queries</div>
        </div>

        <div style={styles.card}>
          <div style={styles.cardIcon}>💾</div>
          <div style={styles.cardTitle}>Database Connections</div>
          <div style={styles.cardValue}>
            {stats?.database.connectionsInUse || 0}/{stats?.database.poolMax || 0}
          </div>
          <div style={styles.cardSubtext}>Pool usage</div>
        </div>

        <div style={styles.card}>
          <div style={styles.cardIcon}>⏱️</div>
          <div style={styles.cardTitle}>Uptime</div>
          <div style={styles.cardValue}>
            {formatUptime(stats?.system.uptime || 0)}
          </div>
          <div style={styles.cardSubtext}>Server running</div>
        </div>
      </div>

      <div style={styles.section}>
        <h2 style={styles.sectionTitle}>System Information</h2>
        <div style={styles.infoCard}>
          <div style={styles.infoRow}>
            <span>Memory Usage (Heap):</span>
            <strong>{formatBytes(stats?.system.memoryUsage.heapUsed || 0)} / {formatBytes(stats?.system.memoryUsage.heapTotal || 0)}</strong>
          </div>
          <div style={styles.infoRow}>
            <span>Node Version:</span>
            <strong>{stats?.system.nodeVersion}</strong>
          </div>
          <div style={styles.infoRow}>
            <span>Environment:</span>
            <strong>{stats?.system.env}</strong>
          </div>
          <div style={styles.infoRow}>
            <span>Platform:</span>
            <strong>{stats?.system.platform}</strong>
          </div>
        </div>
      </div>

      {stats?.events && stats.events.length > 0 && (
        <div style={styles.section}>
          <h2 style={styles.sectionTitle}>Event Status</h2>
          <div style={styles.table}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={styles.tableHeader}>
                  <th style={styles.th}>Event Name</th>
                  <th style={styles.th}>Interval</th>
                  <th style={styles.th}>Status</th>
                  <th style={styles.th}>Executions</th>
                  <th style={styles.th}>Success Rate</th>
                  <th style={styles.th}>Last Execution</th>
                </tr>
              </thead>
              <tbody>
                {stats.events.map((event) => (
                  <tr key={event.eventId} style={styles.tableRow}>
                    <td style={styles.td}>{event.eventName}</td>
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
                      {event.stats.totalExecutions > 0
                        ? ((event.stats.successCount / event.stats.totalExecutions) * 100).toFixed(1) + '%'
                        : 'N/A'
                      }
                    </td>
                    <td style={styles.td}>
                      {event.stats.lastExecutionTime
                        ? event.stats.lastExecutionTime + 'ms'
                        : 'N/A'
                      }
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </Layout>
  );
};

const styles = {
  loading: {
    padding: '40px',
    textAlign: 'center',
    fontSize: '18px',
    color: '#666',
  },
  error: {
    padding: '20px',
    background: '#fee',
    border: '1px solid #fcc',
    borderRadius: '8px',
    color: '#c33',
  },
  title: {
    fontSize: '32px',
    fontWeight: 'bold',
    color: '#333',
    marginBottom: '30px',
  },
  grid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))',
    gap: '20px',
    marginBottom: '40px',
  },
  card: {
    background: 'white',
    borderRadius: '12px',
    padding: '25px',
    boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
  },
  cardIcon: {
    fontSize: '32px',
    marginBottom: '10px',
  },
  cardTitle: {
    fontSize: '14px',
    color: '#666',
    marginBottom: '10px',
  },
  cardValue: {
    fontSize: '32px',
    fontWeight: 'bold',
    color: '#333',
    marginBottom: '5px',
  },
  cardSubtext: {
    fontSize: '13px',
    color: '#999',
  },
  section: {
    marginBottom: '40px',
  },
  sectionTitle: {
    fontSize: '22px',
    fontWeight: '600',
    color: '#333',
    marginBottom: '20px',
  },
  infoCard: {
    background: 'white',
    borderRadius: '12px',
    padding: '20px',
    boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
  },
  infoRow: {
    display: 'flex',
    justifyContent: 'space-between',
    padding: '12px 0',
    borderBottom: '1px solid #f0f0f0',
    fontSize: '15px',
  },
  table: {
    background: 'white',
    borderRadius: '12px',
    padding: '20px',
    boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
    overflow: 'auto',
  },
  tableHeader: {
    background: '#f8f9fa',
  },
  th: {
    padding: '12px',
    textAlign: 'left',
    fontWeight: '600',
    color: '#333',
    fontSize: '14px',
  },
  tableRow: {
    borderBottom: '1px solid #f0f0f0',
  },
  td: {
    padding: '12px',
    fontSize: '14px',
    color: '#666',
  },
  badge: {
    padding: '4px 12px',
    borderRadius: '12px',
    fontSize: '12px',
    fontWeight: '500',
  },
  badgeRunning: {
    background: '#e8f5e9',
    color: '#2e7d32',
  },
  badgeIdle: {
    background: '#f5f5f5',
    color: '#666',
  },
};

export default Dashboard;
