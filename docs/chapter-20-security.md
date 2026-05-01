# Chapter 20 — Security, Scaling & Future Work

This final chapter covers security considerations, known limitations, and a roadmap of potential improvements.

---

## 20.1 Security Analysis

### 20.1.1 Container Isolation

| Aspect | Current State | Risk Level | Recommendation |
|---|---|---|---|
| Container user | `sandbox` (non-root) | ✅ Low | Good practice |
| Docker socket access | Backend has full access | ⚠️ High | Use a Docker API proxy like `tecnativa/docker-socket-proxy` |
| Network access | Containers have unrestricted network | ⚠️ Medium | Add `--network=none` or create a restricted network |
| Resource limits | No CPU/memory limits set | ⚠️ Medium | Add `MemoryLimit`, `NanoCpus` to container config |
| File system access | Bind mount from host | ⚠️ Medium | Use read-only mounts where possible |
| Privileged mode | Not used | ✅ Low | Good — never enable |

### 20.1.2 Path Traversal

The AI agent's `writeFile` and `deleteFile` tools validate paths:
```javascript
const normalized = path.normalize(filePath);
if (normalized.startsWith("..") || path.isAbsolute(normalized)) {
    return "Error: Path traversal not allowed.";
}
```

However, the **editor handler** (`editorHandler.js`) does **not** validate paths:
```javascript
socket.on("writeFile", async ({ data, pathToFileOrFolder }) => {
    await fs.writeFile(pathToFileOrFolder, data);  // No validation!
});
```

**Risk:** A malicious client could send a `writeFile` event with `pathToFileOrFolder` set to any path on the backend's filesystem (e.g., `/app/src/index.js`).

**Recommendation:** Add path validation to all editor socket events:
```javascript
if (!pathToFileOrFolder.startsWith(`./projects/${projectId}/`)) {
    return socket.emit("error", { data: "Invalid path" });
}
```

### 20.1.3 WebSocket Security

| Aspect | Current State | Recommendation |
|---|---|---|
| Authentication | None (CORS: `origin: "*"`) | Add JWT or session-based auth |
| Input validation | Minimal | Validate all incoming payloads with Zod |
| Rate limiting | None | Add rate limiting for socket events |
| Payload size | No limits | Set `maxHttpBufferSize` on Socket.IO |

### 20.1.4 API Security

| Aspect | Current State | Recommendation |
|---|---|---|
| Authentication | None | Add API key or JWT authentication |
| Rate limiting | None | Add express-rate-limit middleware |
| Input validation | Minimal (only checks `projectId` and `goal` exist) | Validate with Zod schemas |
| CORS | Wide open (`"*"`) | Restrict to known origins |

### 20.1.5 AI Agent Security

| Risk | Mitigation |
|---|---|
| Prompt injection | System prompt has strict rules, but no runtime enforcement |
| Command injection | `runCommand` executes arbitrary bash commands — inherent risk |
| API key exposure | `GEMINI_API_KEY` is in `.env`, not committed to git |
| Cost control | No usage limits on API calls; a recursive agent could make many calls |

---

## 20.2 Known Limitations

### 20.2.1 Single-User Design
- No user accounts or authentication
- No project ownership or sharing
- All projects exist on the same filesystem

### 20.2.2 No Conflict Resolution
- If two users edit the same file simultaneously, the last write wins
- No CRDT or OT (Operational Transform) for real-time collaboration
- The broadcast mechanism exists but lacks merge logic

### 20.2.3 Container Lifecycle
- Containers are recreated on every terminal connection (no persistence)
- `npm install` must be re-run each time the terminal reconnects
- No mechanism to save container state

### 20.2.4 Terminal Resize
- xterm.js uses `FitAddon` to adjust rows/columns
- But the container's PTY size is not updated to match
- Can cause display issues with full-screen programs (vim, htop)

### 20.2.5 File Tree Refresh
- The tree is fetched via a full API call each time
- No incremental updates (the entire tree is replaced)
- Can be slow for large projects

### 20.2.6 Browser Preview
- Uses `window.location.hostname` which may not work behind proxies
- Requires direct port access to the Docker container's mapped port
- In production behind a reverse proxy, additional port forwarding is needed

