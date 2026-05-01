# Chapter 18 — Deployment & Docker Compose

This chapter covers the complete deployment infrastructure — Dockerfiles, Docker Compose configurations, Nginx reverse proxy, and the CI/CD push script.

---

## 18.1 Docker Images

The project builds **three Docker images:**

| Image | Dockerfile | Base | Purpose |
|---|---|---|---|
| **Backend** | `backend/Dockerfile` | `node:22-slim` | REST API + Socket.IO + Terminal server |
| **Frontend** (dev) | `frontend/Dockerfile` | `node:22-slim` | Vite dev server |
| **Frontend** (prod) | `frontend/Dockerfile.prod` | `node:22-slim` → `nginx:alpine` | Multi-stage: build → serve via Nginx |
| **Sandbox** | `backend/Dockerfile.sandbox` | `ubuntu:20.04` | Isolated runtime for user code |

### Backend Dockerfile

```dockerfile
FROM node:22-slim
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
EXPOSE 3000
EXPOSE 4000
CMD ["npm", "run", "dev"]
```

- Slim Node.js image (minimal Debian without unnecessary packages)
- Copies `package.json` first for Docker layer caching
- Exposes both the main server (3000) and terminal server (4000)
- Runs `nodemon` in dev mode for hot-reload

### Frontend Dev Dockerfile

```dockerfile
FROM node:22-slim
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
EXPOSE 5173
CMD ["npm", "run", "dev", "--", "--host"]
```

- `--host` flag makes Vite listen on `0.0.0.0` (accessible from outside the container)

### Frontend Production Dockerfile (Multi-Stage)

```dockerfile
# Stage 1: Build the React app
FROM node:22-slim AS build
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
RUN npm run build

# Stage 2: Serve with Nginx
FROM nginx:alpine
COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
```

**Multi-stage build benefits:**
- Build stage: ~1GB (Node.js + node_modules + build tools)
- Final image: ~25MB (just Nginx + static files)
- No source code or node_modules in production image

### Sandbox Dockerfile

See [Chapter 8](./chapter-08-docker-containers.md) for a detailed explanation.

---

## 18.2 Nginx Configuration — `frontend/nginx.conf`

```nginx
server {
    listen 80;
    server_name localhost;

    # Serve static files (React build output)
    location / {
        root /usr/share/nginx/html;
        index index.html index.htm;
        try_files $uri $uri/ /index.html;   # SPA fallback
    }

    # Proxy REST API requests to the backend container
    location /api {
        proxy_pass http://backend:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }

    # Proxy Socket.IO requests (editor WebSocket)
    location /socket.io {
        proxy_pass http://backend:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "Upgrade";
        proxy_set_header Host $host;
    }

    # Proxy terminal WebSocket requests
    location /terminal {
        proxy_pass http://backend:4000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "Upgrade";
        proxy_set_header Host $host;
    }
}
```

### Key Sections:

1. **`location /`** — Serves the compiled React app. `try_files $uri $uri/ /index.html` is the SPA fallback: any URL that doesn't match a static file returns `index.html`, letting React Router handle the routing.

2. **`location /api`** — Forwards API requests to the backend container. Uses Docker Compose's DNS (`backend` resolves to the backend container's IP).

3. **`location /socket.io`** — WebSocket upgrade for Socket.IO. The `Upgrade` and `Connection` headers are essential for WebSocket handshake.

4. **`location /terminal`** — WebSocket upgrade for terminal connections, proxied to port 4000.

**Why not just use `proxy_pass http://backend:3000` for everything?** Because the terminal server runs on a different port (4000). Nginx routes based on URL path.

---

## 18.3 Docker Compose — Development

**`docker-compose.yml`**

```yaml
version: '3.8'

services:
  backend:
    build:
      context: ./backend
      dockerfile: Dockerfile
    ports:
      - "3000:3000"    # REST API + Socket.IO
      - "4000:4000"    # Terminal WebSocket
    volumes:
      - ./backend:/app                            # Source code (hot reload)
      - /var/run/docker.sock:/var/run/docker.sock  # Docker socket access
      - ./backend/projects:/app/projects           # Persistent project data
    environment:
      - PORT=3000
      - HOST_PROJECT_PATH=${HOST_PROJECT_PATH:-$PWD/backend}
      - SANDBOX_IMAGE=sandbox
    networks:
      - sandbox-network
    depends_on:
      - sandbox

  frontend:
    build:
      context: ./frontend
      dockerfile: Dockerfile
    ports:
      - "5173:5173"
    volumes:
      - ./frontend:/app            # Source code (hot reload)
      - /app/node_modules          # Anonymous volume (prevents overwriting)
    environment:
      - VITE_API_URL=http://localhost:3000
      - VITE_TERMINAL_URL=ws://localhost:4000
    depends_on:
      - backend
    networks:
      - sandbox-network

  sandbox:
    build:
      context: ./backend
      dockerfile: Dockerfile.sandbox
    image: sandbox          # Tags the built image as "sandbox"
    command: ["true"]       # Exits immediately — just builds the image

networks:
  sandbox-network:
    driver: bridge
```

### Volume Mounts Explained:

| Mount | Purpose |
|---|---|
| `./backend:/app` | Hot-reload: source code changes reflect without rebuild |
| `/var/run/docker.sock:/var/run/docker.sock` | Docker-out-of-Docker: backend can create containers |
| `./backend/projects:/app/projects` | Persistent project files (survive container restarts) |
| `./frontend:/app` | Hot-reload for frontend source |
| `/app/node_modules` | Anonymous volume: prevents host `node_modules` from overwriting container's |

### The Sandbox Service Trick:

```yaml
sandbox:
    image: sandbox
    command: ["true"]   # Exit immediately
```

This service doesn't actually run. It just **builds the Docker image** and tags it as `sandbox`. The backend then uses this image when creating sandbox containers.

---

## 18.4 Docker Compose — Production

**`docker-compose.prod.yml`**

```yaml
services:
  backend:
    image: ${BACKEND_IMAGE:-codesandbox-backend}
    container_name: codesandbox-backend
    build:
      context: ./backend
      dockerfile: Dockerfile
    ports:
      - "3000:3000"
      - "4000:4000"
    volumes:
      - ./backend/projects:/app/projects
      - /var/run/docker.sock:/var/run/docker.sock
    environment:
      - PORT=3000
      - HOST_PROJECT_PATH=${HOST_PROJECT_PATH}
      - SANDBOX_IMAGE=${SANDBOX_IMAGE:-sandbox}
      - GEMINI_API_KEY=${GEMINI_API_KEY}
      - REACT_PROJECT_COMMAND=${REACT_PROJECT_COMMAND:-npx --yes create-vite@latest sandbox --template react}
    networks:
      - sandbox-network
    restart: always

  frontend:
    image: ${FRONTEND_IMAGE:-codesandbox-frontend}
    container_name: codesandbox-frontend
    build:
      context: ./frontend
      dockerfile: Dockerfile.prod          # Multi-stage build with Nginx
    ports:
      - "80:80"                            # Served on standard HTTP port
    depends_on:
      - backend
    networks:
      - sandbox-network
    restart: always

  sandbox:
    image: ${SANDBOX_IMAGE:-sandbox}
    container_name: codesandbox-sandbox
    build:
      context: ./backend
      dockerfile: Dockerfile.sandbox
    command: ["true"]

networks:
  sandbox-network:
    driver: bridge
```

### Differences from Development:

| Aspect | Dev | Production |
|---|---|---|
| Frontend Dockerfile | `Dockerfile` (Vite dev) | `Dockerfile.prod` (Nginx) |
| Frontend port | 5173 | 80 |
| Source volumes | Mounted (hot-reload) | Not mounted (built into image) |
| `restart` | Not set | `always` |
| `container_name` | Auto-generated | Explicit names |
| Image names | Build-local | Configurable via env vars |
| `GEMINI_API_KEY` | In backend/.env | Passed via environment |

---

## 18.5 Push Script — `push_images.sh`

```bash
#!/bin/bash

DOCKER_USER=${1:-"kishansingh1"}

echo "Building and pushing images for $DOCKER_USER..."

# 1. Sandbox
docker build -t $DOCKER_USER/codesandbox-sandbox:latest -f backend/Dockerfile.sandbox backend/
docker push $DOCKER_USER/codesandbox-sandbox:latest

# 2. Backend
docker build -t $DOCKER_USER/codesandbox-backend:latest ./backend
docker push $DOCKER_USER/codesandbox-backend:latest

# 3. Frontend (production)
docker build -t $DOCKER_USER/codesandbox-frontend:latest -f frontend/Dockerfile.prod ./frontend
docker push $DOCKER_USER/codesandbox-frontend:latest

echo "Done!"
```

**Usage:**
```bash
# Push with default username
./push_images.sh

# Push with custom username
./push_images.sh myusername
```

This builds all three images and pushes them to Docker Hub, enabling deployment on any server with `docker compose pull && docker compose up`.

---

## 18.6 Deployment Architecture

```
┌─────────────────────────────────────────────┐
│              AWS EC2 / VPS Host              │
│                                              │
│  ┌────────────────────────────────────────┐  │
│  │  Docker Compose Network               │  │
│  │                                        │  │
│  │  ┌────────────┐  ┌─────────────────┐  │  │
│  │  │  Nginx     │  │    Backend      │  │  │
│  │  │  :80 (pub) │──│  :3000 (int)    │  │  │
│  │  │            │  │  :4000 (int)    │  │  │
│  │  └────────────┘  └────────┬────────┘  │  │
│  │                           │            │  │
│  │                    Docker Socket        │  │
│  │                           │            │  │
│  │  ┌────────────┐  ┌───────┴────────┐   │  │
│  │  │  Sandbox   │  │  Sandbox       │   │  │
│  │  │  Container │  │  Container     │   │  │
│  │  │  (user A)  │  │  (user B)      │   │  │
│  │  └────────────┘  └────────────────┘   │  │
│  └────────────────────────────────────────┘  │
└──────────────────────────────────────────────┘
```

---

> **Next Chapter:** [Chapter 19 — End-to-End Data Flows →](./chapter-19-data-flow.md)
