# Chapter 7 — WebSocket & Realtime Editor

This chapter explains the Socket.IO-based editor handler — the core of the real-time file editing experience.

---

## 7.1 Editor Handler — `backend/src/socketHandlers/editorHandler.js`

This is the **nerve center** of the editor. Every file operation (read, write, create, delete) flows through this handler.

### Overview of Events

| Event (Client → Server) | Event (Server → Client) | Purpose |
|---|---|---|
| `writeFile` | `writeFileSuccess` | Save file contents |
| `readFile` | `readFileSuccess` | Read file contents |
| `createFile` | `createFileSuccess` | Create a new empty file |
| `createFolder` | `createFolderSuccess` | Create a new directory |
| `deleteFile` | `deleteFileSuccess` | Delete a file |
| `deleteFolder` | `deleteFolderSuccess` | Delete a directory |
| `getPort` | `getPortSuccess` | Get the sandbox container's mapped port |

---

### 7.1.1 `writeFile` — Saving Files

```javascript
socket.on("writeFile", async ({ data, pathToFileOrFolder }) => {
    try {
        const response = await fs.writeFile(pathToFileOrFolder, data);
        editorNamespace.emit("writeFileSuccess", {
            data: "File written successfully",
            path: pathToFileOrFolder,
        });
    } catch(error) {
        console.log("Error writing the file", error);
        socket.emit("error", {
            data: "Error writing the file",
        });
    }
});
```

**Flow:**
1. The Monaco Editor's `onChange` callback fires when the user types
2. A 2-second debounce timer starts (in the frontend `EditorComponent`)
3. After 2 seconds of inactivity, the frontend emits `writeFile` with the full file content and path
4. The backend writes the content to disk using `fs.writeFile`
5. On success, `writeFileSuccess` is broadcast to **all clients** in the namespace (via `editorNamespace.emit`)

**Note:** The success event is broadcast (not unicast) because multiple clients might be connected to the same project. This would allow collaborative editing (though no conflict resolution exists yet).

### 7.1.2 `readFile` — Opening Files

```javascript
socket.on("readFile", async ({ pathToFileOrFolder }) => {
    try {
        const response = await fs.readFile(pathToFileOrFolder);
        socket.emit("readFileSuccess", {
            value: response.toString(),
            path: pathToFileOrFolder,
        });
    } catch(error) {
        console.log("Error reading the file", error);
        socket.emit("error", {
            data: "Error reading the file",
        });
    }
});
```

**Flow:**
1. The user double-clicks a file in the tree view (`TreeNode` component)
2. Frontend emits `readFile` with the file's path
3. Backend reads the file from disk
4. Backend emits `readFileSuccess` **only to the requesting client** (`socket.emit`, not `editorNamespace.emit`)
5. Frontend receives the file content and the `editorSocketStore` updates `activeFileTab`
6. The `EditorComponent` re-renders with the new file content

### 7.1.3 `createFile` — New File

```javascript
socket.on("createFile", async ({ pathToFileOrFolder }) => {
    try {
        // Check if file already exists
        try {
            await fs.stat(pathToFileOrFolder);
            socket.emit("error", { data: "File already exists" });
            return;
        } catch (e) {
            // File doesn't exist — this is expected, continue
        }

        // Create parent directories if needed
        const parentDir = path.dirname(pathToFileOrFolder);
        await fs.mkdir(parentDir, { recursive: true });

        // Create an empty file
        await fs.writeFile(pathToFileOrFolder, "");
        
        socket.emit("createFileSuccess", {
            data: "File created successfully",
        });
    } catch(error) {
        console.log("Error creating the file", error);
        socket.emit("error", { data: "Error creating the file" });
    }
});
```

**Safety Check:** Before creating, it checks if the file already exists using `fs.stat`. If it does, it returns an error. This prevents accidentally overwriting files.

**Parent Directory Creation:** `fs.mkdir(parentDir, { recursive: true })` ensures that creating `src/components/deep/nested/File.jsx` works even if `components/deep/nested/` doesn't exist yet.

