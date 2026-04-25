import { Link, useNavigate, useLocation } from "react-router-dom";
import {
  Activity,
  ChartSpline,
  Gauge,
  LogOut,
  Radio,
  Settings,
  Shield,
} from "lucide-react";
import { useAuth } from "../context/AuthContext";
import ConnectionStatus from "./ConnectionStatus";
import Button from "./ui/Button";

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
    <div className="app-shell">
      <aside className="app-sidebar">
        <div className="sidebar-brand">
          <h1>WebSocket Monitoring</h1>
          <p>Admin Panel</p>
        </div>

        <div>
          <ConnectionStatus />
        </div>

        <nav className="sidebar-nav">
          <Link
            to="/"
            className={`nav-link ${isActive("/") ? "is-active" : ""}`}
          >
            <Gauge size={14} style={{ marginRight: "0.45rem", verticalAlign: "middle" }} />
            Dashboard
          </Link>
          <Link
            to="/events"
            className={`nav-link ${isActive("/events") ? "is-active" : ""}`}
          >
            <Activity size={14} style={{ marginRight: "0.45rem", verticalAlign: "middle" }} />
            Events
          </Link>
          <Link
            to="/apps"
            className={`nav-link ${isActive("/apps") ? "is-active" : ""}`}
          >
            <Shield size={14} style={{ marginRight: "0.45rem", verticalAlign: "middle" }} />
            App Registry
          </Link>
          <Link
            to="/monitoring"
            className={`nav-link ${isActive("/monitoring") ? "is-active" : ""}`}
          >
            <ChartSpline size={14} style={{ marginRight: "0.45rem", verticalAlign: "middle" }} />
            Monitoring
          </Link>
          <Link
            to="/mqtt"
            className={`nav-link ${isActive("/mqtt") ? "is-active" : ""}`}
          >
            <Radio size={14} style={{ marginRight: "0.45rem", verticalAlign: "middle" }} />
            MQTT Topics
          </Link>
          <Link
            to="/settings"
            className={`nav-link ${isActive("/settings") ? "is-active" : ""}`}
          >
            <Settings size={14} style={{ marginRight: "0.45rem", verticalAlign: "middle" }} />
            Settings
          </Link>
        </nav>

        <div className="sidebar-user">
          <div>
            <strong>{user?.username}</strong>
            <span>{user?.role}</span>
          </div>
          <Button onClick={handleLogout} icon={LogOut}>
            Logout
          </Button>
        </div>
      </aside>

      <main className="app-main">
        <div className="page">{children}</div>
      </main>
    </div>
  );
};

export default Layout;
