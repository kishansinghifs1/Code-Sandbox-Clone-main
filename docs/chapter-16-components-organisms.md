# Chapter 16 — UI Components: Organisms

Organisms are full feature sections composed of molecules. They represent complete, self-contained UI areas.

---

## 16.1 `TreeStructure` — File Explorer Sidebar

**Location:** `frontend/src/components/organisms/TreeStructure/`

```javascript
import { useTreeStructureStore } from "../../../stores/treeStructureStore";
import { useEffect } from "react";
import { TreeNode } from "../../molecules/TreeNode/TreeNode";
import { useFileContextMenuStore } from "../../../stores/fileContextMenuStore";
import { FileContextMenu } from "../../molecules/ContextMenu/FileContextMenu";

export const TreeStructure = () => {
    const { treeStructure, setTreeStructure } = useTreeStructureStore();
    const {
        file,
        isOpen: isFileContextOpen,
        isFolder,
        x: fileContextX,
        y: fileContextY
    } = useFileContextMenuStore();

    useEffect(() => {
        if (treeStructure) {
            console.log("tree:", treeStructure);
        } else {
            setTreeStructure();  // Fetch the tree if not loaded yet
        }
    }, [setTreeStructure, treeStructure]);

    return (
        <>
            {/* Render context menu when open */}
            {isFileContextOpen && fileContextX && fileContextY && (
                <FileContextMenu
                    x={fileContextX}
                    y={fileContextY}
                    path={file}
                    isFolder={isFolder}
                />
            )}
            {/* Render the root tree node (recursive) */}
            <TreeNode fileFolderData={treeStructure} />
        </>
    );
};
```

### How It Works:

1. **On mount:** Checks if `treeStructure` is already loaded. If not, calls `setTreeStructure()` which fetches from the API.

2. **Tree rendering:** Passes the root tree node to `<TreeNode>`, which recursively renders children.

3. **Context menu:** Listens to the `fileContextMenuStore` and renders `<FileContextMenu>` at the cursor position when a file/folder is right-clicked.

### Visual Representation:

```
┌──────────────────────────┐
│ ▶ a1b2c3d4-...           │  ← Root project folder
│   ▼ sandbox              │  ← Sandbox folder (expanded)
│     ▶ node_modules       │  ← Collapsed
│     ▼ src                │  ← Expanded
│       📄 App.css         │  ← File with icon
│       ⚛️ App.jsx          │  ← JSX file with React icon
│       ⚛️ main.jsx         │
│       📄 index.css       │
│     📄 index.html        │
│     📄 package.json      │
│     📄 vite.config.js    │
└──────────────────────────┘
```

---

## 16.2 `Browser` — Live Preview

**Location:** `frontend/src/components/organisms/Browser/`

```javascript
import { useEffect, useRef } from "react";
import { Input, Row } from "antd";
import { useEditorSocketStore } from "../../../stores/editorSocketStore.js";
import { usePortStore } from "../../../stores/portStore.js";
import { ReloadOutlined } from "@ant-design/icons";

export const Browser = ({ projectId }) => {
    const browserRef = useRef(null);
    const { port } = usePortStore();
    const { editorSocket } = useEditorSocketStore();

    // Request the container port if we don't have it yet
    useEffect(() => {
        if (!port) {
            editorSocket?.emit("getPort", {
                containerName: projectId
            });
        }
    }, [port, editorSocket, projectId]);

    // Auto-refresh iframe when files change
    useEffect(() => {
        const handleFileChange = (data) => {
            if (browserRef.current) {
                const oldAddr = browserRef.current.src;
                browserRef.current.src = oldAddr;  // Reload the iframe
            }
        };

        editorSocket?.on("fileChanged", handleFileChange);
        return () => {
            editorSocket?.off("fileChanged", handleFileChange);
        };
    }, [editorSocket]);

    if (!port) {
        return <div>Loading....</div>;
    }

    function handleRefresh() {
        if (browserRef.current) {
            const oldAddr = browserRef.current.src;
            browserRef.current.src = oldAddr;
        }
    }

    return (
        <Row style={{ backgroundColor: "#22212b" }}>
            {/* URL bar with refresh button */}
            <Input
                style={{
                    width: "100%", height: "30px",
                    color: "white", fontFamily: "Fira Code",
                    backgroundColor: "#282a35",
                }}
                prefix={<ReloadOutlined onClick={handleRefresh} />}
                defaultValue={`http://${window.location.hostname}:${port}`}
            />

            {/* The actual browser iframe */}
            <iframe
                ref={browserRef}
                src={`http://${window.location.hostname}:${port}`}
                style={{ width: "100%", height: "95vh", border: "none" }}
            />
        </Row>
    );
};
```

### Key Mechanisms:

1. **Port Discovery:**
   - Emits `getPort` to find the container's mapped port
   - Shows "Loading..." until the port is available
   - Port is stored in `portStore` and persists across re-renders

2. **Auto-Refresh:**
   - Listens for `fileChanged` events from Chokidar
   - When a file changes, reloads the iframe by re-setting its `src`
   - This gives a live-preview experience (like CodePen)

3. **Manual Refresh:**
   - The reload icon in the URL bar triggers a manual refresh
   - Uses the same technique: re-assign `src` to the same URL

4. **URL Construction:**
   - Uses `window.location.hostname` to work in both local and remote deployments
   - Combined with the dynamic port: `http://localhost:49152` (example)