### 7.1.4 `createFolder` — New Directory

```javascript
socket.on("createFolder", async ({ pathToFileOrFolder }) => {
    try {
        await fs.mkdir(pathToFileOrFolder, { recursive: true });
        socket.emit("createFolderSuccess", {
            data: "Folder created successfully",
        });
    } catch(error) {
        console.log("Error creating the folder", error);
        socket.emit("error", { data: "Error creating the folder" });
    }
});
```

Uses `{ recursive: true }` so nested folder creation works (e.g., creating `src/components/ui` when `components` doesn't exist).

### 7.1.5 `deleteFile` — Remove a File

```javascript
socket.on("deleteFile", async ({ pathToFileOrFolder }) => {
    try {
        await fs.unlink(pathToFileOrFolder);
        socket.emit("deleteFileSuccess", {
            data: "File deleted successfully",
        });
    } catch(error) {
        console.log("Error deleting the file", error);
        socket.emit("error", { data: "Error deleting the file" });
    }
});
```

Uses `fs.unlink` which removes a single file.

### 7.1.6 `deleteFolder` — Remove a Directory

```javascript
socket.on("deleteFolder", async ({ pathToFileOrFolder }) => {
    try {
        await fs.rm(pathToFileOrFolder, { recursive: true, force: true });
        socket.emit("deleteFolderSuccess", {
            data: "Folder deleted successfully",
        });
    } catch(error) {
        console.log("Error deleting the folder", error);
        socket.emit("error", { data: "Error deleting the folder" });
    }
});
```

Uses `fs.rm` with `{ recursive: true, force: true }` to delete directories and all their contents. The `force: true` flag prevents errors if the folder doesn't exist.

### 7.1.7 `getPort` — Container Port Discovery

```javascript
socket.on("getPort", async ({ containerName }) => {
    const port = await getContainerPort(containerName);
    console.log("port data", port);
    socket.emit("getPortSuccess", {
        port: port,
    });
});
```

This queries Docker to find the host port mapped to the sandbox container's internal port 5173. The `Browser` component uses this to know which URL to load in the iframe.

---

## 7.2 File Change Broadcasting (Chokidar)

In `index.js`, a Chokidar watcher is created for each connected client:

```javascript
watcher.on("all", (event, path) => {
    editorNamespace.emit("fileChanged", {
        event: event,
        path: path,
        projectId: projectId
    });
});
```

This broadcasts **all file system events** to every connected client. Events include:
- `"add"` — A new file was created
- `"change"` — A file was modified
- `"unlink"` — A file was deleted
- `"addDir"` — A new directory was created
- `"unlinkDir"` — A directory was deleted

The frontend uses this to:
1. **Auto-refresh the browser iframe** when files change (in `Browser.jsx`)
2. **Refresh the file tree** after file operations (in `editorSocketStore.js`)

---

## 7.3 Event Flow Diagram

```
User types in editor
        │
        ▼ (2s debounce)
Frontend: editorSocket.emit("writeFile", {data, path})
        │
        ▼
Backend: fs.writeFile(path, data)
        │
        ├──▶ editorNamespace.emit("writeFileSuccess") → All clients
        │
        ▼
Chokidar detects file change
        │
        ▼
Backend: editorNamespace.emit("fileChanged", {event, path})
        │
        ├──▶ Browser.jsx: auto-refreshes iframe
        └──▶ editorSocketStore.js: could refresh tree
```

---

## 7.4 Socket.IO vs Raw WebSocket

| Feature | Socket.IO (Editor) | Raw WebSocket (Terminal) |
|---|---|---|
| **Library** | `socket.io` | `ws` |
| **Port** | 3000 | 4000 |
| **Namespace** | `/editor` | N/A |
| **Events** | Named events (`readFile`, `writeFile`) | Binary data stream |
| **Reconnection** | Auto-reconnect built-in | Manual |
| **Consumer** | Monaco Editor, File Tree, Agent Panel | xterm.js AttachAddon |

---

> **Next Chapter:** [Chapter 8 — Docker Container Management →](./chapter-08-docker-containers.md)
