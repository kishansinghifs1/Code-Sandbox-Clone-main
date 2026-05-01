import uuid4 from "uuid4";
import fs from "fs/promises";
import { REACT_PROJECT_COMMAND } from "../config/serverConfig.js";
import { execPromisified } from "../utils/execUtility.js";
import path from "path";
import directoryTree from "directory-tree";

const VITE_CONFIG_TEMPLATE = `import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    host: '0.0.0.0',
    port: process.env.VITE_PORT || 5173,
    watch: {
      usePolling: true,
      interval: 1000,
    },
    hmr: {
      host: 'localhost',
      port: process.env.VITE_PORT || 5173,
      protocol: 'ws',
    }
  }
})
`;

export const createProjectService = async () => {
  // Create a unique id and then inside the projects folder create a new folder with that id
  const projectId = uuid4();
  console.log("New project id is", projectId);

  await fs.mkdir(`./projects/${projectId}`, { recursive: true });

  // After this call the npm creaste vite command in the newly created project folder

  const response = await execPromisified(REACT_PROJECT_COMMAND, {
    cwd: `./projects/${projectId}`,
  });

  // Override the vite.config.js with Docker-optimized config
  const viteConfigPath = path.join(`./projects/${projectId}/sandbox`, 'vite.config.js');
  await fs.writeFile(viteConfigPath, VITE_CONFIG_TEMPLATE);
  console.log("Updated vite.config.js with Docker-optimized settings");

  // Fix permissions so the sandbox user (non-root) can write to this directory
  await execPromisified(`chmod -R 777 ./projects/${projectId}`);
  console.log("Fixed permissions for sandbox user");

  return projectId;
};

export const getProjectTreeService = async (projectId) => {
  const projectPath = path.resolve(`./projects/${projectId}`);
  const tree = directoryTree(projectPath);
  return tree;
};
