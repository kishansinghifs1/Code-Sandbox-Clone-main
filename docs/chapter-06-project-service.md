# Chapter 6 — Project Service & File System

This chapter explains how projects are created, how the file tree is generated, and the filesystem layout that everything depends on.

---

## 6.1 Project Service — `backend/src/service/projectService.js`

### `createProjectService()`

This is the function that runs when a user clicks "🚀 Create Playground" on the landing page.

```javascript
import uuid4 from "uuid4";
import fs from "fs/promises";
import { REACT_PROJECT_COMMAND } from "../config/serverConfig.js";
import { execPromisified } from "../utils/execUtility.js";
import path from "path";
import directoryTree from "directory-tree";
```

#### Vite Config Template

Before the function, a Vite configuration template is defined:

```javascript
const VITE_CONFIG_TEMPLATE = `import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    host: '0.0.0.0',              // Listen on all interfaces (required for Docker)
    port: process.env.VITE_PORT || 5173,
    watch: {
      usePolling: true,           // Required for Docker volume mounts
      interval: 1000,             // Poll every 1 second
    },
    hmr: {
      host: 'localhost',
      port: process.env.VITE_PORT || 5173,
      protocol: 'ws',
    }
  }
})
`;
```

**Why override the default Vite config?**
- **`host: '0.0.0.0'`** — Inside a Docker container, `localhost` only binds to the container's loopback. `0.0.0.0` makes the dev server accessible from outside the container.
- **`usePolling: true`** — Docker volume mounts don't support inotify (Linux file change notifications). Polling is required for Vite's hot reload to detect file changes.
- **`interval: 1000`** — Check for changes every second (a balance between responsiveness and CPU usage).

#### The Creation Flow

```javascript
export const createProjectService = async () => {
  // Step 1: Generate a unique project ID
  const projectId = uuid4();
  console.log("New project id is", projectId);

  // Step 2: Create the project directory
  await fs.mkdir(`./projects/${projectId}`, { recursive: true });

  // Step 3: Scaffold a React + Vite project inside it
  const response = await execPromisified(REACT_PROJECT_COMMAND, {
    cwd: `./projects/${projectId}`,
  });

  // Step 4: Override vite.config.js with Docker-optimized settings
  const viteConfigPath = path.join(
    `./projects/${projectId}/sandbox`,
    'vite.config.js'
  );
  await fs.writeFile(viteConfigPath, VITE_CONFIG_TEMPLATE);

  // Step 5: Fix file permissions for the sandbox user
  await execPromisified(`chmod -R 777 ./projects/${projectId}`);

  return projectId;
};
```

#### Step-by-Step:

1. **`uuid4()`** generates a UUID like `a1b2c3d4-e5f6-7890-abcd-ef1234567890`

2. **`fs.mkdir(..., { recursive: true })`** creates:
   ```
   backend/projects/a1b2c3d4-.../
   ```

3. **`execPromisified(REACT_PROJECT_COMMAND, { cwd: ... })`** runs:
   ```bash
   npx --yes create-vite@latest sandbox --template react
   ```
   This creates a complete React + Vite project inside a `sandbox/` subdirectory:
   ```
   backend/projects/a1b2c3d4-.../
   └── sandbox/
       ├── index.html
       ├── package.json
       ├── vite.config.js
       ├── public/
       │   └── vite.svg
       └── src/
           ├── App.css
           ├── App.jsx
           ├── assets/
           ├── index.css
           └── main.jsx
   ```

4. **Override `vite.config.js`** — Replaces the default config with the Docker-optimized template that enables polling-based file watching and `0.0.0.0` binding.

5. **`chmod -R 777`** — The sandbox Docker container runs as a non-root `sandbox` user. Without this, the user can't modify files that were created by the root-running backend. `777` gives full read/write/execute permissions to all users.

---

### `getProjectTreeService(projectId)`

```javascript
export const getProjectTreeService = async (projectId) => {
  const projectPath = path.resolve(`./projects/${projectId}`);
  const tree = directoryTree(projectPath);
  return tree;
};
```

This uses the `directory-tree` npm package to recursively scan the project directory and return a JSON representation:

```json
{
  "name": "a1b2c3d4-...",
  "path": "/app/projects/a1b2c3d4-.../",
  "type": "directory",
  "children": [
    {
      "name": "sandbox",
      "path": "/app/projects/a1b2c3d4-.../sandbox",
      "type": "directory",
      "children": [
        {
          "name": "package.json",
          "path": "/app/projects/a1b2c3d4-.../sandbox/package.json",
          "type": "file",
          "size": 326
        },
        {
          "name": "src",
          "path": "/app/projects/a1b2c3d4-.../sandbox/src",
          "type": "directory",
          "children": [...]
        }
      ]
    }
  ]
}
```

Each node has:
- **`name`** — The file/folder name
- **`path`** — The absolute filesystem path (used to read/write the file via WebSocket)
- **`type`** — `"directory"` or `"file"`
- **`children`** — Present only for directories
- **`size`** — Present only for files (bytes)

The frontend's `TreeNode` component uses the `children` property to determine if a node is a file or folder.

---

## 6.2 Filesystem Layout

### During Development (Host Machine)

```
backend/
├── projects/
│   ├── a1b2c3d4-.../
│   │   ├── sandbox/          ← The actual Vite project
│   │   │   ├── node_modules/ ← Installed by the sandbox container
│   │   │   ├── package.json
│   │   │   ├── vite.config.js
│   │   │   ├── index.html
│   │   │   ├── src/
│   │   │   │   ├── App.jsx
│   │   │   │   ├── main.jsx
│   │   │   │   └── ...
│   │   │   └── public/
│   │   └── agent_logs.json   ← AI agent log history (created on first agent run)
│   │
│   └── e5f6g7h8-.../         ← Another project
│       ├── sandbox/
│       └── agent_logs.json
```

### Inside the Docker Container

When a sandbox container is created, the project directory is mounted:

```
Host: backend/projects/a1b2c3d4-.../ 
  → Container: /home/sandbox/app/

Container filesystem:
/home/sandbox/app/
├── sandbox/                    ← Working directory for terminal
│   ├── package.json
│   ├── vite.config.js
│   ├── src/App.jsx
│   └── ...
└── agent_logs.json
```

The container's working directory is `/home/sandbox/app/sandbox/` — this is where `npm install`, `npm run dev`, and all other commands execute.

---

## 6.3 File Path Anatomy

Understanding paths is crucial because they flow between three contexts:

| Context | Example Path |
|---|---|
| **Host filesystem** | `/home/user/project/backend/projects/abc/sandbox/src/App.jsx` |
| **Backend container** | `/app/projects/abc/sandbox/src/App.jsx` |
| **Sandbox container** | `/home/sandbox/app/sandbox/src/App.jsx` |
| **Relative (agent tools)** | `src/App.jsx` |

The `editorHandler.js` uses **absolute paths from the backend container's perspective** (e.g., `/app/projects/abc/sandbox/src/App.jsx`) because the `directory-tree` output provides absolute paths, and the frontend sends those paths back when reading/writing files.

The AI agent tools use **relative paths from the sandbox root** (e.g., `src/App.jsx`) because the tools prepend `sandboxRoot` automatically.

---

> **Next Chapter:** [Chapter 7 — WebSocket & Realtime Editor →](./chapter-07-websocket-editor.md)
