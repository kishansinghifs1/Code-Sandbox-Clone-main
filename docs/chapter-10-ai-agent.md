# Chapter 10 — AI Agent (CogniBox)

This chapter explains the LangGraph-based autonomous AI developer agent — the most sophisticated piece of the entire system.

---

## 10.1 Architecture Overview

```
User enters goal: "Add a dark mode toggle"
        │
        ▼
POST /api/v1/agent { projectId, goal }
        │
        ▼
agentController.js
  ├── Responds immediately: "Agent started"
  └── Runs agent in background
        │
        ▼
langgraphAgent.js
  ├── Creates LLM (Gemini 2.0 Flash)
  ├── Creates sandbox tools (scoped to projectId)
  ├── Creates ReAct agent (LangGraph)
  └── Invokes agent with system prompt + user goal
        │
        ▼ (agentic loop)
  ┌──────────────────────────────────┐
  │  Agent THINKS: "I need to..."    │──→ emitLog({type: "thought"})
  │  Agent ACTS: calls listFiles     │──→ emitLog({type: "tool_start"})
  │  Tool RETURNS: "[DIR] src..."    │──→ emitLog({type: "tool_result"})
  │  Agent THINKS: "Now I'll..."     │──→ emitLog({type: "thought"})
  │  Agent ACTS: calls readFile      │──→ emitLog({type: "tool_start"})
  │  ...repeats until done...        │
  └──────────────────────────────────┘
        │
        ▼
  emitLog({type: "done", message: "✅ Agent finished"})
```

---

## 10.2 The LangGraph Agent — `backend/src/service/langgraphAgent.js`

### 10.2.1 Imports & Setup

```javascript
import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import { createReactAgent } from "@langchain/langgraph/prebuilt";
import { DynamicStructuredTool } from "@langchain/core/tools";
import { z } from "zod";
import fs from "fs/promises";
import path from "path";
import Docker from "dockerode";

const docker = new Docker();
```

- **`ChatGoogleGenerativeAI`** — LangChain wrapper for Google's Gemini models
- **`createReactAgent`** — A prebuilt LangGraph agent that implements the ReAct (Reason + Act) pattern
- **`DynamicStructuredTool`** — Defines tools with Zod schemas for structured input validation
- **`z` (Zod)** — Schema validation library used by LangChain for tool input definitions

### 10.2.2 Sandbox Tools

The agent has **5 tools**, all scoped to a specific project's `sandbox/` directory:

```javascript
function createSandboxTools(projectId) {
  const sandboxRoot = path.resolve(`./projects/${projectId}/sandbox`);
  const CONTAINER_WORKDIR = "/home/sandbox/app/sandbox";
  // ... tool definitions ...
}
```

#### Tool 1: `listFiles`

```javascript
const listFilesTool = new DynamicStructuredTool({
    name: "listFiles",
    description: "List files and directories at the given path inside the sandbox project.",
    schema: z.object({
        dirPath: z.string().describe("Relative directory path, e.g. '.' or 'src'"),
    }),
    func: async ({ dirPath }) => {
        const absPath = path.join(sandboxRoot, dirPath);
        const entries = await fs.readdir(absPath, { withFileTypes: true });
        const result = entries.map((e) => {
            return `${e.isDirectory() ? "[DIR] " : "[FILE]"} ${e.name}`;
        });
        return result.join("\n") || "(empty directory)";
    },
});
```

**Example output:**
```
[DIR]  src
[DIR]  public
[DIR]  node_modules
[FILE] package.json
[FILE] vite.config.js
[FILE] index.html
```

#### Tool 2: `readFile`

```javascript
const readFileTool = new DynamicStructuredTool({
    name: "readFile",
    description: "Read the contents of a file inside the sandbox project.",
    schema: z.object({
        filePath: z.string().describe("Relative path, e.g. 'src/App.jsx'"),
    }),
    func: async ({ filePath }) => {
        const absPath = path.join(sandboxRoot, filePath);
        const content = await fs.readFile(absPath, "utf-8");
        return content;
    },
});
```

Returns the full file content as a string. The agent uses this to understand existing code before making modifications.

#### Tool 3: `writeFile`

