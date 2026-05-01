# Chapter 5 — REST API Layer

This chapter explains the complete REST API — routes, controllers, and how requests flow from the frontend to the backend.

---

## 5.1 Route Architecture

The routing follows a versioned, modular pattern:

```
/api                    ← apiRouter (routes/index.js)
  └── /v1               ← v1Router (routes/v1/index.js)
       ├── /ping        ← pingCheck controller
       ├── /projects    ← projectRouter (routes/v1/projects.js)
       │     ├── POST / ← createProjectController
       │     └── GET /:projectId/tree ← getProjectTree
       └── /agent       ← agentRouter (routes/v1/agent.js)
             ├── POST / ← runAgentController
             └── GET /:projectId/logs ← getAgentLogsController
```

---

## 5.2 Route Files

### `backend/src/routes/index.js` — Root Router

```javascript
import express from 'express';
import v1Router from './v1/index.js';

const router = express.Router();
router.use('/v1', v1Router);

export default router;
```

This is the top-level API router. It simply delegates everything to `/v1`, enabling future API versioning (e.g., `/api/v2` could be added later).

### `backend/src/routes/v1/index.js` — V1 Router

```javascript
import express from 'express';
import { pingCheck } from '../../controllers/pingController.js';
import projectRouter from './projects.js';
import agentRouter from './agent.js';

const router = express.Router();

router.use('/ping', pingCheck);        // GET /api/v1/ping
router.use('/projects', projectRouter); // /api/v1/projects/*
router.use('/agent', agentRouter);      // /api/v1/agent/*

export default router;
```

### `backend/src/routes/v1/projects.js` — Project Routes

```javascript
import express from 'express';
import { createProjectController, getProjectTree } from '../../controllers/projectController.js';

const router = express.Router();

router.post('/', createProjectController);       // POST /api/v1/projects
router.get('/:projectId/tree', getProjectTree);  // GET /api/v1/projects/:projectId/tree

export default router;
```

### `backend/src/routes/v1/agent.js` — Agent Routes

```javascript
import express from 'express';
import { runAgentController, getAgentLogsController } from '../../controllers/agentController.js';

const router = express.Router();

router.post('/', runAgentController);              // POST /api/v1/agent
router.get('/:projectId/logs', getAgentLogsController); // GET /api/v1/agent/:projectId/logs

export default router;
```

---

## 5.3 Controllers

### 5.3.1 Ping Controller — `backend/src/controllers/pingController.js`

```javascript
export async function pingCheck(req, res) {
    return res.status(200).json({ message: 'pong' });
}
```

The simplest possible controller. Returns `{ message: "pong" }` as a health check. Used by the frontend's `PingComponent` to verify backend connectivity.

**Endpoint:** `GET /api/v1/ping`
**Response:** `{ "message": "pong" }`

---

### 5.3.2 Project Controller — `backend/src/controllers/projectController.js`

```javascript
import {
  createProjectService,
  getProjectTreeService,
} from "../service/projectService.js";

export const createProjectController = async (req, res) => {
  const projectId = await createProjectService();
  return res.json({ message: "Project created", data: projectId });
};

export const getProjectTree = async (req, res) => {
  const tree = await getProjectTreeService(req.params.projectId);
  return res.status(200).json({
    data: tree,
    success: true,
    message: "Successfully fetched the tree",
  });
};
```

#### `createProjectController`

**Endpoint:** `POST /api/v1/projects`  
**Request Body:** None  
**Response:**
```json
{
  "message": "Project created",
  "data": "a1b2c3d4-e5f6-7890-abcd-ef1234567890"
}
```

**What it does:**
1. Calls `createProjectService()` which generates a UUID, creates a directory, and scaffolds a Vite project
2. Returns the generated UUID to the frontend
3. The frontend then navigates to `/project/<uuid>` to open the playground

#### `getProjectTree`

**Endpoint:** `GET /api/v1/projects/:projectId/tree`  
**Response:**
```json
{
  "success": true,
  "message": "Successfully fetched the tree",
  "data": {
    "name": "a1b2c3d4...",
    "path": "/app/projects/a1b2c3d4.../",
    "children": [
      {
        "name": "sandbox",
        "path": "/app/projects/a1b2c3d4.../sandbox",
        "children": [
          { "name": "package.json", "path": "...", "size": 1234 },
          { "name": "src", "path": "...", "children": [...] }
        ]
      }
    ]
  }
}
```

