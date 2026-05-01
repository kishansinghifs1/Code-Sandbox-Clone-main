import { runAgent } from "../service/langgraphAgent.js";
import fs from "fs/promises";
import path from "path";

let editorNamespaceRef = null;

/**
 * Store a reference to the editor namespace so the agent can emit events.
 */
export function setEditorNamespace(ns) {
  editorNamespaceRef = ns;
}

/**
 * POST /api/v1/agent
 * Body: { projectId: string, goal: string }
 */
export const runAgentController = async (req, res) => {
  const { projectId, goal } = req.body;

  if (!projectId || !goal) {
    return res.status(400).json({
      success: false,
      message: "projectId and goal are required",
    });
  }

  // Emit agent logs to all clients in the editor namespace
  const emitLog = async (logEntry) => {
    const entry = {
      ...logEntry,
      projectId,
      timestamp: Date.now(),
    };

    // 1. Emit to socket
    if (editorNamespaceRef) {
      editorNamespaceRef.emit("agent:log", entry);
    }

    // 2. Save to history file
    try {
      const logsPath = path.resolve(`./projects/${projectId}/agent_logs.json`);
      let logs = [];
      try {
        const data = await fs.readFile(logsPath, "utf-8");
        logs = JSON.parse(data);
      } catch (e) {
        // File doesn't exist yet
      }
      logs.push(entry);
      await fs.writeFile(logsPath, JSON.stringify(logs, null, 2));
    } catch (err) {
      console.error("Failed to save agent log:", err);
    }
  };

  // Respond immediately to avoid HTTP timeout — agent runs in the background
  res.json({
    success: true,
    message: "Agent started working on your goal",
  });

  // Run the agent asynchronously
  try {
    await runAgent(projectId, goal, emitLog);
  } catch (err) {
    console.error("Agent controller error:", err);
    await emitLog({ type: "error", message: `Agent crashed: ${err.message}` });
  }
};

/**
 * GET /api/v1/agent/:projectId/logs
 */
export const getAgentLogsController = async (req, res) => {
  const { projectId } = req.params;

  try {
    const logsPath = path.resolve(`./projects/${projectId}/agent_logs.json`);
    const data = await fs.readFile(logsPath, "utf-8");
    const logs = JSON.parse(data);
    res.json({ success: true, data: logs });
  } catch (err) {
    res.json({ success: true, data: [] }); // Return empty if no logs yet
  }
};
