# Chapter 8 — Docker Container Management

This chapter explains how Docker containers are created, managed, and used as isolated sandbox environments.

---

## 8.1 Container Creation — `backend/src/containers/handleContainerCreate.js`

### `listContainer()` — Debug Utility

```javascript
import Docker from "dockerode";
const docker = new Docker();

export const listContainer = async () => {
  const containers = await docker.listContainers();
  console.log("Containers", containers);
  containers.forEach((containerInfo) => {
    console.log(containerInfo.Ports);
  });
};
```

This is a debug function that lists all running Docker containers and their port mappings. Not used in production flow, but useful for troubleshooting.

### `handleContainerCreate()` — Main Container Lifecycle

This function is called every time a user connects to the terminal WebSocket. It manages the full container lifecycle: check existing → remove → create → start.

```javascript
export const handleContainerCreate = async (
  projectId,
  terminalSocket,
  req,
  tcpSocket,
  head,
) => {
```

#### Step 1: Remove Existing Container

```javascript
  // Find any existing container with the same name (projectId)
  const existingContainer = await docker.listContainers({
    all: true,  // Include stopped containers
    filters: JSON.stringify({ name: [`^/${projectId}$`] }),
  });

  if (existingContainer.length > 0) {
    console.log("Container already exists, stopping and removing it");
    const container = docker.getContainer(existingContainer[0].Id);
    await container.remove({ force: true });  // Force-remove (even if running)
  }
```

**Why remove and recreate?** This ensures a clean state. Docker container names must be unique, and using the project UUID as the name provides a 1:1 mapping between projects and containers.

The `all: true` flag includes stopped containers in the search. The regex filter `^/${projectId}$` ensures an exact name match (Docker prefixes container names with `/`).

#### Step 2: Create New Container

```javascript
  const sandboxImageName = process.env.SANDBOX_IMAGE || "sandbox";
  
  const container = await docker.createContainer({
    Image: sandboxImageName,
    AttachStdin: true,      // Allow input to the container
    AttachStdout: true,     // Capture standard output
    AttachStderr: true,     // Capture standard error
    Cmd: ["/bin/bash"],     // Start a bash shell
    Tty: true,              // Allocate a pseudo-TTY (enables colored output, cursor control)
    name: projectId,        // Container name = project UUID
    User: "sandbox",        // Run as non-root user
    Volumes: {
      "/home/sandbox/app": {},  // Declare the mount point
    },
    ExposedPorts: {
      "5173/tcp": {},           // Expose Vite dev server port
    },
    Env: ["HOST=0.0.0.0"],      // Environment variable for the container
    HostConfig: {
      Binds: [
        // Mount the project directory from the HOST into the container
        `${process.env.HOST_PROJECT_PATH || process.cwd()}/projects/${projectId}:/home/sandbox/app`,
      ],
      PortBindings: {
        "5173/tcp": [
          {
            HostPort: "0",  // Docker assigns a random available port
          },
        ],
      },
    },
  });
```

#### Container Configuration Explained:

| Setting | Value | Purpose |
|---|---|---|
| `Image` | `sandbox` or custom | The base image (Ubuntu 20.04 + Node 22) |
| `Cmd` | `["/bin/bash"]` | Start a bash shell as the main process |
| `Tty: true` | Pseudo-terminal | Enables colored output, tab completion, etc. |
| `User` | `"sandbox"` | Non-root user for security |
| `Binds` | Host path → Container path | Mounts project files into the container |
| `HostPort: "0"` | Random port | Docker auto-assigns an available host port |

#### The Bind Mount

```
HOST_PROJECT_PATH/projects/<uuid>  →  /home/sandbox/app
```

This is the critical volume mount. It makes the project files on the host available inside the container at `/home/sandbox/app`. Because it's a bind mount (not a Docker volume), changes are bidirectional:
- Files written by the backend (or AI agent) appear inside the container
- Files written by the user's terminal commands appear on the host filesystem

**`HOST_PROJECT_PATH` is essential** because when the backend runs inside a Docker container itself (Docker-out-of-Docker), `process.cwd()` returns the path inside the backend container, not the host path. The host path must be provided via environment variable.

#### Step 3: Start the Container

```javascript
  await container.start();
  return container;
```

After creation, the container is started and returned to `terminalApp.js` which then attaches a terminal session to it.

### `getContainerPort()` — Port Discovery

```javascript
export async function getContainerPort(containerName) {
    const container = await docker.listContainers({
        filters: JSON.stringify({ name: [`^/${containerName}$`] })
    });

    if (container.length > 0) {
        const containerInfo = await docker.getContainer(container[0].Id).inspect();
        try {
            return containerInfo?.NetworkSettings?.Ports["5173/tcp"][0].HostPort;
        } catch(error) {
            console.log("port not present");
            return undefined;
        }
    }
}
```

This inspects a running container to find which host port was mapped to the container's port 5173. Since `HostPort: "0"` was specified during creation, Docker assigned a random port. This function looks it up.

**Used by:** The `getPort` socket event in `editorHandler.js`, which the `Browser` component calls to know where to point its iframe.

---

## 8.2 Sandbox Docker Image — `Dockerfile.sandbox`

```dockerfile
FROM ubuntu:20.04

# Create a non-root user
RUN useradd -ms /bin/bash sandbox

# Set initial working directory
WORKDIR /home/sandbox

# Update system packages
RUN apt update && apt upgrade -y

# Install essential tools
RUN apt install nano curl -y

# Install Node.js 22
RUN curl -fsSL https://deb.nodesource.com/setup_22.x | bash - && apt-get install -y nodejs

# Configure terminal prompt to show current directory
RUN echo "PS1='\w '" >> /home/sandbox/.bashrc

# Set final working directory
WORKDIR /home/sandbox/app
```

### Design Decisions:

1. **Ubuntu 20.04 base** — A full Linux distribution (not Alpine) to ensure maximum compatibility with npm packages that may require native compilation.

2. **Non-root `sandbox` user** — Created with `useradd -ms /bin/bash sandbox`. The `-m` flag creates a home directory, and `-s /bin/bash` sets bash as the default shell.

3. **Node.js 22** — Installed via NodeSource's official setup script, ensuring the latest LTS version.

4. **Custom PS1 prompt** — `PS1='\w '` shows just the current directory path (e.g., `~/app/sandbox `). This keeps the terminal prompt clean.

5. **Working directory** — Set to `/home/sandbox/app` which is where project files are mounted.

---

## 8.3 Docker-out-of-Docker (DooD) Pattern

```
┌──────────────────────────────────────────┐
│                HOST MACHINE               │
│                                           │
│  ┌────────────────────────────────────┐   │
│  │    Backend Container               │   │
│  │    /var/run/docker.sock ──────┐    │   │
│  │                               │    │   │
│  │    Dockerode API ─────────────┘    │   │
│  └────────────────────────────────────┘   │
│           │                               │
│           │ (creates via Docker socket)    │
│           ▼                               │
│  ┌────────────────────────────────────┐   │
│  │    Sandbox Container               │   │
│  │    /home/sandbox/app ←─────────────┼───┼── backend/projects/<uuid>/
│  │    (bind mount from host)          │   │
│  └────────────────────────────────────┘   │
└───────────────────────────────────────────┘
```

The backend container talks to the **host's Docker daemon** via the mounted Docker socket. Sandbox containers are created **on the host**, not inside the backend container. This is why `HOST_PROJECT_PATH` must be the **host's** absolute path — the bind mount is relative to the host filesystem, not the backend container's filesystem.

---

> **Next Chapter:** [Chapter 9 — Terminal System →](./chapter-09-terminal-system.md)