**What it does:**
1. Uses `directory-tree` to recursively scan the project directory
2. Returns a JSON tree representing all files and folders
3. The frontend renders this tree in the file explorer sidebar

---

### 5.3.3 Agent Controller — `backend/src/controllers/agentController.js`

This is the most complex controller. It handles AI agent execution with real-time log streaming.

```javascript
import { runAgent } from "../service/langgraphAgent.js";
import fs from "fs/promises";
import path from "path";

let editorNamespaceRef = null;

// Called from index.js to share the Socket.IO namespace
export function setEditorNamespace(ns) {
  editorNamespaceRef = ns;
}
```

#### `runAgentController`

**Endpoint:** `POST /api/v1/agent`  
**Request Body:**
```json
{
  "projectId": "a1b2c3d4-...",
  "goal": "Create a counter component with increment and decrement buttons"
}
```

**Response (immediate):**
```json
{
  "success": true,
  "message": "Agent started working on your goal"
}
```

**Detailed Flow:**

```javascript
export const runAgentController = async (req, res) => {
  const { projectId, goal } = req.body;

  // Validate input
  if (!projectId || !goal) {
    return res.status(400).json({
      success: false,
      message: "projectId and goal are required",
    });
  }

  // Create a logging function that:
  // 1. Emits events via Socket.IO to all connected clients
  // 2. Persists logs to a JSON file for history
  const emitLog = async (logEntry) => {
    const entry = {
      ...logEntry,
      projectId,
      timestamp: Date.now(),
    };

    // Broadcast to all clients in the editor namespace
    if (editorNamespaceRef) {
      editorNamespaceRef.emit("agent:log", entry);
    }

    // Persist to disk for log history
    try {
      const logsPath = path.resolve(`./projects/${projectId}/agent_logs.json`);
      let logs = [];
      try {
        const data = await fs.readFile(logsPath, "utf-8");
        logs = JSON.parse(data);
      } catch (e) {
        // File doesn't exist yet — start with empty array
      }
      logs.push(entry);
      await fs.writeFile(logsPath, JSON.stringify(logs, null, 2));
    } catch (err) {
      console.error("Failed to save agent log:", err);
    }
  };

  // ⚡ Respond IMMEDIATELY — agent runs in background
  res.json({
    success: true,
    message: "Agent started working on your goal",
  });

  // Run the agent asynchronously (no await on the response)
  try {
    await runAgent(projectId, goal, emitLog);
  } catch (err) {
    console.error("Agent controller error:", err);
    await emitLog({ type: "error", message: `Agent crashed: ${err.message}` });
  }
};
```

**Why respond immediately?** The AI agent can take 30-60+ seconds to complete. If we waited, the HTTP request would time out. Instead:
1. The server sends `200 OK` immediately
2. The agent runs in the background
3. Logs are streamed to the client via Socket.IO (`agent:log` events)
4. Logs are also persisted to `agent_logs.json` so they survive page refreshes

#### `getAgentLogsController`

**Endpoint:** `GET /api/v1/agent/:projectId/logs`  
**Response:**
```json
{
  "success": true,
  "data": [
    { "type": "status", "message": "🧠 Agent initialized...", "timestamp": 1714680000000 },
    { "type": "thinking", "message": "🤔 Agent is thinking...", "timestamp": 1714680001000 },
    { "type": "tool_start", "message": "🔧 Calling tool: listFiles", "timestamp": 1714680002000 },
    ...
  ]
}
```

Reads the persisted `agent_logs.json` file and returns all historical logs. If the file doesn't exist, returns an empty array. This is called when the `AgentPanel` component mounts to restore log history.

---

## 5.4 API Summary Table

| Method | Endpoint | Purpose | Response |
|--------|----------|---------|----------|
| `GET` | `/ping` | Health check (root level) | `{ message: "pong" }` |
| `GET` | `/api/v1/ping` | Health check (API level) | `{ message: "pong" }` |
| `POST` | `/api/v1/projects` | Create a new project | `{ data: "<uuid>" }` |
| `GET` | `/api/v1/projects/:id/tree` | Get project file tree | `{ data: { tree... } }` |
| `POST` | `/api/v1/agent` | Start AI agent | `{ message: "Agent started..." }` |
| `GET` | `/api/v1/agent/:id/logs` | Get agent log history | `{ data: [logs...] }` |

---

> **Next Chapter:** [Chapter 6 — Project Service & File System →](./chapter-06-project-service.md)
