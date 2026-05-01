import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import { createReactAgent } from "@langchain/langgraph/prebuilt";
import { DynamicStructuredTool } from "@langchain/core/tools";
import { z } from "zod";
import fs from "fs/promises";
import path from "path";
import Docker from "dockerode";

const docker = new Docker();

/**
 * Creates the sandbox tools scoped to a specific projectId.
 * All file operations are relative to the sandbox/ directory inside the project.
 * All commands run inside the sandbox/ directory in the container.
 */
function createSandboxTools(projectId) {
  const sandboxRoot = path.resolve(`./projects/${projectId}/sandbox`);

  // The working directory inside the Docker container where the Vite project lives
  const CONTAINER_WORKDIR = "/home/sandbox/app/sandbox";

  const listFilesTool = new DynamicStructuredTool({
    name: "listFiles",
    description:
      "List files and directories at the given path inside the sandbox project. Use this to understand the project structure before making changes. Use '.' to list the project root.",
    schema: z.object({
      dirPath: z.string().describe("Relative directory path inside the sandbox project, e.g. '.' or 'src' or 'src/components'"),
    }),
    func: async ({ dirPath }) => {
      try {
        const absPath = path.join(sandboxRoot, dirPath);
        const entries = await fs.readdir(absPath, { withFileTypes: true });
        const result = entries.map((e) => {
          return `${e.isDirectory() ? "[DIR] " : "[FILE]"} ${e.name}`;
        });
        return result.join("\n") || "(empty directory)";
      } catch (err) {
        return `Error listing directory: ${err.message}`;
      }
    },
  });

  const readFileTool = new DynamicStructuredTool({
    name: "readFile",
    description:
      "Read the contents of a file inside the sandbox project. Use relative paths like 'src/App.jsx' or 'package.json'.",
    schema: z.object({
      filePath: z.string().describe("Relative path to the file inside the sandbox project, e.g. 'src/App.jsx'"),
    }),
    func: async ({ filePath }) => {
      try {
        const absPath = path.join(sandboxRoot, filePath);
        const content = await fs.readFile(absPath, "utf-8");
        return content;
      } catch (err) {
        return `Error reading file: ${err.message}`;
      }
    },
  });

  const writeFileTool = new DynamicStructuredTool({
    name: "writeFile",
    description:
      "Write content to a file inside the sandbox project. Creates the file and any parent directories if they don't exist. Use relative paths like 'src/components/Counter.jsx'. NEVER use absolute paths.",
    schema: z.object({
      filePath: z.string().describe("Relative path to the file inside the sandbox project, e.g. 'src/components/Counter.jsx'"),
      content: z.string().describe("The full content to write to the file"),
    }),
    func: async ({ filePath, content }) => {
      try {
        // Security: prevent path traversal
        const normalized = path.normalize(filePath);
        if (normalized.startsWith("..") || path.isAbsolute(normalized)) {
          return "Error: Path traversal not allowed. Use relative paths only.";
        }

        const absPath = path.join(sandboxRoot, normalized);
        await fs.mkdir(path.dirname(absPath), { recursive: true });
        await fs.writeFile(absPath, content, "utf-8");
        return `Successfully wrote to ${filePath}`;
      } catch (err) {
        return `Error writing file: ${err.message}`;
      }
    },
  });

  const deleteFileTool = new DynamicStructuredTool({
    name: "deleteFile",
    description:
      "Delete a file or folder inside the sandbox project. Use relative paths like 'src/old-component.jsx'.",
    schema: z.object({
      filePath: z.string().describe("Relative path to the file or folder to delete"),
    }),
    func: async ({ filePath }) => {
      try {
        const normalized = path.normalize(filePath);
        if (normalized.startsWith("..") || path.isAbsolute(normalized)) {
          return "Error: Path traversal not allowed. Use relative paths only.";
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
      } catch (err) {
        return `Error deleting: ${err.message}`;
      }
    },
  });

  const runCommandTool = new DynamicStructuredTool({
    name: "runCommand",
    description:
      `Execute a shell command inside the Docker sandbox container. The working directory is the sandbox project root (where package.json lives). Use this for: npm install, npm run build, node scripts, ls, cat, etc. Do NOT use 'cd sandbox' — you are already inside the sandbox directory.`,
    schema: z.object({
      command: z.string().describe("The shell command to execute, e.g. 'npm install express' or 'npm run build' or 'ls src/'"),
    }),
    func: async ({ command }) => {
      try {
        // Find the running container by projectId name
        const containers = await docker.listContainers({
          all: true,
          filters: JSON.stringify({ name: [`^/${projectId}$`] }),
        });

        if (containers.length === 0) {
          return "Error: No running container found for this project. The user needs to open the terminal first to spin up the container.";
        }

        const container = docker.getContainer(containers[0].Id);

        // Execute the command inside the container's sandbox directory
        const exec = await container.exec({
          Cmd: ["/bin/bash", "-c", command],
          AttachStdout: true,
          AttachStderr: true,
          WorkingDir: CONTAINER_WORKDIR,
          User: "sandbox",
        });

        const stream = await exec.start({ hijack: true });

        // Collect output
        return new Promise((resolve) => {
          let output = "";
          stream.on("data", (chunk) => {
            // Docker multiplexed stream: first 8 bytes are header
            const content = chunk.slice(8).toString("utf-8");
            output += content;
          });
          stream.on("end", () => {
            resolve(output.trim() || "(command completed with no output)");
          });
          // Safety timeout: 60 seconds
          setTimeout(() => {
            stream.destroy();
            resolve(output.trim() + "\n(command timed out after 60s)");
          }, 60000);
        });
      } catch (err) {
        return `Error executing command: ${err.message}`;
      }
    },
  });

  return [listFilesTool, readFileTool, writeFileTool, deleteFileTool, runCommandTool];
}

/**
 * Runs the LangGraph ReAct agent for a given goal.
 * Streams agent thoughts and tool calls to the frontend via socket.
 */
export async function runAgent(projectId, goal, emitLog) {
  const llm = new ChatGoogleGenerativeAI({
    model: "gemini-2.0-flash",
    apiKey: process.env.GEMINI_API_KEY,
    temperature: 0.2,
  });

  const tools = createSandboxTools(projectId);

  const agent = createReactAgent({
    llm,
    tools,
  });

  emitLog({ type: "status", message: "🧠 Agent initialized. Starting work..." });

  try {
    const result = await agent.invoke(
      {
        messages: [
          {
            role: "system",
            content: `You are CogniBox, an autonomous AI developer working inside a sandboxed coding environment.
You have access to a real file system and a real Docker container with a terminal.

PROJECT STRUCTURE:
This is a React + Vite project. The project root contains:
- package.json, vite.config.js, index.html — project configuration
- src/ — source code (App.jsx, main.jsx, App.css, index.css, etc.)
- src/components/ — React components (create this if needed)
- public/ — static assets (images, icons)
- node_modules/ — installed dependencies (do NOT modify)

CRITICAL RULES:
1. ALWAYS start by running "listFiles" on "." and "src" to understand the current project structure.
2. ALWAYS use "readFile" to understand existing code BEFORE modifying it.
3. Use RELATIVE paths only (e.g. "src/App.jsx", NOT "/home/sandbox/app/sandbox/src/App.jsx").
4. NEVER create new top-level project directories. Work within the existing structure (src/, public/).
5. When creating new components, put them in "src/components/" (create the directory if needed).
6. When you need to install packages, use "runCommand" with "npm install <package>".
7. The Vite dev server auto-reloads on file changes — you do NOT need to restart it after editing files.
8. To check for errors, use "runCommand" with "npm run build".
9. If you need to create new CSS files, put them in "src/".
10. Do NOT run "cd" commands — you are already in the correct directory.
11. Do NOT create files outside the project structure (no random folders).
12. Be thorough: read → plan → write → verify.`,
          },
          {
            role: "user",
            content: goal,
          },
        ],
      },
      {
        callbacks: [
          {
            handleLLMStart: (llm, prompts) => {
              emitLog({ type: "thinking", message: "🤔 Agent is thinking..." });
            },
            handleLLMEnd: (output) => {
              // Extract the text content from the LLM response
              const generations = output?.generations?.[0];
              if (generations && generations.length > 0) {
                const text = generations[0]?.text || generations[0]?.message?.content;
                if (text && typeof text === "string" && text.trim()) {
                  emitLog({ type: "thought", message: text.trim() });
                }
              }
            },
            handleToolStart: (tool, input) => {
              // Extract tool name from various possible LangChain metadata locations
              const toolName = tool?.name || tool?.id?.[tool?.id?.length - 1] || "Action";
              let inputStr;
              try {
                inputStr = typeof input === "string" ? input : JSON.stringify(input);
              } catch {
                inputStr = String(input);
              }
              emitLog({
                type: "tool_start",
                message: `🔧 Calling tool: ${toolName}`,
                detail: inputStr,
              });
            },
            handleToolEnd: (output) => {
              const text = typeof output === "string" ? output : String(output);
              // Truncate very long outputs for the frontend
              const truncated = text.length > 2000 ? text.substring(0, 2000) + "\n...(truncated)" : text;
              emitLog({
                type: "tool_result",
                message: truncated,
              });
            },
            handleChainError: (err) => {
              emitLog({ type: "error", message: `❌ Error: ${err.message}` });
            },
          },
        ],
      }
    );

    // Extract final response
    const lastMessage = result.messages[result.messages.length - 1];
    const finalText = typeof lastMessage.content === "string"
      ? lastMessage.content
      : JSON.stringify(lastMessage.content);

    emitLog({ type: "done", message: `✅ Agent finished:\n${finalText}` });

    return { success: true, response: finalText };
  } catch (err) {
    emitLog({ type: "error", message: `❌ Agent failed: ${err.message}` });
    return { success: false, error: err.message };
  }
}
