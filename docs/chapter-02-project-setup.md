# Chapter 2 — Project Setup & Configuration

## 2.1 Repository Structure

```
Code-Sandbox-Clone-main/
├── .env                        # Root environment variables (Docker Compose)
├── .env.example                # Template with all required variables
├── docker-compose.yml          # Development orchestration
├── docker-compose.prod.yml     # Production orchestration
├── push_images.sh              # Script to build & push Docker images
├── ARCHITECTURE.md             # High-level architecture notes
│
├── backend/
│   ├── .env                    # Backend-specific env vars (GEMINI_API_KEY)
│   ├── .dockerignore           # Excludes node_modules from Docker build
│   ├── .gitignore              # Excludes node_modules from Git
│   ├── Dockerfile              # Backend container image
│   ├── Dockerfile.sandbox      # Sandbox container image (Ubuntu + Node)
│   ├── package.json            # Dependencies & scripts
│   ├── projects/               # Runtime directory — each project is a subfolder
│   └── src/                    # Application source code
│       ├── index.js            # Main server entry (port 3000)
│       ├── terminalApp.js      # Terminal server entry (port 4000)
│       ├── config/
│       ├── controllers/
│       ├── routes/
│       ├── service/
│       ├── socketHandlers/
│       ├── containers/
│       └── utils/
│
└── frontend/
    ├── .env                    # Frontend env vars (VITE_BACKEND_URL)
    ├── .dockerignore           # Excludes node_modules from Docker build
    ├── .gitignore              # Standard Vite gitignore
    ├── Dockerfile              # Dev container image
    ├── Dockerfile.prod         # Production multi-stage build (Vite → Nginx)
    ├── nginx.conf              # Nginx reverse proxy config (production)
    ├── Dracula.json            # Monaco Editor Dracula theme definition
    ├── index.html              # HTML shell (SPA entry point)
    ├── vite.config.js          # Dev proxy rules & Vite configuration
    ├── eslint.config.js        # ESLint configuration
    ├── package.json            # Dependencies & scripts
    └── src/                    # Application source code
        ├── main.jsx            # React DOM render entry
        ├── App.jsx             # Root component
        ├── App.css             # Global styles
        ├── index.css           # Base CSS reset
        ├── Router.jsx          # Client-side route definitions
        ├── apis/               # HTTP API wrappers
        ├── components/         # UI components (atomic design)
        ├── config/             # Axios instance
        ├── hooks/              # Custom React hooks
        ├── pages/              # Route-level page components
        ├── stores/             # Zustand state stores
        └── utils/              # Utility functions
```

---

## 2.2 Environment Variables

### Root `.env` (used by Docker Compose)

```env
HOST_PROJECT_PATH=/absolute/path/to/backend
```

This variable is **critical** for Docker-out-of-Docker. When the backend spawns a sandbox container, it mounts `projects/<id>` as a volume. But since the backend itself runs inside a container, it needs to know the **host machine's** absolute path to correctly bind-mount the directory.

### `.env.example` (full template)

```env
# Backend Configuration
PORT=3000
GEMINI_API_KEY=your-api-key-here

# Docker-out-of-Docker volume mounting
HOST_PROJECT_PATH=/path/to/your/project/backend

# Docker Hub image names
SANDBOX_IMAGE=kishansingh1/codesandbox-sandbox:latest
BACKEND_IMAGE=kishansingh1/codesandbox-backend:latest
FRONTEND_IMAGE=kishansingh1/codesandbox-frontend:latest

# Frontend Configuration (for development)
VITE_API_URL=http://localhost:3000
VITE_TERMINAL_URL=ws://localhost:4000
VITE_BACKEND_URL=http://localhost:3000
```

### Backend `.env`

```env
GEMINI_API_KEY=your-gemini-api-key
PORT=3000
```

The `GEMINI_API_KEY` is used by the LangGraph agent to call Google's Gemini 2.0 Flash model. Without it, the AI agent feature will not work (but the rest of the sandbox functions normally).

### Frontend `.env`

```env
VITE_BACKEND_URL=http://localhost:3000
```

Used by the Axios instance as the base URL for API calls. In production (behind Nginx), this is typically empty because Nginx proxies `/api` requests to the backend automatically.

---

## 2.3 Backend `package.json` Explained

```json
{
  "name": "backend",
  "version": "1.0.0",
  "type": "module",              // ES module syntax (import/export)
  "scripts": {
    "dev": "npx nodemon --ignore projects/ src/index.js"
  }
}
```

### Key Points:

- **`"type": "module"`** — Enables native ES module syntax (`import`/`export`) instead of CommonJS (`require`).
- **`nodemon --ignore projects/`** — The `projects/` folder changes constantly as users edit files. Without `--ignore`, nodemon would restart the server on every file save, which would disconnect all WebSocket clients.
- **Entry point:** `src/index.js` — This file boots BOTH servers (the main Express app on port 3000 AND imports `terminalApp.js` which starts port 4000).

### Dependencies Breakdown:

