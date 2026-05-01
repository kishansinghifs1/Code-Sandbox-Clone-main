# Chapter 12 — State Management (Zustand Stores)

This chapter explains every Zustand store in the application. Zustand is a lightweight state management library that uses hooks. Unlike Redux, there's no boilerplate — just functions and state.

---

## 12.1 Why Zustand?

Zustand was chosen because:
- **Minimal API:** Define state and actions in a single `create()` call
- **No providers needed:** Stores are accessible anywhere via hooks
- **Cross-component access:** `useStore.getState()` works outside React components
- **Small bundle size:** ~1KB vs Redux's ~7KB

---

## 12.2 Store Dependency Map

```
                    ┌─────────────────────┐
                    │   editorSocketStore  │ ← Central hub
                    └──────┬──────────────┘
                           │ reads from:
              ┌────────────┼──────────────┐
              ▼            ▼              ▼
   ┌──────────────┐ ┌────────────┐ ┌──────────┐
   │activeFileTab │ │treeStructure│ │ portStore │
   │   Store      │ │   Store    │ │          │
   └──────────────┘ └────────────┘ └──────────┘

   ┌───────────────┐  ┌──────────────────┐  ┌────────────┐
   │terminalSocket │  │fileContextMenu   │  │ agentStore │
   │   Store       │  │   Store          │  │            │
   └───────────────┘  └──────────────────┘  └────────────┘
```

---

## 12.3 Each Store Explained

### 12.3.1 `editorSocketStore.js` — Editor WebSocket Hub

```javascript
import { create } from "zustand";
import { useActiveFileTabStore } from "./activeFileTabStore";
import { useTreeStructureStore } from "./treeStructureStore";
import { usePortStore } from "./portStore";

export const useEditorSocketStore = create((set) => ({
    editorSocket: null,
    setEditorSocket: (incomingSocket) => {
        // Get setter functions from other stores
        const activeFileTabSetter = useActiveFileTabStore.getState().setActiveFileTab;
        const projectTreeStructureSetter = useTreeStructureStore.getState().setTreeStructure;
        const portSetter = usePortStore.getState().setPort;

        // Wire up event listeners on the socket
        incomingSocket?.on("readFileSuccess", (data) => {
            const fileExtension = data.path.split('.').pop();
            activeFileTabSetter(data.path, data.value, fileExtension);
        });

        incomingSocket?.on("writeFileSuccess", (data) => {
            // Currently a no-op, but could refresh the editor
        });

        incomingSocket?.on("deleteFileSuccess", () => {
            projectTreeStructureSetter();  // Refresh file tree
        });

        incomingSocket?.on("deleteFolderSuccess", () => {
            projectTreeStructureSetter();  // Refresh file tree
        });

        incomingSocket?.on("createFileSuccess", () => {
            projectTreeStructureSetter();  // Refresh file tree
        });

        incomingSocket?.on("createFolderSuccess", () => {
            projectTreeStructureSetter();  // Refresh file tree
        });

        incomingSocket?.on("getPortSuccess", ({ port }) => {
            portSetter(port);  // Store the container's mapped port
        });

        set({ editorSocket: incomingSocket });
    }
}));
```

**This is the most important store.** It:
1. Holds the Socket.IO connection instance
2. Sets up all event listeners when the socket is created
3. Cross-updates other stores when events arrive

**Pattern: `useStore.getState()`** — This is Zustand's escape hatch for accessing store state outside of React hooks. Since `setEditorSocket` runs during initialization (not inside a render), we can't use hooks. `getState()` gives synchronous access.

### 12.3.2 `activeFileTabStore.js` — Currently Open File

```javascript
import { create } from 'zustand';

export const useActiveFileTabStore = create((set) => {
    return {
        activeFileTab: null,
        setActiveFileTab: (path, value, extension) => {
            set({
                activeFileTab: {
                    path: path,       // e.g., "/app/projects/abc/sandbox/src/App.jsx"
                    value: value,     // File content as string
                    extension: extension  // e.g., "jsx"
                }
            });
        }
    }
});
```

**State Shape:**
```javascript
{
    activeFileTab: {
        path: "/app/projects/abc/sandbox/src/App.jsx",
        value: "import './App.css'\n\nfunction App() { ... }",
        extension: "jsx"
    }
}
```

When a file is opened (double-click in tree → `readFile` → `readFileSuccess`), this store updates, causing the Monaco Editor to re-render with the new file's content.

