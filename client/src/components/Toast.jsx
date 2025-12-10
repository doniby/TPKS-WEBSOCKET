import { useState, createContext, useContext } from "react";
import PropTypes from "prop-types";

const ToastContext = createContext();

export const useToast = () => {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error("useToast must be used within ToastProvider");
  }
  return context;
};

export const ToastProvider = ({ children }) => {
  const [toasts, setToasts] = useState([]);

  const addToast = (message, type = "info") => {
    const id = Date.now() + Math.random(); // Ensure uniqueness
    setToasts((prev) => [...prev, { id, message, type }]);

    // Auto-remove after 4 seconds
    setTimeout(() => removeToast(id), 4000);
  };

  const removeToast = (id) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  };

  const toast = {
    success: (msg) => addToast(msg, "success"),
    error: (msg) => addToast(msg, "error"),
    warning: (msg) => addToast(msg, "warning"),
    info: (msg) => addToast(msg, "info"),
  };

  return (
    <ToastContext.Provider value={toast}>
      {children}
      <div style={styles.container}>
        {toasts.map(({ id, message, type }) => (
          <div key={id} style={{ ...styles.toast, ...styles[type] }}>
            <span style={styles.icon}>{getIcon(type)}</span>
            <span style={styles.message}>{message}</span>
            <button onClick={() => removeToast(id)} style={styles.close}>
              ×
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
};

ToastProvider.propTypes = {
  children: PropTypes.node.isRequired,
};

const getIcon = (type) => {
  const icons = {
    success: "✓",
    error: "✕",
    warning: "⚠",
    info: "ℹ",
  };
  return icons[type] || icons.info;
};

const styles = {
  container: {
    position: "fixed",
    bottom: "20px",
    right: "20px",
    display: "flex",
    flexDirection: "column",
    gap: "10px",
    zIndex: 9999,
  },
  toast: {
    padding: "15px 20px",
    borderRadius: "8px",
    boxShadow: "0 4px 12px rgba(0,0,0,0.15)",
    color: "white",
    display: "flex",
    alignItems: "center",
    gap: "12px",
    minWidth: "320px",
    maxWidth: "400px",
    animation: "slideIn 0.3s ease",
    fontSize: "14px",
    fontWeight: "500",
  },
  success: {
    background: "linear-gradient(135deg, #4caf50 0%, #45a049 100%)",
  },
  error: {
    background: "linear-gradient(135deg, #f44336 0%, #e53935 100%)",
  },
  warning: {
    background: "linear-gradient(135deg, #ff9800 0%, #fb8c00 100%)",
  },
  info: {
    background: "linear-gradient(135deg, #2196f3 0%, #1e88e5 100%)",
  },
  icon: {
    fontSize: "18px",
    fontWeight: "bold",
    flexShrink: 0,
  },
  message: {
    flex: 1,
  },
  close: {
    background: "transparent",
    border: "none",
    color: "white",
    fontSize: "24px",
    cursor: "pointer",
    padding: 0,
    lineHeight: 1,
    opacity: 0.8,
    transition: "opacity 0.2s",
    flexShrink: 0,
  },
};

// Add slide-in animation
if (typeof document !== "undefined") {
  const style = document.createElement("style");
  style.textContent = `
    @keyframes slideIn {
      from {
        transform: translateX(400px);
        opacity: 0;
      }
      to {
        transform: translateX(0);
        opacity: 1;
      }
    }
  `;
  if (!document.querySelector("style[data-toast-animation]")) {
    style.setAttribute("data-toast-animation", "true");
    document.head.appendChild(style);
  }
}

export default ToastProvider;