| Package | Version | Purpose |
|---|---|---|
| `@langchain/core` | ^1.1.42 | Core LangChain abstractions (tools, messages) |
| `@langchain/google-genai` | ^2.1.29 | Google Gemini LLM integration |
| `@langchain/langgraph` | ^1.2.9 | Agentic graph framework (ReAct agent) |
| `chokidar` | ^5.0.0 | Cross-platform file system watcher |
| `cookie-parser` | ^1.4.7 | Parse HTTP cookies (available for future auth) |
| `cors` | ^2.8.5 | Cross-Origin Resource Sharing middleware |
| `directory-tree` | ^3.5.2 | Generates JSON tree from filesystem directories |
| `dockerode` | ^4.0.9 | Node.js Docker Engine API client |
| `dotenv` | ^17.2.3 | Loads `.env` files into `process.env` |
| `express` | ^5.2.1 | HTTP framework (v5 with async error handling) |
| `socket.io` | ^4.8.2 | WebSocket library with rooms, namespaces, events |
| `uuid4` | ^2.0.3 | UUID v4 generation for project IDs |
| `ws` | ^8.19.0 | Lightweight WebSocket implementation for terminal |

---

## 2.4 Frontend `package.json` Explained

### Dependencies Breakdown:

| Package | Version | Purpose |
|---|---|---|
| `@ant-design/icons` | ^6.1.0 | Icon set for Ant Design components |
| `@monaco-editor/react` | ^4.7.0 | React wrapper for Monaco Editor |
| `@tanstack/react-query` | ^5.90.12 | Server-state management (caching, mutations) |
| `@xterm/addon-attach` | ^0.12.0 | Attaches xterm to a raw WebSocket |
| `@xterm/addon-fit` | ^0.11.0 | Auto-fits terminal to container size |
| `@xterm/xterm` | ^6.0.0 | Terminal emulator for the browser |
| `allotment` | ^1.20.5 | VS Code-style resizable split panes |
| `antd` | ^6.1.1 | Ant Design UI component library |
| `axios` | ^1.13.2 | HTTP client for API calls |
| `react` | ^19.2.0 | UI framework |
| `react-dom` | ^19.2.0 | DOM rendering for React |
| `react-icons` | ^5.5.0 | Icon library (FaJs, FaCss3, etc.) |
| `react-router-dom` | ^7.12.0 | Client-side routing |
| `socket.io-client` | ^4.8.3 | Socket.IO client for editor events |
| `zustand` | ^5.0.9 | Minimal state management library |

---

## 2.5 Vite Configuration (`frontend/vite.config.js`)

```javascript
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
      '/socket.io': {
        target: 'http://localhost:3000',
        ws: true,
      },
      '/terminal': {
        target: 'http://localhost:4000',
        ws: true,
      }
    }
  }
})
```

### What This Does:

In development, the frontend runs on `http://localhost:5173`. The backend runs on `http://localhost:3000` (REST + Socket.IO) and `http://localhost:4000` (terminal WebSocket). The Vite proxy configuration forwards:

1. **`/api/*`** → `http://localhost:3000` — All REST API calls
2. **`/socket.io/*`** → `http://localhost:3000` — Socket.IO WebSocket upgrade requests  
3. **`/terminal/*`** → `http://localhost:4000` — Terminal raw WebSocket connections

This eliminates CORS issues in development and lets the frontend use relative URLs (e.g., `/api/v1/projects` instead of `http://localhost:3000/api/v1/projects`).

---

## 2.6 Frontend `index.html`

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <link rel="icon" type="image/svg+xml" href="/vite.svg" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link
      href="https://fonts.googleapis.com/css2?family=Fira+Code:wght@400;500;600&display=swap"
      rel="stylesheet"
    />
    <title>frontend</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.jsx"></script>
  </body>
</html>
```

### Key Details:

- **Fira Code font** is loaded from Google Fonts — used throughout the editor and terminal for a monospace coding experience.
- **`<div id="root">`** is where React mounts the entire application.
- **`type="module"`** on the script tag enables ES module loading for Vite.

---

## 2.7 Getting Started Locally

### Prerequisites
- Node.js 22+
- Docker Desktop (or Docker Engine + Docker Compose)
- A Gemini API key (optional, only for AI agent)

### Option A: Docker Compose (Recommended)

```bash
# 1. Clone the repo
git clone <repo-url>
cd Code-Sandbox-Clone-main

# 2. Create the .env file
cp .env.example .env
# Edit .env and set HOST_PROJECT_PATH to the absolute path of the backend/ directory

# 3. Start everything
docker compose up --build
```

This starts three services:
- **frontend** → `http://localhost:5173`
- **backend** → `http://localhost:3000` (REST) and `http://localhost:4000` (Terminal)
- **sandbox** → Just builds the sandbox Docker image (exits immediately)

### Option B: Manual (without Docker Compose)

```bash
# Terminal 1: Backend
cd backend
npm install
cp ../.env.example .env  # Edit with your GEMINI_API_KEY
npm run dev

# Terminal 2: Frontend
cd frontend
npm install
npm run dev

# Also: Build the sandbox Docker image
cd backend
docker build -t sandbox -f Dockerfile.sandbox .
```

---

> **Next Chapter:** [Chapter 3 — Backend Entry Points →](./chapter-03-backend-entry.md)
