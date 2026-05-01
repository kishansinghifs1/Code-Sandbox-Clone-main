# Code Sandbox Clone: End-to-End Interview Guide

This guide is the single reference I would use in an interview to explain the project from top to bottom. It covers what the app does, how data moves through the system, how the frontend and backend cooperate, how Docker and websockets fit in, and the kinds of follow-up questions an interviewer is likely to ask.

## 1. One-Line Summary

This is a browser-based code sandbox clone that lets a user create a new project, edit files in a React/Vite IDE, run a terminal inside a sandboxed container, preview the app in a browser panel, and optionally trigger an AI agent to help modify the project.

## 2. How I Would Pitch It

If an interviewer asks, "What did you build?", a strong answer is:

"I built a web-based development environment similar to CodeSandbox. The frontend is a React SPA, the backend is an Express and Socket.IO service, and each project lives inside a dedicated sandbox folder. The backend creates projects, serves the file tree, watches file changes, manages realtime editor updates, and attaches a websocket terminal to a Docker-backed sandbox. The UI also includes an AI agent panel and a browser preview, so the whole app behaves like a mini cloud IDE."

## 3. Technology Stack

Frontend:
- React 19
- Vite
- React Router
- Zustand for local state
- TanStack React Query
- Socket.IO client and raw WebSocket client
- Monaco editor
- Xterm.js
- Ant Design
- Allotment for resizable panes

Backend:
- Node.js
- Express 5
- Socket.IO
- ws for terminal streaming
- Dockerode for container management
- chokidar for file watching
- directory-tree for folder snapshots
- LangGraph and Google GenAI packages for the AI agent

Deployment:
- Docker and Docker Compose
- Separate frontend, backend, and sandbox image build flow

## 4. Repository Layout

The most important entry points are:
- `frontend/src/main.jsx` for the React bootstrap
- `frontend/src/App.jsx` and `frontend/src/Router.jsx` for route wiring
- `frontend/src/pages/CreateProject.jsx` for project creation
- `frontend/src/pages/ProjectPlayground.jsx` for the IDE experience
- `backend/src/index.js` for the main API and Socket.IO server
- `backend/src/terminalApp.js` for the terminal websocket server
- `backend/src/service/projectService.js` for project creation and tree reading
- `backend/src/controllers/agentController.js` for AI agent requests and log streaming

## 5. User Journey End To End

### 5.1 Landing Page

The user lands on `/`, which renders the `CreateProject` page. The UI is intentionally simple: one call to action that creates a fresh playground.

### 5.2 Project Creation

When the button is clicked, the frontend calls `POST /api/v1/projects` through the `createProjectApi` wrapper in `frontend/src/apis/projects.js`.

On the backend, `createProjectController` delegates to `createProjectService`, which:
- generates a UUID project id
- creates `backend/projects/<projectId>`
- runs the React project creation command inside that folder
- overwrites the generated `vite.config.js` with a Docker-friendly config
- makes the project writable for the sandbox runtime

The response returns the new project id, and the frontend navigates to `/project/:projectId`.

### 5.3 Playground Bootstrapping

`ProjectPlayground` reads the project id from the URL and does three important things:
- stores the project id in Zustand
- opens a Socket.IO connection to the `/editor` namespace
- opens a raw websocket connection to the terminal server on port 4000

That is the real handoff point where the project becomes interactive.

### 5.4 File Tree Loading

The file tree comes from `GET /api/v1/projects/:projectId/tree`.

The tree is fetched through React Query and stored in `useTreeStructureStore`. That store keeps the project id and the latest directory snapshot so the left sidebar can render the filesystem.

### 5.5 Editing Files

The editor is powered by Monaco inside `EditorComponent`. File open and file lifecycle events flow through the editor socket store.

When the backend emits `readFileSuccess`, the frontend opens the file in the active tab. When create/delete events happen, the tree is refreshed. When the backend emits `getPortSuccess`, the preview port is stored so the browser panel can connect to the right app.

### 5.6 Terminal Runtime

The terminal is a separate websocket system from the editor. The frontend connects to `ws://localhost:4000/terminal?projectId=...`, the backend creates or attaches to the sandbox container, and the websocket streams terminal input and output.

### 5.7 Browser Preview

The right panel has a Browser tab. It is lazy-loaded so the iframe or embedded browser is only created when needed. Once loaded, it uses the terminal socket and project id to show the app running in the sandbox.

