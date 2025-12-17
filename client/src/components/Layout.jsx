import { Link, useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import ConnectionStatus from "./ConnectionStatus";

const Layout = ({ children }) => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const handleLogout = () => {
    logout();
    navigate("/login");
  };

  const isActive = (path) => location.pathname === path;

  return (
    <div style={styles.container}>
      <div style={styles.sidebar}>
        <div style={styles.logo}>
          <h2 style={styles.logoText}>WEBSOCKET MONITORING</h2>
          <p style={styles.logoSubtext}>Admin Panel</p>
        </div>

        <div style={{ padding: "0 15px", marginBottom: "20px" }}>
          <ConnectionStatus />
        </div>

        <nav style={styles.nav}>
          <Link
            to="/"
            style={{
              ...styles.navLink,
              ...(isActive("/") ? styles.navLinkActive : {}),
            }}
          >
            📊 Dashboard
          </Link>
          <Link
            to="/events"
            style={{
              ...styles.navLink,
              ...(isActive("/events") ? styles.navLinkActive : {}),
            }}
          >
            ⚙️ Events
          </Link>
          <Link
            to="/monitoring"
            style={{
              ...styles.navLink,
              ...(isActive("/monitoring") ? styles.navLinkActive : {}),
            }}
          >
            📈 Monitoring
          </Link>
        </nav>

        <div style={styles.user}>
          <div style={styles.userInfo}>
            <div style={styles.userName}>{user?.username}</div>
            <div style={styles.userRole}>{user?.role}</div>
          </div>
          <button onClick={handleLogout} style={styles.logoutBtn}>
            Logout
          </button>
        </div>
      </div>

      <div style={styles.main}>
        <div style={styles.content}>{children}</div>
      </div>
    </div>
  );
};

const styles = {
  container: {
    display: "flex",
    minHeight: "100vh",
    background: "#f5f5f5",
  },
  sidebar: {
    width: "260px",
    background: "linear-gradient(180deg, #667eea 0%, #764ba2 100%)",
    color: "white",
    display: "flex",
    flexDirection: "column",
    padding: "30px 0",
  },
  logo: {
    padding: "0 30px",
    marginBottom: "40px",
  },
  logoText: {
    margin: "0 0 5px 0",
    fontSize: "24px",
    fontWeight: "bold",
  },
  logoSubtext: {
    margin: 0,
    fontSize: "14px",
    opacity: 0.8,
  },
  nav: {
    flex: 1,
    display: "flex",
    flexDirection: "column",
    gap: "5px",
    padding: "0 15px",
  },
  navLink: {
    padding: "12px 15px",
    borderRadius: "8px",
    textDecoration: "none",
    color: "white",
    transition: "background 0.2s",
    fontSize: "15px",
  },
  navLinkActive: {
    background: "rgba(255,255,255,0.2)",
  },
  user: {
    padding: "20px 30px",
    borderTop: "1px solid rgba(255,255,255,0.2)",
  },
  userInfo: {
    marginBottom: "15px",
  },
  userName: {
    fontWeight: "600",
    fontSize: "16px",
  },
  userRole: {
    fontSize: "13px",
    opacity: 0.8,
    textTransform: "capitalize",
  },
  logoutBtn: {
    width: "100%",
    padding: "10px",
    background: "rgba(255,255,255,0.2)",
    border: "1px solid rgba(255,255,255,0.3)",
    borderRadius: "6px",
    color: "white",
    cursor: "pointer",
    fontSize: "14px",
    fontWeight: "500",
    transition: "background 0.2s",
  },
  main: {
    flex: 1,
    overflow: "auto",
  },
  content: {
    padding: "30px",
    maxWidth: "1400px",
    margin: "0 auto",
  },
};

export default Layout;
