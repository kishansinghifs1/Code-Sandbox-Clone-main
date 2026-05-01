# Chapter 19 — End-to-End Data Flows

This chapter traces complete user journeys through the entire system — from the first click to the final render.

---

## 19.1 Flow 1: Creating a New Project

```
┌─────────────────────────────────────────────────────────────┐
│  USER ACTION: Clicks "🚀 Create Playground"                │
└─────────────────────────────┬───────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│  FRONTEND                                                    │
│                                                              │
│  CreateProject.jsx                                           │
│    → handleCreateProject()                                   │
│    → useCreateProject hook                                   │
│    → createProjectApi()                                      │
│    → axios.post("/api/v1/projects")                          │
│                                                              │
│  [Vite proxy forwards to http://localhost:3000]              │
└─────────────────────────────┬───────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│  BACKEND                                                     │
│                                                              │
│  routes/v1/projects.js  →  POST /                            │
│    → projectController.createProjectController               │
│    → projectService.createProjectService                     │
│                                                              │
│  Step 1: uuid4() → "a1b2c3d4-..."                           │
│  Step 2: fs.mkdir("./projects/a1b2c3d4-...")                 │
│  Step 3: exec("npx create-vite@latest sandbox --template react") │
│  Step 4: Write Docker-optimized vite.config.js               │
│  Step 5: chmod -R 777 ./projects/a1b2c3d4-...               │
│                                                              │
│  Response: { message: "Project created", data: "a1b2c3d4..." } │
└─────────────────────────────┬───────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│  FRONTEND                                                    │
│                                                              │
│  navigate("/project/a1b2c3d4-...")                           │
│    → React Router renders <ProjectPlayground />              │
│    → Socket.IO connects to /editor?projectId=a1b2c3d4-...   │
│    → WebSocket connects to /terminal?projectId=a1b2c3d4-... │
└─────────────────────────────────────────────────────────────┘
```

---

## 19.2 Flow 2: Opening the Terminal & Docker Container

```
┌─────────────────────────────────────────────────────────────┐
│  ProjectPlayground mounts                                    │
│  → new WebSocket("ws://host/terminal?projectId=a1b2c3d4")  │
└─────────────────────────────┬───────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│  TERMINAL SERVER (port 4000)                                 │
│                                                              │
│  terminalApp.js                                              │
│    → WebSocketServer.on("connection")                        │
│    → Extracts projectId from URL                             │
│                                                              │
│  handleContainerCreate(projectId)                            │
│    → Check for existing container with same name             │
│    → Remove if exists (force: true)                          │
│    → docker.createContainer({                                │
│        Image: "sandbox",                                     │
│        Cmd: ["/bin/bash"],                                   │
│        User: "sandbox",                                      │
│        Binds: ["host/projects/a1b2c3d4:/home/sandbox/app"],  │
│        PortBindings: { "5173/tcp": [{ HostPort: "0" }] }    │
│      })                                                      │
│    → container.start()                                       │
│                                                              │
│  handleTerminalCreation(container, ws)                        │
│    → container.exec({ Cmd: ["/bin/bash"], Tty: true })      │
│    → exec.start({ hijack: true })                            │
│    → Pipe: ws ⟷ stream                                      │
└─────────────────────────────┬───────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│  FRONTEND                                                    │
│                                                              │
│  BrowserTerminal.jsx                                         │
│    → new Terminal({ theme: Dracula })                        │
│    → term.open(containerDiv)                                 │
│    → new AttachAddon(ws)                                     │
│    → term.loadAddon(attachAddon)                             │
│                                                              │
│  User sees: ~/app/sandbox $                                  │
│  User types: npm install && npm run dev                      │
└─────────────────────────────────────────────────────────────┘
```

---

## 19.3 Flow 3: Editing a File

```
┌─────────────────────────────────────────────────────────────┐
│  USER ACTION: Double-clicks "App.jsx" in file tree          │
└─────────────────────────────┬───────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│  TreeNode.jsx                                                │
│    → handleDoubleClick()                                     │
│    → editorSocket.emit("readFile", {                        │
│        pathToFileOrFolder: "/app/projects/.../src/App.jsx"  │
│      })                                                      │
└─────────────────────────────┬───────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│  BACKEND: editorHandler.js                                   │
│    → socket.on("readFile")                                   │
│    → fs.readFile("/app/projects/.../src/App.jsx")            │
│    → socket.emit("readFileSuccess", {                       │
│        value: "import './App.css'...",                       │
│        path: "/app/projects/.../src/App.jsx"                │
│      })                                                      │
└─────────────────────────────┬───────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│  FRONTEND: editorSocketStore.js                              │
│    → on("readFileSuccess")                                   │
│    → Extract extension: "jsx"                                │
│    → activeFileTabStore.setActiveFileTab(path, value, "jsx") │
│                                                              │
│  EditorComponent.jsx re-renders:                             │
│    → language = extensionToFileType("jsx") → "javascript"   │
│    → value = "import './App.css'..."                         │
│    → Monaco Editor displays the file with JSX highlighting  │
└─────────────────────────────────────────────────────────────┘
```

