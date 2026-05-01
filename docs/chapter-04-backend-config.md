# Chapter 4 — Backend Configuration & Utilities

This chapter covers the shared configuration and utility modules that the rest of the backend depends on.

---

## 4.1 Server Configuration — `backend/src/config/serverConfig.js`

```javascript
import dotenv from 'dotenv';

dotenv.config();

export const PORT = process.env.PORT || 3000;
export const REACT_PROJECT_COMMAND = process.env.REACT_PROJECT_COMMAND 
  || "npx --yes create-vite@latest sandbox --template react";
```

### Line-by-Line Breakdown:

1. **`dotenv.config()`** — Reads the `backend/.env` file and injects its variables into `process.env`. This must run before any other code reads environment variables.

2. **`PORT`** — The main server listens on this port. Defaults to `3000` if not specified in the environment.

3. **`REACT_PROJECT_COMMAND`** — The shell command used to scaffold a new React project. It uses `create-vite` with the `react` template. The `--yes` flag auto-confirms the npx prompt. The project is created inside a folder named `sandbox` within each project's directory.

### Why is the command configurable?

In production, you might want to use a pre-built template or a different scaffolding tool. Making it an environment variable allows changing the project template without modifying code.

---

## 4.2 Exec Utility — `backend/src/utils/execUtility.js`

```javascript
import child_process from 'child_process';
import util from 'util';

export const execPromisified = util.promisify(child_process.exec);
```

### What This Does:

Node.js's built-in `child_process.exec` uses callbacks. This utility wraps it with `util.promisify` to convert it into a Promise-based function that can be used with `async/await`.

### Usage Example:

```javascript
// Without promisify:
child_process.exec('npm install', (err, stdout, stderr) => {
  // callback pattern
});

// With promisify:
const { stdout, stderr } = await execPromisified('npm install', { cwd: './some-path' });
```

This is used in `projectService.js` to run the Vite scaffolding command and to fix file permissions.

### Where It's Used:

| Consumer | Usage |
|---|---|
| `projectService.js` | Run `npx create-vite@latest sandbox --template react` to scaffold new projects |
| `projectService.js` | Run `chmod -R 777 ./projects/<id>` to fix permissions for the sandbox user |

---

## 4.3 Configuration Design Patterns

### Environment Variable Hierarchy

The project uses a three-level environment variable system:

```
Priority (highest to lowest):
1. Docker Compose environment block (docker-compose.yml)
2. .env file in the service directory (backend/.env)
3. Hardcoded defaults in serverConfig.js
```

For example, `HOST_PROJECT_PATH`:
- Docker Compose sets it: `HOST_PROJECT_PATH=${HOST_PROJECT_PATH:-$PWD/backend}`
- The `:-` syntax means "use $PWD/backend if not set"
- The backend code reads it as `process.env.HOST_PROJECT_PATH || process.cwd()`

### Centralized Config Pattern

All configuration is centralized in `serverConfig.js`. Other modules import from this single source:

```javascript
// ✅ Good: Import from config
import { PORT, REACT_PROJECT_COMMAND } from "./config/serverConfig.js";

// ❌ Bad: Read process.env directly in business logic
const port = process.env.PORT;
```

The only exception is `process.env.GEMINI_API_KEY` which is read directly in `langgraphAgent.js` (since it's a one-off usage within the AI service).

---

> **Next Chapter:** [Chapter 5 — REST API Layer →](./chapter-05-rest-api.md)