### 5.8 AI Agent Flow

The AI panel calls the agent endpoints and receives streamed logs.

The backend immediately acknowledges the request, then runs the agent asynchronously. Agent logs are emitted over the editor namespace and also stored in `agent_logs.json` inside the project folder.

## 6. Backend API Surface

The API routes are intentionally small and focused.

### Root and health
- `GET /ping` returns `pong`
- `GET /api/v1/ping` is also wired through the router

### Projects
- `POST /api/v1/projects` creates a new sandbox project
- `GET /api/v1/projects/:projectId/tree` returns the directory tree for a project

### Agent
- `POST /api/v1/agent` starts the AI agent for a project goal
- `GET /api/v1/agent/:projectId/logs` returns the stored agent log history

## 7. Websocket and Realtime Design

### 7.1 Editor Namespace

The backend creates a Socket.IO namespace at `/editor`.

The editor socket flow does two jobs:
- it handles file operations and editor events from the frontend
- it watches the project directory with chokidar and broadcasts file change notifications

This means a file edited on disk can trigger a frontend refresh, which is essential when the backend or container changes the filesystem directly.

### 7.2 File Watcher Behavior

For each connected project, the backend starts a watcher on `./projects/<projectId>`. It ignores `node_modules` and uses write-finish stabilization so the UI does not react to half-written files.

That is a practical design choice because sandbox projects may generate a lot of filesystem churn.

### 7.3 Terminal Websocket

The terminal server uses the `ws` package on port 4000.

When a connection matches `/terminal`, the backend extracts the project id from the query string, creates a container for that project, and binds the websocket to the terminal session.

This is separate from Socket.IO on purpose. The editor flow and the terminal stream have different transport needs, and raw WebSockets are a good fit for terminal byte streams.

## 8. Frontend State Management

The frontend uses Zustand stores instead of pushing everything through a single global context.

Important stores:
- `treeStructureStore` keeps the current project id and tree snapshot
- `editorSocketStore` subscribes to editor socket events and updates tabs, tree, and port state
- `terminalSocketStore` stores the raw terminal websocket reference
- `agentStore` tracks agent logs and running state
- `activeFileTabStore` tracks the currently opened file
- `portStore` stores the app port used by the preview browser
- `fileContextMenuStore` and `folderContextMenuStore` support tree actions

Why this matters in an interview:
- the stores keep the UI modular
- socket subscriptions are centralized
- the editor, tree, terminal, and agent panel can update independently

## 9. Docker and Sandbox Lifecycle

The app is designed around sandboxed project execution.

The Docker Compose setup includes:
- backend service on ports 3000 and 4000
- frontend service on port 5173
- a sandbox image build step
- a Docker socket mount so the backend can create or manage containers

The important part is that the project runtime is isolated from the host as much as possible while still allowing the backend to control execution and previews.

A good interview answer here is:

"I used Docker to keep each project runtime isolated. The backend creates the project scaffold on disk, then the terminal service attaches a container to that project and streams I/O back to the browser. That keeps execution reproducible and makes it easier to reset or recreate environments."

## 10. Key Implementation Decisions

### 10.1 Why separate the terminal server?

Terminal traffic is noisy and long-lived. Keeping it on a dedicated websocket server on port 4000 avoids coupling shell I/O to the main API server.

### 10.2 Why use Socket.IO for the editor?

Socket.IO gives a convenient event model for editor actions, file updates, and agent log broadcasting.

### 10.3 Why use React Query in the tree store?

The project tree is fetched from the backend and should be cacheable. React Query handles deduping and cache lifecycle without manual fetch state management.

### 10.4 Why store project files on disk?

This makes the sandbox behavior easy to inspect, easy to synchronize with Docker mounts, and straightforward to render as a tree.

## 11. End-To-End Flows You Should Be Able To Explain

### 11.1 Create Project Flow
1. User clicks create playground
2. Frontend posts to `POST /api/v1/projects`
3. Backend creates a UUID project folder
4. Backend scaffolds a Vite React app in that folder
5. Backend rewrites sandbox Vite config for Docker networking
6. Frontend navigates to the project page

### 11.2 Open Project Flow
1. URL loads `/project/:projectId`
2. Frontend stores the project id
3. Frontend connects to `/editor`
4. Frontend connects to terminal websocket on port 4000
5. Frontend fetches the project tree
6. UI renders editor, terminal, browser, and agent panel

