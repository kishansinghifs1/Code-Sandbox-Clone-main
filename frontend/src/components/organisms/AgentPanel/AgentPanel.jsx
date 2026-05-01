import { useState, useRef, useEffect } from "react";
import { useEditorSocketStore } from "../../../stores/editorSocketStore";
import { useAgentStore } from "../../../stores/agentStore";

const typeStyles = {
  thinking: { color: "#8be9fd", icon: "🤔" },
  thought: { color: "#f8f8f2", icon: "💭" },
  tool_start: { color: "#50fa7b", icon: "🔧" },
  tool_result: { color: "#bd93f9", icon: "📋" },
  status: { color: "#ffb86c", icon: "⚡" },
  done: { color: "#50fa7b", icon: "✅" },
  error: { color: "#ff5555", icon: "❌" },
};

export const AgentPanel = ({ projectId }) => {
  const [goal, setGoal] = useState("");
  const { logs, isRunning, addLog, setLogs, setIsRunning, clearLogs } = useAgentStore();
  const logsEndRef = useRef(null);
  const { editorSocket } = useEditorSocketStore();

  // Fetch log history on mount
  useEffect(() => {
    if (!projectId) return;

    async function fetchHistory() {
      try {
        const response = await fetch(`/api/v1/agent/${projectId}/logs`);
        const json = await response.json();
        if (json.success && json.data) {
          setLogs(json.data);
        }
      } catch (err) {
        console.error("Failed to fetch agent history:", err);
      }
    }

    fetchHistory();
  }, [projectId, setLogs]);

  // Listen for agent:log events from the backend
  useEffect(() => {
    if (!editorSocket) return;

    const handleAgentLog = (data) => {
      addLog(data);

      if (data.type === "done" || data.type === "error") {
        setIsRunning(false);
      }
    };

    editorSocket.on("agent:log", handleAgentLog);

    return () => {
      editorSocket.off("agent:log", handleAgentLog);
    };
  }, [editorSocket, addLog, setIsRunning]);

  // Auto-scroll to bottom when new logs arrive
  useEffect(() => {
    logsEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [logs]);

  async function handleSubmit(e) {
    e.preventDefault();
    if (!goal.trim() || isRunning) return;

    setIsRunning(true);
    setLogs([]);


    try {
      await fetch("/api/v1/agent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId, goal: goal.trim() }),
      });
    } catch (err) {
      setLogs((prev) => [
        ...prev,
        { type: "error", message: `Failed to reach backend: ${err.message}`, timestamp: Date.now() },
      ]);
      setIsRunning(false);
    }
  }

  return (
    <div style={styles.container}>
      {/* Header */}
      <div style={styles.header}>
        <span style={styles.headerIcon}>🧠</span>
        <span style={styles.headerTitle}>CogniBox Agent</span>
        {isRunning && <span style={styles.runningBadge}>Working...</span>}
        <button 
          onClick={() => clearLogs()} 
          style={styles.clearBtn}
          title="Clear logs"
        >
          🗑️
        </button>
      </div>

      {/* Logs Area */}
      <div style={styles.logsArea}>
        {logs.length === 0 && (
          <div style={styles.emptyState}>
            <p style={{ fontSize: "32px", margin: 0 }}>🤖</p>
            <p style={{ color: "#6272a4", margin: "8px 0 0 0", fontSize: "14px" }}>
              Give me a goal and I will autonomously write &amp; test code in your sandbox.
            </p>
          </div>
        )}
        {logs.map((log, idx) => {
          const style = typeStyles[log.type] || typeStyles.status;
          return (
            <div key={idx} style={{
                ...styles.logEntry,
                backgroundColor: log.type === "tool_start" ? "rgba(80, 250, 124, 0.05)" : "transparent",
                borderRadius: "4px",
                margin: "4px 0",
              }}>
              <span style={{ marginRight: "8px", marginTop: "2px" }}>{style.icon}</span>
              <div style={{ flex: 1 }}>
                <pre style={{ 
                  ...styles.logMessage, 
                  color: style.color,
                  fontWeight: (log.type === "tool_start" || log.type === "done") ? "600" : "400"
                }}>
                  {log.message}
                </pre>
                {log.detail && (
                  <div style={styles.logDetailWrapper}>
                    <pre style={styles.logDetail}>{log.detail}</pre>
                  </div>
                )}
              </div>
            </div>
          );
        })}
        <div ref={logsEndRef} />
      </div>

      {/* Input */}
      <form onSubmit={handleSubmit} style={styles.inputArea}>
        <input
          type="text"
          value={goal}
          onChange={(e) => setGoal(e.target.value)}
          placeholder={isRunning ? "Agent is working..." : "Enter a goal for the AI agent..."}
          disabled={isRunning}
          style={styles.input}
        />
        <button
          type="submit"
          disabled={isRunning || !goal.trim()}
          style={{
            ...styles.submitBtn,
            opacity: isRunning || !goal.trim() ? 0.5 : 1,
          }}
        >
          {isRunning ? "⏳" : "🚀"}
        </button>
      </form>
    </div>
  );
};

