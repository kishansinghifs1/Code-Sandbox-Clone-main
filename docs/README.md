# 📚 Code Sandbox Clone — Complete Documentation

Welcome to the complete documentation for the **Code Sandbox Clone** project. This guide is organized into chapters, each focusing on a specific aspect of the system. By reading through every chapter sequentially, you will gain a deep understanding of every file, every design decision, and every data flow in the entire codebase.

---

## Table of Contents

| Chapter | Title | Description |
|---------|-------|-------------|
| [Chapter 1](./chapter-01-overview.md) | **Project Overview & Architecture** | High-level system design, tech stack, and how all the pieces fit together |
| [Chapter 2](./chapter-02-project-setup.md) | **Project Setup & Configuration** | Environment variables, package.json, Vite config, and getting started |
| [Chapter 3](./chapter-03-backend-entry.md) | **Backend Entry Points** | `index.js`, `terminalApp.js` — the two servers and how they boot |
| [Chapter 4](./chapter-04-backend-config.md) | **Backend Configuration & Utilities** | `serverConfig.js`, `execUtility.js` — shared helpers |
| [Chapter 5](./chapter-05-rest-api.md) | **REST API Layer** | Routes, controllers, and the request/response lifecycle |
| [Chapter 6](./chapter-06-project-service.md) | **Project Service & File System** | Creating projects, reading directory trees, Vite scaffolding |
| [Chapter 7](./chapter-07-websocket-editor.md) | **WebSocket & Realtime Editor** | Socket.IO editor handler, file watchers, realtime collaboration |
| [Chapter 8](./chapter-08-docker-containers.md) | **Docker Container Management** | Container creation, terminal spawning, Docker-out-of-Docker |
| [Chapter 9](./chapter-09-terminal-system.md) | **Terminal System** | Raw WebSocket terminal, stream multiplexing, xterm integration |
| [Chapter 10](./chapter-10-ai-agent.md) | **AI Agent (CogniBox)** | LangGraph ReAct agent, sandbox tools, streaming logs |
| [Chapter 11](./chapter-11-frontend-entry.md) | **Frontend Entry & Routing** | `main.jsx`, `App.jsx`, `Router.jsx`, providers |
| [Chapter 12](./chapter-12-state-management.md) | **State Management (Zustand Stores)** | Every store explained — editor, terminal, tree, agent, file context |
| [Chapter 13](./chapter-13-api-hooks.md) | **API Layer & React Query Hooks** | Axios config, API wrappers, query/mutation hooks |
| [Chapter 14](./chapter-14-components-atoms.md) | **UI Components — Atoms** | `EditorButton`, `FileIcon`, `PingComponent` |
| [Chapter 15](./chapter-15-components-molecules.md) | **UI Components — Molecules** | `EditorComponent`, `BrowserTerminal`, `TreeNode`, `FileContextMenu` |
| [Chapter 16](./chapter-16-components-organisms.md) | **UI Components — Organisms** | `TreeStructure`, `Browser`, `AgentPanel` |
| [Chapter 17](./chapter-17-pages.md) | **Pages** | `CreateProject` landing page and `ProjectPlayground` IDE |
| [Chapter 18](./chapter-18-deployment.md) | **Deployment & Docker Compose** | Dockerfiles, Nginx, docker-compose for dev and production |
| [Chapter 19](./chapter-19-data-flow.md) | **End-to-End Data Flows** | Complete walkthroughs of every major user journey |
| [Chapter 20](./chapter-20-security.md) | **Security, Scaling & Future Work** | Security considerations, known limitations, improvement roadmap |

---

> **How to read this documentation:**  
> Start from Chapter 1 and work your way through sequentially. Each chapter builds on concepts introduced in prior chapters. Alternatively, use the table above to jump directly to any topic.

---

*Generated for the Code Sandbox Clone project — a web-based IDE with an integrated AI agent, Docker sandboxing, and real-time collaborative editing.*