### Visual Representation:

```
┌──────────────────────────────────────────┐
│ 🔄 http://localhost:49152               │  ← URL bar
├──────────────────────────────────────────┤
│                                          │
│     ┌────────────────────────────┐       │
│     │                            │       │
│     │    Your React App          │       │  ← iframe showing
│     │    Running in Sandbox      │       │     the Vite dev server
│     │                            │       │
│     └────────────────────────────┘       │
│                                          │
└──────────────────────────────────────────┘
```

---

## 16.3 `AgentPanel` — AI Agent Console

**Location:** `frontend/src/components/organisms/AgentPanel/`

This is the most complex frontend component. It provides a chat-like interface for interacting with the AI agent.

### Structure:

```
┌──────────────────────────────────────────┐
│ 🧠 CogniBox Agent              Working..│ ← Header
├──────────────────────────────────────────┤
│                                          │
│ ⚡ Agent initialized. Starting work...   │
│ 🤔 Agent is thinking...                  │ ← Logs Area
│ 💭 I need to understand the project...   │   (scrollable)
│ 🔧 Calling tool: listFiles               │
│   {"dirPath":"."}                        │ ← Tool detail
│ 📋 [DIR] src                             │
│   [FILE] package.json                    │ ← Tool result
│ ✅ Agent finished: I've created...        │
│                                          │
├──────────────────────────────────────────┤
│ [Enter a goal...                ] [🚀]   │ ← Input Area
└──────────────────────────────────────────┘
```

### Log Type Styles:

```javascript
const typeStyles = {
    thinking:    { color: "#8be9fd", icon: "🤔" },  // Cyan
    thought:     { color: "#f8f8f2", icon: "💭" },  // White
    tool_start:  { color: "#50fa7b", icon: "🔧" },  // Green
    tool_result: { color: "#bd93f9", icon: "📋" },  // Purple
    status:      { color: "#ffb86c", icon: "⚡" },  // Orange
    done:        { color: "#50fa7b", icon: "✅" },  // Green
    error:       { color: "#ff5555", icon: "❌" },  // Red
};
```

All colors are from the Dracula palette for visual consistency.

### Key Features:

1. **Log History Persistence:**
   ```javascript
   useEffect(() => {
       async function fetchHistory() {
           const response = await fetch(`/api/v1/agent/${projectId}/logs`);
           const json = await response.json();
           if (json.success && json.data) {
               setLogs(json.data);
           }
       }
       fetchHistory();
   }, [projectId, setLogs]);
   ```
   On mount, fetches historical logs so they survive page refreshes.

2. **Real-Time Log Streaming:**
   ```javascript
   useEffect(() => {
       const handleAgentLog = (data) => {
           addLog(data);
           if (data.type === "done" || data.type === "error") {
               setIsRunning(false);
           }
       };
       editorSocket.on("agent:log", handleAgentLog);
       return () => editorSocket.off("agent:log", handleAgentLog);
   }, [editorSocket, addLog, setIsRunning]);
   ```
   Listens for `agent:log` Socket.IO events and appends to the log display. When a `done` or `error` event arrives, the running state is cleared.

3. **Auto-Scroll:**
   ```javascript
   useEffect(() => {
       logsEndRef.current?.scrollIntoView({ behavior: "smooth" });
   }, [logs]);
   ```
   A ref at the bottom of the logs area. Every time a new log is added, it scrolls into view smoothly.

4. **Goal Submission:**
   ```javascript
   async function handleSubmit(e) {
       e.preventDefault();
       if (!goal.trim() || isRunning) return;
       
       setIsRunning(true);
       setLogs([]);
       
       await fetch("/api/v1/agent", {
           method: "POST",
           headers: { "Content-Type": "application/json" },
           body: JSON.stringify({ projectId, goal: goal.trim() }),
       });
   }
   ```
   Clears previous logs, sets running state, and fires the agent. The response comes immediately (agent runs in background), and logs stream in via Socket.IO.

5. **Tool Detail Expansion:**
   ```javascript
   {log.detail && (
       <div style={styles.logDetailWrapper}>
           <pre style={styles.logDetail}>{log.detail}</pre>
       </div>
   )}
   ```
   Tool start events include a `detail` field showing the input arguments. This is rendered in a styled code block below the main log message.

6. **Empty State:**
   ```javascript
   {logs.length === 0 && (
       <div style={styles.emptyState}>
           <p>🤖</p>
           <p>Give me a goal and I will autonomously write & test code</p>
       </div>
   )}
   ```
   Shows a friendly prompt when no logs exist yet.

---

> **Next Chapter:** [Chapter 17 — Pages →](./chapter-17-pages.md)