### When User Edits:

```
User types code changes
        │
        ▼ (2s debounce)
EditorComponent: editorSocket.emit("writeFile", {
    data: "...modified content...",
    pathToFileOrFolder: "/app/projects/.../src/App.jsx"
})
        │
        ▼
Backend: fs.writeFile → editorNamespace.emit("writeFileSuccess")
        │
        ▼
Chokidar: detects change → editorNamespace.emit("fileChanged")
        │
        ▼
Browser.jsx: auto-refreshes iframe (if open)
```

---

## 19.4 Flow 4: Creating a File via Context Menu

```
User right-clicks on "src" folder
        │
        ▼
TreeNode: handleContextMenu() → openMenu({ x, y, path, isFolder: true })
        │
        ▼
fileContextMenuStore: { isOpen: true, x: 150, y: 200, file: ".../src", isFolder: true }
        │
        ▼
TreeStructure: renders <FileContextMenu x={150} y={200} ... />
        │
        ▼
User clicks "📄 New File" → input appears
User types "Counter.jsx" and presses Enter
        │
        ▼
FileContextMenu: editorSocket.emit("createFile", {
    pathToFileOrFolder: ".../src/Counter.jsx"
})
        │
        ▼
Backend: fs.mkdir (parent) → fs.writeFile (empty) → emit("createFileSuccess")
        │
        ▼
editorSocketStore: on("createFileSuccess") → treeStructureStore.setTreeStructure()
        │
        ▼
treeStructureStore: GET /api/v1/projects/:id/tree → updates tree
        │
        ▼
TreeStructure re-renders with new file visible
```

---

## 19.5 Flow 5: Running the AI Agent

```
User types: "Create a counter with +/- buttons"
User clicks 🚀
        │
        ▼
AgentPanel: fetch("POST /api/v1/agent", {
    projectId: "a1b2c3d4",
    goal: "Create a counter with +/- buttons"
})
        │
        ▼
Backend: agentController
    → res.json({ success: true, message: "Agent started" })  // Immediate response
    → runAgent(projectId, goal, emitLog)  // Runs in background
        │
        ▼
langgraphAgent:
    → Creates Gemini LLM (temperature: 0.2)
    → Creates 5 tools (listFiles, readFile, writeFile, deleteFile, runCommand)
    → createReactAgent({ llm, tools })
    → agent.invoke(messages, callbacks)
        │
        ▼
┌── AGENTIC LOOP ──────────────────────────────────────────────┐
│                                                               │
│  1. LLM thinks → callback: emitLog({type:"thinking"})        │
│  2. LLM generates text → callback: emitLog({type:"thought"}) │
│  3. LLM calls listFiles(".") → callback: emitLog({type:"tool_start"}) │
│  4. Tool returns results → callback: emitLog({type:"tool_result"}) │
│  5. LLM thinks again...                                      │
│  6. LLM calls readFile("src/App.jsx")                        │
│  7. LLM calls writeFile("src/components/Counter.jsx", code)  │
│  8. LLM calls writeFile("src/App.jsx", updated code)         │
│  9. LLM calls runCommand("npm run build")                    │
│  10. LLM returns final message                               │
│                                                               │
│  Each step: emitLog → Socket.IO emit + file persist          │
└───────────────────────────────────────────────────────────────┘
        │
        ▼ (each log event)
AgentPanel: editorSocket.on("agent:log")
    → agentStore.addLog(log)
    → Component re-renders with new log entry
    → Auto-scrolls to bottom
        │
        ▼ (file changes trigger)
Chokidar: editorNamespace.emit("fileChanged")
    → Browser.jsx auto-refreshes
    → User sees updated app in preview
```

---

## 19.6 Flow 6: Viewing the Live Preview

```
User clicks "🌐 Browser" tab
        │
        ▼
ProjectPlayground: setRightPanelTab("browser"), setLoadBrowser(true)
        │
        ▼
Browser.jsx mounts
    → Checks portStore: port === null
    → editorSocket.emit("getPort", { containerName: projectId })
        │
        ▼
Backend: editorHandler
    → getContainerPort(containerName)
    → docker.listContainers → docker.getContainer → .inspect()
    → Returns NetworkSettings.Ports["5173/tcp"][0].HostPort
    → socket.emit("getPortSuccess", { port: "49152" })
        │
        ▼
editorSocketStore: portStore.setPort("49152")
        │
        ▼
Browser.jsx re-renders:
    → <Input defaultValue="http://localhost:49152" />
    → <iframe src="http://localhost:49152" />
    → Vite dev server renders the React app in the iframe
```

---

> **Next Chapter:** [Chapter 20 — Security, Scaling & Future Work →](./chapter-20-security.md)