```javascript
const writeFileTool = new DynamicStructuredTool({
    name: "writeFile",
    description: "Write content to a file. Creates parent directories if needed.",
    schema: z.object({
        filePath: z.string().describe("Relative path, e.g. 'src/components/Counter.jsx'"),
        content: z.string().describe("The full content to write to the file"),
    }),
    func: async ({ filePath, content }) => {
        // Security: prevent path traversal attacks
        const normalized = path.normalize(filePath);
        if (normalized.startsWith("..") || path.isAbsolute(normalized)) {
            return "Error: Path traversal not allowed. Use relative paths only.";
        }
        
        const absPath = path.join(sandboxRoot, normalized);
        await fs.mkdir(path.dirname(absPath), { recursive: true });
        await fs.writeFile(absPath, content, "utf-8");
        return `Successfully wrote to ${filePath}`;
    },
});
```

**Security:** The tool normalizes the path and checks for `..` traversal or absolute paths. This prevents the agent from writing files outside the sandbox directory.

#### Tool 4: `deleteFile`

```javascript
const deleteFileTool = new DynamicStructuredTool({
    name: "deleteFile",
    description: "Delete a file or folder inside the sandbox project.",
    schema: z.object({
        filePath: z.string().describe("Relative path to the file or folder"),
    }),
    func: async ({ filePath }) => {
        const normalized = path.normalize(filePath);
        if (normalized.startsWith("..") || path.isAbsolute(normalized)) {
            return "Error: Path traversal not allowed.";
        }
        
        const absPath = path.join(sandboxRoot, normalized);
        const stat = await fs.stat(absPath);
        if (stat.isDirectory()) {
            await fs.rm(absPath, { recursive: true, force: true });
            return `Successfully deleted directory ${filePath}`;
        } else {
            await fs.unlink(absPath);
            return `Successfully deleted file ${filePath}`;
        }
    },
});
```

Handles both files and directories. Checks `fs.stat` to determine the type.

#### Tool 5: `runCommand`

```javascript
const runCommandTool = new DynamicStructuredTool({
    name: "runCommand",
    description: "Execute a shell command inside the Docker sandbox container.",
    schema: z.object({
        command: z.string().describe("Shell command, e.g. 'npm install express'"),
    }),
    func: async ({ command }) => {
        // Find the running container by projectId
        const containers = await docker.listContainers({
            all: true,
            filters: JSON.stringify({ name: [`^/${projectId}$`] }),
        });

        if (containers.length === 0) {
            return "Error: No running container found.";
        }

        const container = docker.getContainer(containers[0].Id);

        // Execute command inside the container
        const exec = await container.exec({
            Cmd: ["/bin/bash", "-c", command],
            AttachStdout: true,
            AttachStderr: true,
            WorkingDir: CONTAINER_WORKDIR,  // /home/sandbox/app/sandbox
            User: "sandbox",
        });

        const stream = await exec.start({ hijack: true });

        // Collect output with 60-second timeout
        return new Promise((resolve) => {
            let output = "";
            stream.on("data", (chunk) => {
                const content = chunk.slice(8).toString("utf-8"); // Skip 8-byte Docker header
                output += content;
            });
            stream.on("end", () => {
                resolve(output.trim() || "(command completed with no output)");
            });
            setTimeout(() => {
                stream.destroy();
                resolve(output.trim() + "\n(command timed out after 60s)");
            }, 60000);
        });
    },
});
```

**Key Details:**
- Commands run inside the **same Docker container** that the user's terminal is connected to
- Working directory is the sandbox project root (`/home/sandbox/app/sandbox`)
- 60-second timeout prevents infinite-running commands from blocking the agent
- Docker stream headers (8 bytes) are stripped from the output

---

## 10.3 The ReAct Agent

```javascript
export async function runAgent(projectId, goal, emitLog) {
  const llm = new ChatGoogleGenerativeAI({
    model: "gemini-2.0-flash",
    apiKey: process.env.GEMINI_API_KEY,
    temperature: 0.2,  // Low temperature for deterministic coding
  });

  const tools = createSandboxTools(projectId);

  const agent = createReactAgent({
    llm,
    tools,
  });
```

### System Prompt

The agent receives a comprehensive system prompt that tells it:

1. **Who it is:** "You are CogniBox, an autonomous AI developer"
2. **The project structure:** React + Vite with specific folders
3. **12 critical rules:**
   - Always list files first to understand the project
   - Always read existing code before modifying
   - Use relative paths only
   - Don't create random directories
   - Put components in `src/components/`
   - Use `npm install` for packages
   - Don't restart Vite (it auto-reloads)
   - Check for errors with `npm run build`
   - Don't run `cd` commands
   - Be thorough: read → plan → write → verify

### Callback System

The agent uses LangChain's callback system to stream its internal state to the frontend:

```javascript
callbacks: [
    {
        handleLLMStart: (llm, prompts) => {
            emitLog({ type: "thinking", message: "🤔 Agent is thinking..." });
        },
        handleLLMEnd: (output) => {
            const text = output?.generations?.[0]?.[0]?.text;
            if (text) {
                emitLog({ type: "thought", message: text.trim() });
            }
        },
        handleToolStart: (tool, input) => {
            const toolName = tool?.name || "Action";
            emitLog({
                type: "tool_start",
                message: `🔧 Calling tool: ${toolName}`,
                detail: JSON.stringify(input),
            });
        },
        handleToolEnd: (output) => {
            const text = typeof output === "string" ? output : String(output);
            // Truncate long outputs for the frontend
            const truncated = text.length > 2000 
                ? text.substring(0, 2000) + "\n...(truncated)" 
                : text;
            emitLog({ type: "tool_result", message: truncated });
        },
        handleChainError: (err) => {
            emitLog({ type: "error", message: `❌ Error: ${err.message}` });
        },
    },
],
```

### Log Types

| Type | Icon | Color | When Emitted |
|---|---|---|---|
| `status` | ⚡ | Orange | Agent initialized, status updates |
| `thinking` | 🤔 | Cyan | LLM starts generating |
| `thought` | 💭 | White | LLM's reasoning text |
| `tool_start` | 🔧 | Green | Agent calls a tool |
| `tool_result` | 📋 | Purple | Tool returns its result |
| `done` | ✅ | Green | Agent finished successfully |
| `error` | ❌ | Red | Something went wrong |

---

## 10.4 Example Agent Execution

**Goal:** "Add a counter component with increment and decrement buttons"

```
⚡ Agent initialized. Starting work...
🤔 Agent is thinking...
💭 I need to understand the current project structure first. Let me list the files.
🔧 Calling tool: listFiles
   Input: {"dirPath":"."}
📋 [DIR]  src
   [DIR]  public
   [FILE] package.json
   [FILE] vite.config.js
   [FILE] index.html

🤔 Agent is thinking...
💭 Now let me look at the src directory and the current App.jsx.
🔧 Calling tool: listFiles
   Input: {"dirPath":"src"}
📋 [FILE] App.jsx
   [FILE] App.css
   [FILE] main.jsx
   [FILE] index.css

🔧 Calling tool: readFile
   Input: {"filePath":"src/App.jsx"}
📋 import './App.css'
   function App() { return <h1>Hello Vite</h1> }
   export default App

🤔 Agent is thinking...
💭 I'll create a Counter component and update App.jsx to use it.
🔧 Calling tool: writeFile
   Input: {"filePath":"src/components/Counter.jsx","content":"..."}
📋 Successfully wrote to src/components/Counter.jsx

🔧 Calling tool: writeFile
   Input: {"filePath":"src/App.jsx","content":"..."}
📋 Successfully wrote to src/App.jsx

🔧 Calling tool: runCommand
   Input: {"command":"npm run build"}
📋 vite v7.2.4 building for production...
   ✓ 24 modules transformed.
   dist/index.html       0.45 kB
   dist/assets/index.js  2.15 kB

✅ Agent finished:
   I've created a Counter component with increment and decrement buttons...
```

---

## 10.5 Security Considerations

1. **Path Traversal Protection:** `writeFile` and `deleteFile` normalize paths and reject `..` or absolute paths
2. **Non-root Execution:** Commands run as the `sandbox` user, not root
3. **Timeout:** 60-second limit prevents infinite loops
4. **Sandbox Isolation:** All operations happen inside a Docker container
5. **No Network Access Restrictions (yet):** The sandbox container has full network access — a production deployment should add network policies

---

> **Next Chapter:** [Chapter 11 — Frontend Entry & Routing →](./chapter-11-frontend-entry.md)
