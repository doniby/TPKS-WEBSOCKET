import React from "react";
import PropTypes from "prop-types";

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
    };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error("❌ React Error Caught:", error, errorInfo);
    this.setState({ errorInfo });

    // TODO: Send to error tracking service (Sentry, etc.)
    // logErrorToService(error, errorInfo);
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null, errorInfo: null });
  };

  render() {
    if (this.state.hasError) {
      return (
        <div style={styles.container}>
          <div style={styles.card}>
            <div style={styles.iconContainer}>
              <span style={styles.icon}>⚠️</span>
            </div>

            <h1 style={styles.title}>Monitoring Dashboard Error</h1>

            <p style={styles.message}>
              The monitoring interface encountered an unexpected error. This has
              been logged for review by the development team.
            </p>

            <details style={styles.details}>
              <summary style={styles.summary}>Technical Details</summary>
              <div style={styles.errorContainer}>
                <strong>Error:</strong>
                <pre style={styles.errorText}>
                  {this.state.error?.toString()}
                </pre>
                {this.state.errorInfo && (
                  <>
                    <strong style={{ marginTop: "15px", display: "block" }}>
                      Component Stack:
                    </strong>
                    <pre style={styles.errorText}>
                      {this.state.errorInfo.componentStack}
                    </pre>
                  </>
                )}
              </div>
            </details>

            <div style={styles.actions}>
              <button
                onClick={() => window.location.reload()}
                style={styles.primaryButton}
              >
                🔄 Reload Page
              </button>
              <button onClick={this.handleReset} style={styles.secondaryButton}>
                ↺ Try Again
              </button>
            </div>

            <p style={styles.help}>
              If this issue persists, please contact the IT administrator.
            </p>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

ErrorBoundary.propTypes = {
  children: PropTypes.node.isRequired,
};

const styles = {
  container: {
    minHeight: "100vh",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    background: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
    padding: "20px",
  },
  card: {
    background: "white",
    borderRadius: "16px",
    padding: "40px",
    maxWidth: "600px",
    width: "100%",
    boxShadow: "0 10px 40px rgba(0,0,0,0.2)",
    textAlign: "center",
  },
  iconContainer: {
    marginBottom: "20px",
  },
  icon: {
    fontSize: "64px",
  },
  title: {
    color: "#333",
    marginBottom: "15px",
    fontSize: "24px",
    fontWeight: "600",
  },
  message: {
    color: "#666",
    marginBottom: "25px",
    fontSize: "16px",
    lineHeight: "1.6",
  },
  details: {
    marginBottom: "25px",
    textAlign: "left",
  },
  summary: {
    cursor: "pointer",
    fontWeight: "500",
    color: "#667eea",
    fontSize: "14px",
    userSelect: "none",
    marginBottom: "10px",
  },
  errorContainer: {
    marginTop: "15px",
  },
  errorText: {
    background: "#f5f5f5",
    padding: "15px",
    borderRadius: "6px",
    fontSize: "12px",
    fontFamily: "monospace",
    overflow: "auto",
    maxHeight: "200px",
    textAlign: "left",
    color: "#c62828",
    border: "1px solid #ffcdd2",
    marginTop: "8px",
  },
  actions: {
    display: "flex",
    gap: "12px",
    justifyContent: "center",
    marginBottom: "20px",
  },
  primaryButton: {
    padding: "12px 24px",
    background: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
    color: "white",
    border: "none",
    borderRadius: "8px",
    cursor: "pointer",
    fontSize: "15px",
    fontWeight: "600",
    transition: "transform 0.2s",
    boxShadow: "0 2px 8px rgba(102, 126, 234, 0.3)",
  },
  secondaryButton: {
    padding: "12px 24px",
    background: "white",
    color: "#667eea",
    border: "2px solid #667eea",
    borderRadius: "8px",
    cursor: "pointer",
    fontSize: "15px",
    fontWeight: "600",
    transition: "all 0.2s",
  },
  help: {
    fontSize: "13px",
    color: "#999",
    margin: 0,
  },
};

export default ErrorBoundary;
