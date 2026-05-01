# Chapter 1 — Project Overview & Architecture

## 1.1 What Is This Project?

The **Code Sandbox Clone** is a fully-featured, web-based Integrated Development Environment (IDE) that lets users spin up isolated coding environments directly in the browser. Think of it as a self-hosted version of CodeSandbox or StackBlitz, but with an added superpower: an **autonomous AI developer agent** that can write, modify, and test code inside the sandbox for you.

### Core Capabilities

1. **Instant Project Scaffolding** — Click a button, and a fresh React + Vite project is created on the server, ready to code.
2. **Browser-Based Code Editor** — A full Monaco Editor (the same engine behind VS Code) with Dracula theme, syntax highlighting, and auto-save.
3. **Integrated Terminal** — A real Linux terminal running inside a Docker container, streamed to the browser via WebSocket.
4. **Live Preview** — See your changes in real-time in an embedded browser iframe, powered by Vite's HMR (Hot Module Replacement).
5. **File Explorer** — A VS Code-style tree view with right-click context menus for creating/deleting files and folders.
6. **AI Agent (CogniBox)** — An autonomous AI developer powered by Google Gemini and LangGraph that can read files, write code, install packages, and run terminal commands in the sandbox.

---

## 1.2 Tech Stack

### Frontend
| Technology | Purpose |
|---|---|
| **React 19** | UI framework |
| **Vite 7** | Build tool & dev server |
| **Monaco Editor** | Code editing (VS Code engine) |
| **xterm.js** | Terminal emulation in the browser |
| **Socket.IO Client** | Real-time communication with backend |
| **Zustand** | Lightweight state management |
| **React Query (TanStack)** | Server-state caching and mutations |
| **Ant Design** | UI component library |
| **Allotment** | Resizable split-pane layout |
| **React Router v7** | Client-side routing |
| **react-icons** | File and folder icons |

### Backend
| Technology | Purpose |
|---|---|
| **Node.js 22** | JavaScript runtime |
| **Express 5** | HTTP server framework |
| **Socket.IO** | WebSocket server for editor events |
| **ws** | Raw WebSocket server for terminal I/O |
| **Dockerode** | Docker Engine API client (Node.js) |
| **Chokidar** | File system watcher for live reload |
| **LangChain + LangGraph** | AI agent framework |
| **Google Generative AI** | LLM provider (Gemini 2.0 Flash) |
| **directory-tree** | Generates JSON tree from filesystem |
| **uuid4** | Unique project ID generation |

### Infrastructure
| Technology | Purpose |
|---|---|
| **Docker** | Container isolation for sandboxes |
| **Docker Compose** | Multi-service orchestration |
| **Nginx** | Production reverse proxy |

---

## 1.3 High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         BROWSER (User)                         │
│                                                                 │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────────┐   │
│  │   File   │  │  Monaco  │  │ Terminal  │  │  AI Agent /  │   │
│  │   Tree   │  │  Editor  │  │ (xterm)   │  │  Browser     │   │
│  └────┬─────┘  └────┬─────┘  └────┬──────┘  └──────┬───────┘   │
│       │              │             │                │           │
│       └──────────────┴──────┬──────┴────────────────┘           │
│                             │                                   │
│              Socket.IO      │  WebSocket (raw)     REST (HTTP)  │
└─────────────────────────────┼───────────────────────────────────┘
                              │
         ┌────────────────────┼────────────────────┐
         │          BACKEND SERVER                  │
         │                                          │
         │  ┌─────────────┐    ┌─────────────────┐  │
         │  │ Express :3000│    │  WS Server :4000│  │
         │  │  REST API    │    │  Terminal I/O   │  │
         │  │  Socket.IO   │    │                 │  │
         │  └──────┬───────┘    └───────┬─────────┘  │
         │         │                    │             │
         │  ┌──────┴────────────────────┴──────┐     │
         │  │         Dockerode (API)           │     │
         │  └──────────────┬───────────────────┘     │
         │                 │                          │
         │  ┌──────────────┴───────────────────┐     │
         │  │    /var/run/docker.sock           │     │
         │  └──────────────┬───────────────────┘     │
         └─────────────────┼──────────────────────────┘
                           │
         ┌─────────────────┼──────────────────┐
         │         DOCKER ENGINE               │
         │                                     │
         │  ┌─────────────────────────────┐    │
         │  │  Sandbox Container           │    │
         │  │  (Ubuntu 20.04 + Node 22)    │    │
         │  │                              │    │
         │  │  /home/sandbox/app/sandbox/  │    │
         │  │  ├── package.json            │    │
         │  │  ├── src/App.jsx             │    │
         │  │  ├── vite.config.js          │    │
         │  │  └── ... (project files)     │    │
         │  │                              │    │
         │  │  Port 5173 → random host port│    │
         │  └─────────────────────────────┘    │
         └─────────────────────────────────────┘
```

---

## 1.4 Two-Server Architecture

The backend runs **two separate HTTP/WS servers** on different ports:

| Server | Port | Protocol | Purpose |
|--------|------|----------|---------|
| **Main Server** | `3000` | HTTP + Socket.IO | REST API, editor WebSocket events |
| **Terminal Server** | `4000` | HTTP + Raw WebSocket | Terminal I/O with Docker containers |

**Why two servers?** The terminal uses raw WebSocket (`ws` library) instead of Socket.IO because `xterm.js` uses the `AttachAddon` which requires a raw WebSocket connection. The editor uses Socket.IO for its richer event-based messaging model. Keeping them on separate ports avoids protocol conflicts.

---

## 1.5 Component Architecture (Atomic Design)

The frontend follows the **Atomic Design** pattern:

```
components/
├── atoms/           ← Smallest, self-contained UI elements
│   ├── EditorButton/    (tab button for files)
│   ├── FileIcon/        (file-type icon renderer)
│   └── PingComponent    (health check display)
│
├── molecules/       ← Combinations of atoms that form functional units
│   ├── EditorComponent/ (Monaco Editor wrapper)
│   ├── BrowserTerminal/ (xterm.js terminal wrapper)
│   ├── TreeNode/        (single file/folder in tree)
│   └── ContextMenu/     (right-click menu for files)
│
└── organisms/       ← Full feature sections composed of molecules
    ├── TreeStructure/   (complete file explorer sidebar)
    ├── Browser/         (embedded iframe preview)
    └── AgentPanel/      (AI agent chat interface)
```

---

## 1.6 Key Design Decisions

1. **Docker-out-of-Docker (DooD):** The backend container mounts the host's Docker socket (`/var/run/docker.sock`), allowing it to spawn sandbox containers on the host. This is simpler than Docker-in-Docker but requires the host to have Docker installed.

2. **File-Based Persistence:** Project files live on the host filesystem under `backend/projects/<uuid>/sandbox/`. No database is used. This keeps the architecture simple but means state is ephemeral unless backed up.

3. **Debounced Auto-Save:** The editor debounces file writes by 2 seconds. Every keystroke resets the timer, so the file is only saved after 2 seconds of inactivity. This prevents overwhelming the backend with write requests.

4. **Chokidar File Watching:** The backend watches the project directory for changes and broadcasts `fileChanged` events to all connected clients. This enables the embedded browser to auto-refresh when the AI agent modifies files.

5. **Agent Runs Asynchronously:** When the user submits a goal, the HTTP response returns immediately with "Agent started." The actual agent work runs in the background, streaming logs to the frontend via Socket.IO.

---

> **Next Chapter:** [Chapter 2 — Project Setup & Configuration →](./chapter-02-project-setup.md)