### 11.3 File Edit Flow
1. User selects a file in the tree
2. Frontend asks the backend to read or update the file
3. Backend persists the change on disk
4. Backend emits success events through the editor socket
5. Frontend updates the active tab and refreshes tree state if needed

### 11.4 Agent Flow
1. User sends a goal to the agent
2. Backend validates `projectId` and `goal`
3. Backend immediately returns success so the UI stays responsive
4. Agent runs in the background
5. Logs stream to the editor namespace and to `agent_logs.json`

### 11.5 Preview Flow
1. User opens the browser panel
2. Frontend lazily mounts the browser view
3. Browser connects using the project runtime port
4. The sandboxed app renders inside the IDE layout

## 12. What Interviewers Usually Ask

### 12.1 "What problem does this solve?"
It gives users a one-click cloud IDE with project scaffolding, realtime editing, terminal access, and browser preview without local setup.

### 12.2 "Why did you choose this architecture?"
The architecture separates concerns cleanly: React handles the UI, Express handles project and agent APIs, Socket.IO handles realtime editor coordination, and a dedicated websocket server handles terminal I/O.

### 12.3 "How does the backend know which project to serve?"
The project id is generated during creation and then passed through the URL, websocket query params, and API requests.

### 12.4 "How do you keep the UI in sync with filesystem changes?"
A chokidar watcher monitors each project folder and emits `fileChanged` events to connected clients.

### 12.5 "How do you handle long-running agent work?"
The controller returns immediately, then runs the agent asynchronously and streams log entries back to the UI.

### 12.6 "Why not use one websocket for everything?"
Because editor events and terminal streams have very different characteristics. A shared transport would make the code harder to reason about and would mix structured events with raw shell I/O.

### 12.7 "What would you improve next?"
I would add authentication, multi-user conflict handling, stronger container isolation, per-project resource limits, and a more robust preview management layer.

## 13. Security and Reliability Considerations

This is a good section to mention proactively in an interview.

Current risks and mitigations:
- user code executes in containers, not directly on the host
- file watchers ignore `node_modules`
- the backend should validate all websocket payloads and API input
- Docker socket access is powerful and should be tightly controlled
- agent logs are persisted for visibility, but untrusted prompt data should still be treated carefully

If pressed on production hardening, the next steps would be:
- authentication and authorization
- per-project isolation policies
- resource quotas for CPU, memory, and disk
- input size limits for websocket messages
- better escape handling for terminal sessions

## 14. Limitations

Be honest about these if asked:
- the current collaboration model is not full CRDT-based realtime co-editing
- the backend relies on filesystem polling and watchers, which may not scale indefinitely
- Docker socket control is convenient but requires operational care
- browser preview loading is intentionally lazy, so the first open may be slower than subsequent opens

## 15. Strong Short Answers For Rapid-Fire Questions

### "What is the frontend?"
A React 19 Vite SPA with Monaco, Xterm, Zustand, React Query, and Socket.IO.

### "What is the backend?"
An Express and Socket.IO service that creates projects, serves file trees, watches files, runs an AI agent, and manages Docker-backed sandboxes.

### "How do you create a project?"
Generate a UUID, scaffold a Vite React app in `backend/projects/<id>`, patch the Vite config, and return the id to the frontend.

### "How do you stream terminal output?"
A raw websocket on port 4000 connects the browser to a project-specific sandbox container.

### "How do you keep the editor synced?"
The editor socket handles file operations, and chokidar broadcasts filesystem changes back to connected clients.

## 16. Suggested Interview Walkthrough

If you have to explain the system in order, use this sequence:
1. start with the product goal
2. describe the frontend routes and what each page does
3. explain project creation and the backend scaffold flow
4. describe the editor socket and tree fetching path
5. explain the terminal websocket and sandbox containers
6. mention the agent panel and log persistence
7. finish with security, scaling, and what you would improve next

## 17. Final Takeaway

The cleanest way to describe this project is:

"It is a cloud IDE with project scaffolding, realtime file editing, terminal execution, browser preview, and an AI assistant. The system is split into a React frontend, an Express and websocket backend, and Docker-based sandboxes for safe execution."

That answer is short, accurate, and easy to expand into deeper technical detail when the interviewer starts drilling into architecture, data flow, or runtime isolation.
