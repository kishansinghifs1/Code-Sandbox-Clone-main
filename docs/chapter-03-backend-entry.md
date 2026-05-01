# Chapter 3 — Backend Entry Points

The backend has **two separate server processes** that boot simultaneously. Both are started when you run `npm run dev`, because `index.js` imports `terminalApp.js` as a side-effect.

---

## 3.1 Main Server — `backend/src/index.js`

This is the primary entry point. It starts an Express server with Socket.IO on **port 3000**.

### Full Annotated Code:

```javascript
import express from "express";
import { PORT } from "./config/serverConfig.js";     // Default: 3000
import { createServer } from "node:http";
import { Server } from "socket.io";
import apiRouter from "./routes/index.js";           // REST API routes
import cors from "cors";
import chokidar from "chokidar";                     // File system watcher
import { handleEditorSocketEvents } from "./socketHandlers/editorHandler.js";
import { setEditorNamespace } from "./controllers/agentController.js";
import "./terminalApp.js";  // ← SIDE EFFECT: boots the terminal server on port 4000

const app = express();
const server = createServer(app);  // Raw HTTP server (needed for Socket.IO)

// Socket.IO server with CORS wide-open (accepts connections from any origin)
const io = new Server(server, {
  cors: {
    origin: "*",
    method: ["GET", "POST"],
  },
});

// Middleware
app.use(express.json());          // Parse JSON request bodies
app.use(express.urlencoded());    // Parse URL-encoded form bodies
app.use(cors());                  // Enable CORS for all routes

// Mount all API routes under /api
app.use("/api", apiRouter);

// Simple health check endpoint
app.get("/ping", (req, res) => {
  return res.json({ message: "pong" });
});
```

### Socket.IO Namespace: `/editor`

```javascript
// Create a Socket.IO namespace for editor-related events
const editorNamespace = io.of("/editor");

// Share this namespace with the agent controller so it can emit events
setEditorNamespace(editorNamespace);

editorNamespace.on("connection", (socket) => {
  // Extract projectId from the handshake query string
  let projectId = socket.handshake.query["projectId"];
  console.log("Project id received after connection", projectId);

  if (projectId) {
    // Start watching the project directory for changes
    var watcher = chokidar.watch(`./projects/${projectId}`, {
      ignored: (path) => path.includes("node_modules"),  // Skip node_modules
      persistent: true,
      awaitWriteFinish: {
        stabilityThreshold: 2000,  // Wait 2s after last write before emitting
      },
      ignoreInitial: true  // Don't emit events for existing files on startup
    });

    // When ANY file changes, broadcast to all connected clients
    watcher.on("all", (event, path) => {
      console.log(event, path);
      editorNamespace.emit("fileChanged", {
        event: event,     // "add", "change", "unlink", etc.
        path: path,       // Full filesystem path
        projectId: projectId
      });
    });
  }

  // Register all editor socket event handlers (readFile, writeFile, etc.)
  handleEditorSocketEvents(socket, editorNamespace);

  // Cleanup when client disconnects
  socket.on("disconnect", async () => {
    console.log("editor disconnected");
    if (watcher) {
      await watcher.close();  // Stop watching files to prevent memory leaks
    }
  });
});

// Start the server
server.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
  console.log(process.cwd());  // Log working directory for debugging paths
});
```

### Key Concepts:

1. **`io.of("/editor")`** — Creates a Socket.IO *namespace*. Namespaces are like separate communication channels within the same WebSocket connection. Only clients connecting to `/editor` will receive editor events.

2. **Chokidar Watcher** — For each connected client, a file watcher is created scoped to their project directory. When files change (even from the AI agent or terminal), all clients are notified. The `awaitWriteFinish` option with a 2-second stability threshold prevents rapid-fire events during large writes.

3. **`setEditorNamespace`** — The editor namespace reference is shared with the agent controller so that when the AI agent runs, it can emit `agent:log` events to all connected clients without needing a separate socket.

4. **`import "./terminalApp.js"`** — This import is a side-effect. It doesn't use any exports — it simply causes `terminalApp.js` to execute, which starts the terminal server on port 4000. Both servers run in the same Node.js process.

---

## 3.2 Terminal Server — `backend/src/terminalApp.js`

This is the second server, running on **port 4000**. It uses the raw `ws` WebSocket library (not Socket.IO) because `xterm.js` requires a raw WebSocket connection.

### Full Annotated Code:

```javascript
import express from 'express';
import cors from 'cors';
import { createServer } from 'node:http';
import { handleContainerCreate, listContainer } from './containers/handleContainerCreate.js';
import { WebSocketServer } from 'ws';
import { handleTerminalCreation } from './containers/handleTerminalCreation.js';

const app = express();
const server = createServer(app);

app.use(express.json());
app.use(express.urlencoded());
app.use(cors());

// Start listening on port 4000
server.listen(4000, () => {
    console.log(`Server is running on port ${4000}`);
    console.log(process.cwd());
});

// Create a raw WebSocket server attached to the HTTP server
const webSocketForTerminal = new WebSocketServer({
    server  // Binds to the same HTTP server on port 4000
});

// When a WebSocket connection is established
webSocketForTerminal.on("connection", async (ws, req, container) => {
    // Check if the URL path indicates a terminal connection
    const isTerminal = req.url.includes("/terminal");

    if (isTerminal) {
        // Extract projectId from query string: /terminal?projectId=<uuid>
        const projectId = req.url.split("=")[1];
        console.log("Project id received after connection", projectId);

        // Create or reuse a Docker container for this project
        const container = await handleContainerCreate(projectId, webSocketForTerminal);

        // Attach the WebSocket to the container's terminal
        handleTerminalCreation(container, ws);
    }
});
```

### Key Concepts:

1. **Why raw WebSocket?** — The `xterm.js` `AttachAddon` expects a native WebSocket connection where binary data (terminal output) flows directly. Socket.IO adds its own protocol framing on top of WebSocket, which is incompatible with the `AttachAddon`.

2. **Connection Flow:**
   - Frontend opens a WebSocket to `ws://host:4000/terminal?projectId=<uuid>`
   - Server extracts `projectId` from the URL
   - Server creates (or recreates) a Docker container for that project
   - Server attaches the WebSocket to the container's `/bin/bash` shell
   - From this point, every keystroke from the user flows to the container, and every output from the container flows back to the browser

3. **Container Lifecycle** — Each terminal connection creates a fresh container (removing any existing one with the same name). This ensures a clean environment but means terminal state is lost on reconnection.

---

## 3.3 How Both Servers Work Together

```
npm run dev
    │
    ▼
index.js (loads)
    │
    ├──── Express app (port 3000)
    │     ├── REST API (/api/v1/...)
    │     └── Socket.IO (/editor namespace)
    │           ├── readFile, writeFile, createFile, deleteFile, ...
    │           ├── fileChanged (broadcasts from chokidar)
    │           └── agent:log (broadcasts from AI agent)
    │
    └──── import "./terminalApp.js" (side-effect)
          │
          └── Express + WS server (port 4000)
                └── Raw WebSocket (/terminal?projectId=...)
                      ├── Creates Docker container
                      └── Pipes stdin/stdout between browser and container
```

### Port Summary:
- **Port 3000** — REST API + Socket.IO (editor events)
- **Port 4000** — Raw WebSocket (terminal I/O)
- **Port 5173** — Vite dev server (frontend) — automatically proxies to 3000 and 4000

---

> **Next Chapter:** [Chapter 4 — Backend Configuration & Utilities →](./chapter-04-backend-config.md)
