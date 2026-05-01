import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import { createReactAgent } from "@langchain/langgraph/prebuilt";
import { DynamicStructuredTool } from "@langchain/core/tools";
import { z } from "zod";
import fs from "fs/promises";
import path from "path";
import Docker from "dockerode";

const docker = new Docker();

/**
 * Creates the 3 sandbox tools scoped to a specific projectId.
 */
function createSandboxTools(projectId) {
  const sandboxRoot = path.resolve(`./projects/${projectId}/sandbox`);

  const readFileTool = new DynamicStructuredTool({
    name: "readFile",
    description:
      "Read the contents of a file inside the sandbox project. Use relative paths like 'src/App.jsx' or 'package.json'.",
    schema: z.object({
      filePath: z.string().describe("Relative path to the file inside the sandbox project"),
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
      "Write content to a file inside the sandbox project. Creates the file if it doesn't exist. Creates parent directories automatically. Use relative paths like 'src/components/Counter.jsx'.",
    schema: z.object({
      filePath: z.string().describe("Relative path to the file inside the sandbox project"),
      content: z.string().describe("The full content to write to the file"),
    }),
    func: async ({ filePath, content }) => {
      try {
        const absPath = path.join(sandboxRoot, filePath);
        await fs.mkdir(path.dirname(absPath), { recursive: true });
        await fs.writeFile(absPath, content, "utf-8");
        return `Successfully wrote to ${filePath}`;
      } catch (err) {
        return `Error writing file: ${err.message}`;
      }
    },
  });

  const runCommandTool = new DynamicStructuredTool({
    name: "runCommand",
    description:
      "Execute a shell command inside the Docker sandbox container for this project. Use this for installing packages (npm install), running scripts (node index.js), or checking files (ls, cat). The working directory is /home/sandbox/app (the project root).",
    schema: z.object({
      command: z.string().describe("The shell command to execute, e.g. 'npm install express' or 'node index.js'"),
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

        // Execute the command inside the container
        const exec = await container.exec({
          Cmd: ["/bin/bash", "-c", command],
          AttachStdout: true,
          AttachStderr: true,
          WorkingDir: "/home/sandbox/app",
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
          // Safety timeout: 30 seconds
          setTimeout(() => {
            stream.destroy();
            resolve(output.trim() + "\n(command timed out after 30s)");
          }, 30000);
        });
      } catch (err) {
        return `Error executing command: ${err.message}`;
      }
    },
  });

  return [readFileTool, writeFileTool, runCommandTool];
}

/**
 * Runs the LangGraph ReAct agent for a given goal.
 * Streams agent thoughts and tool calls to the frontend via socket.
 */
export async function runAgent(projectId, goal, emitLog) {
  const llm = new ChatGoogleGenerativeAI({
    model: "gemini-2.5-flash",
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
You have access to a real file system and a real terminal inside a Docker container.
The project is a React + Vite app. 

IMPORTANT STRUCTURE:
- The source code is in the 'src/' directory (App.jsx, main.jsx, etc.).
- Static assets are in 'public/'.
- Configuration files like 'package.json', 'vite.config.js', and 'index.html' are in the root.
- The app runs on port 5173.

RULES:
- Always think step-by-step before acting.
- Use readFile to understand existing code before modifying it.
- Use writeFile to create or update files.
- Use runCommand to install packages or run/test code.
- If you need to see the result of a React change, you don't necessarily need to run a command, as Vite HMR will handle it, but you can check for lint errors or build errors with 'npm run build'.
- Be thorough but concise in your responses.`,
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