const styles = {
  container: {
    display: "flex",
    flexDirection: "column",
    height: "100%",
    backgroundColor: "#1e1f29",
    fontFamily: "'Fira Code', 'Consolas', monospace",
  },
  header: {
    display: "flex",
    alignItems: "center",
    gap: "8px",
    padding: "10px 16px",
    backgroundColor: "#282a36",
    borderBottom: "1px solid #44475a",
  },
  headerIcon: {
    fontSize: "18px",
  },
  headerTitle: {
    color: "#f8f8f2",
    fontSize: "14px",
    fontWeight: 600,
    letterSpacing: "0.5px",
  },
  runningBadge: {
    marginLeft: "auto",
    color: "#50fa7b",
    fontSize: "12px",
    padding: "2px 8px",
    borderRadius: "8px",
    backgroundColor: "rgba(80, 250, 124, 0.15)",
    animation: "pulse 1.5s infinite",
  },
  clearBtn: {
    marginLeft: "8px",
    backgroundColor: "transparent",
    border: "none",
    cursor: "pointer",
    fontSize: "14px",
    opacity: 0.6,
    transition: "opacity 0.2s",
    padding: "4px",
  },
  logsArea: {
    flex: 1,
    overflowY: "auto",
    padding: "12px 16px",
  },
  emptyState: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    height: "100%",
    textAlign: "center",
  },
  logEntry: {
    display: "flex",
    alignItems: "flex-start",
    padding: "6px 0",
    borderBottom: "1px solid rgba(68, 71, 90, 0.3)",
  },
  logMessage: {
    margin: 0,
    fontSize: "13px",
    whiteSpace: "pre-wrap",
    wordBreak: "break-word",
    lineHeight: "1.5",
    fontFamily: "'Fira Code', 'Consolas', monospace",
  },
  logDetailWrapper: {
    marginTop: "6px",
    padding: "8px",
    backgroundColor: "rgba(0, 0, 0, 0.2)",
    borderRadius: "6px",
    borderLeft: "2px solid #6272a4",
  },
  logDetail: {
    margin: 0,
    fontSize: "12px",
    color: "#bd93f9",
    whiteSpace: "pre-wrap",
    wordBreak: "break-word",
    lineHeight: "1.4",
    fontFamily: "'Fira Code', 'Consolas', monospace",
  },
  inputArea: {
    display: "flex",
    gap: "8px",
    padding: "12px 16px",
    borderTop: "1px solid #44475a",
    backgroundColor: "#282a36",
  },
  input: {
    flex: 1,
    padding: "10px 14px",
    fontSize: "14px",
    fontFamily: "'Fira Code', 'Consolas', monospace",
    backgroundColor: "#44475a",
    border: "1px solid #6272a4",
    borderRadius: "8px",
    color: "#f8f8f2",
    outline: "none",
  },
  submitBtn: {
    padding: "10px 16px",
    fontSize: "18px",
    backgroundColor: "#6366f1",
    border: "none",
    borderRadius: "8px",
    cursor: "pointer",
    transition: "all 0.2s",
  },
};