### 12.3.3 `treeStructureStore.js` — File Explorer Data

```javascript
import { getProjectTree } from '../apis/projects';
import { create } from 'zustand';
import { QueryClient } from '@tanstack/react-query';

export const useTreeStructureStore = create((set, get) => {
    const queryClient = new QueryClient();

    return {
        projectId: null,
        treeStructure: null,
        setTreeStructure: async () => {
            const id = get().projectId;
            const data = await queryClient.fetchQuery({
                queryKey: [`projecttree-${id}`],
                queryFn: () => getProjectTree({ projectId: id }),
            });
            set({ treeStructure: data });
        },
        setProjectId: (projectId) => {
            set({ projectId: projectId });
        }
    }
});
```

**Key Design:** Uses React Query's `queryClient.fetchQuery` for data fetching, but stores the result in Zustand. This gives us:
- Zustand's synchronous access for the tree data
- React Query's caching and deduplication for the API calls

**`setTreeStructure()`** is called:
- On initial page load (in `TreeStructure.jsx`)
- After any file/folder create or delete operation

### 12.3.4 `terminalSocketStore.js` — Terminal WebSocket

```javascript
import { create } from "zustand";

export const useTerminalSocketStore = create((set) => {
    return {
        terminalSocket: null,
        setTerminalSocket: (incomingSocket) => {
            set({ terminalSocket: incomingSocket });
        }
    }
});
```

Simple store that holds the raw WebSocket instance for the terminal. Created in `ProjectPlayground.jsx` when the page loads.

### 12.3.5 `portStore.js` — Container Port

```javascript
import { create } from "zustand";

export const usePortStore = create((set) => {
    return {
        port: null,
        setPort: (port) => {
            set({ port });
        }
    }
});
```

Stores the dynamically-assigned host port of the sandbox container. When the `Browser` component needs to render the iframe, it reads this port to construct the URL.

### 12.3.6 `agentStore.js` — AI Agent State

```javascript
import { create } from 'zustand';

export const useAgentStore = create((set) => ({
    logs: [],
    isRunning: false,
    addLog: (log) => set((state) => ({ logs: [...state.logs, log] })),
    setLogs: (logs) => set({ logs }),
    setIsRunning: (isRunning) => set({ isRunning }),
    clearLogs: () => set({ logs: [] }),
}));
```

**State Shape:**
```javascript
{
    logs: [
        { type: "status", message: "🧠 Agent initialized...", timestamp: 1714680000 },
        { type: "thinking", message: "🤔 Agent is thinking...", timestamp: 1714680001 },
        { type: "tool_start", message: "🔧 Calling tool: listFiles", detail: '{"dirPath":"."}', timestamp: 1714680002 },
        // ...
    ],
    isRunning: true
}
```

The `addLog` action appends to the array immutably (creating a new array each time). The `AgentPanel` subscribes to `logs` and re-renders whenever a new log arrives.

### 12.3.7 `fileContextMenuStore.js` — Right-Click Menu

```javascript
import { create } from "zustand";

export const useFileContextMenuStore = create((set) => ({
    x: null,           // Menu X position
    y: null,           // Menu Y position
    isOpen: false,     // Whether the menu is visible
    file: null,        // Path of the right-clicked file/folder
    isFolder: false,   // Whether the target is a folder

    openMenu: ({ x, y, path, isFolder }) => {
        set({ x, y, file: path, isFolder: !!isFolder, isOpen: true });
    },
    closeMenu: () => {
        set({ isOpen: false, x: null, y: null, file: null, isFolder: false });
    },
    // ... individual setters for x, y, isOpen, file, isFolder
}));
```

This store manages the state of the right-click context menu in the file tree. It tracks:
- **Position:** Where to render the menu (client coordinates)
- **Target:** Which file/folder was right-clicked
- **Type:** Whether it's a file or folder (determines available actions)

---

## 12.4 Store Interaction Pattern

```
User double-clicks "App.jsx" in tree
        │
        ▼
TreeNode: editorSocket.emit("readFile", {path})
        │
        ▼
Backend: reads file → emits "readFileSuccess" 
        │
        ▼
editorSocketStore: listener fires
        │
        ▼
activeFileTabStore: setActiveFileTab(path, value, ext)
        │
        ▼
EditorComponent: re-renders with new file content
```

---

> **Next Chapter:** [Chapter 13 — API Layer & React Query Hooks →](./chapter-13-api-hooks.md)