---

## 20.3 Scaling Considerations

### Current Capacity
- Single Node.js process handles all requests
- Each project spawns a Docker container (~50-100MB RAM per container)
- A typical server can handle ~20-50 concurrent sandboxes

### Scaling Path

```
              ┌──────────────────────────┐
              │     Load Balancer         │
              └──────────┬───────────────┘
                         │
           ┌─────────────┼─────────────┐
           ▼             ▼             ▼
    ┌──────────┐  ┌──────────┐  ┌──────────┐
    │ Worker 1 │  │ Worker 2 │  │ Worker 3 │
    │ (Backend)│  │ (Backend)│  │ (Backend)│
    └────┬─────┘  └────┬─────┘  └────┬─────┘
         │              │              │
    ┌────┴────┐    ┌────┴────┐    ┌────┴────┐
    │Sandboxes│    │Sandboxes│    │Sandboxes│
    └─────────┘    └─────────┘    └─────────┘
         │              │              │
         └──────────────┼──────────────┘
                        │
                 ┌──────┴──────┐
                 │ Shared File │
                 │   Storage   │
                 │  (NFS/EFS)  │
                 └─────────────┘
```

**Required Changes for Multi-Node:**
1. **Sticky sessions** for WebSocket connections
2. **Shared file storage** (NFS, AWS EFS) for project files
3. **Redis adapter** for Socket.IO to broadcast across nodes
4. **Container orchestration** (Kubernetes) for sandbox management
5. **Database** for project metadata and user accounts

---

## 20.4 Future Improvement Roadmap

### Phase 1: Core Improvements
- [ ] Add authentication (OAuth with GitHub/Google)
- [ ] Add path validation to editor socket events
- [ ] Container resource limits (CPU, memory, disk)
- [ ] Terminal PTY resize support
- [ ] Persist container state between reconnections

### Phase 2: Developer Experience
- [ ] Multi-file tab support in editor
- [ ] File search (Ctrl+P)
- [ ] Git integration (commit, push from UI)
- [ ] Multiple terminal tabs
- [ ] Keyboard shortcuts

### Phase 3: Collaboration
- [ ] User accounts and project ownership
- [ ] Project sharing via URLs
- [ ] Real-time collaborative editing (CRDT)
- [ ] Project templates (Next.js, Vue, Svelte)

### Phase 4: AI Agent Enhancements
- [ ] Multi-model support (GPT-4, Claude)
- [ ] Agent memory across sessions
- [ ] Approval workflow for agent file changes
- [ ] Cost tracking and usage limits
- [ ] Agent access to browser console logs

### Phase 5: Production Hardening
- [ ] Kubernetes deployment
- [ ] Database for project metadata
- [ ] S3/Object storage for project files
- [ ] CDN for static assets
- [ ] Monitoring and alerting (Prometheus, Grafana)
- [ ] Automated backups

---

## 20.5 Technology Alternatives

| Current | Alternative | Benefit |
|---|---|---|
| Docker containers | Firecracker microVMs | Better isolation, faster boot |
| File-based storage | PostgreSQL + S3 | Durability, querying |
| Socket.IO | WebSocket + protobuf | Lower overhead, smaller payloads |
| Chokidar polling | inotify (native) | Lower CPU usage (non-Docker only) |
| Gemini 2.0 Flash | GPT-4o / Claude Opus | Potentially better code generation |
| Nginx | Caddy | Automatic HTTPS, simpler config |
| Zustand | Jotai | Atomic state model |

---

## 20.6 Summary

The Code Sandbox Clone is a complete, production-capable web IDE that demonstrates:

1. **Full-stack JavaScript** — React frontend + Node.js backend
2. **Real-time communication** — Socket.IO + raw WebSocket
3. **Container orchestration** — Docker-out-of-Docker pattern
4. **AI integration** — LangGraph ReAct agent with tool use
5. **Modern deployment** — Multi-stage Docker builds + Nginx + Docker Compose

The codebase is well-structured following established patterns (Atomic Design, service layer, controller-route separation) and provides a solid foundation for building a commercial-grade code sandbox platform.

---

*End of documentation. For questions or contributions, refer to the individual chapter files in the `docs/` folder.*
