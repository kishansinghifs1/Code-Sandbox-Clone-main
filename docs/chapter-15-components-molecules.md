# Chapter 15 — UI Components: Molecules

Molecules are combinations of atoms and native elements that form functional units. They contain some business logic and interact with stores.

---

## 15.1 `EditorComponent` — Monaco Editor Wrapper

**Location:** `frontend/src/components/molecules/EditorComponent/`

```javascript
import Editor from "@monaco-editor/react";
import { useEffect, useRef, useState } from "react";
import { useActiveFileTabStore } from "../../../stores/activeFileTabStore";
import { useEditorSocketStore } from "../../../stores/editorSocketStore";
import { extensionToFileType } from '../../../utils/extensionToFileType';

export const EditorComponent = () => {
    const timerId = useRef(null);       // Debounce timer reference
    const [theme, setTheme] = useState(null);  // Dracula theme data

    const { activeFileTab } = useActiveFileTabStore();
    const { editorSocket } = useEditorSocketStore();

    // Load the Dracula theme JSON on mount
    useEffect(() => {
        let mounted = true;
        async function downloadTheme() {
            const response = await fetch("/Dracula.json");
            const data = await response.json();
            if (mounted) setTheme(data);
        }
        downloadTheme();
        return () => { mounted = false; };
    }, []);

    // Register the theme with Monaco when the editor mounts
    function handleEditorMount(editor, monaco) {
        if (!theme) return;
        monaco.editor.defineTheme("dracula", theme);
        monaco.editor.setTheme("dracula");
    }

    // Debounced auto-save: waits 2 seconds after last keystroke
    function handleChange(value) {
        if (timerId.current != null) {
            clearTimeout(timerId.current);
        }
        timerId.current = setTimeout(() => {
            editorSocket.emit("writeFile", {
                data: value,
                pathToFileOrFolder: activeFileTab.path
            });
        }, 2000);
    }

    return (
        <>
            {theme && (
                <Editor
                    language={extensionToFileType(activeFileTab?.extension)}
                    onChange={handleChange}
                    value={
                        activeFileTab?.value
                            ? activeFileTab.value
                            : "// Welcome to the playground"
                    }
                    onMount={handleEditorMount}
                />
            )}
        </>
    );
};
```

### Key Mechanisms:

1. **Dracula Theme Loading:**
   - The theme JSON is stored as a static file at `frontend/public/Dracula.json` (5KB)
   - Fetched via `fetch("/Dracula.json")` on component mount
   - Registered with Monaco's `defineTheme` API
   - The editor doesn't render until the theme is loaded (`{theme && <Editor />}`)

2. **Debounced Auto-Save:**
   - Every keystroke resets a 2-second timer
   - Only after 2 seconds of inactivity does the file get saved
   - Uses `useRef` to persist the timer ID across renders without causing re-renders
   - The save emits `writeFile` via Socket.IO (not HTTP)

3. **Language Detection:**
   - `extensionToFileType("jsx")` → `"javascript"`
   - Monaco uses this to enable appropriate syntax highlighting, autocomplete, etc.

4. **Controlled vs Uncontrolled:**
   - The `value` prop makes this a controlled component
   - When `activeFileTab` changes (user opens a different file), the editor content updates
   - Default value: `"// Welcome to the playground"` when no file is open

---

## 15.2 `BrowserTerminal` — xterm.js Terminal

**Location:** `frontend/src/components/molecules/BrowserTerminal/`

```javascript
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import "@xterm/xterm/css/xterm.css";
import { useEffect, useRef } from 'react';
import { AttachAddon } from '@xterm/addon-attach';
import { useTerminalSocketStore } from '../../../stores/terminalSocketStore';

export const BrowserTerminal = () => {
    const terminalRef = useRef(null);
    const { terminalSocket } = useTerminalSocketStore();

    useEffect(() => {
        // Create the terminal instance
        const term = new Terminal({
            cursorBlink: true,
            theme: {
                background: "#282a37",     // Dracula background
                foreground: "#f8f8f3",     // Dracula foreground
                cursor: "#f8f8f3",
                cursorAccent: "#282a37",
                red: "#ff5544",
                green: "#50fa7c",
                yellow: "#f1fa8c",
                cyan: "#8be9fd",
            },
            fontSize: 16,
            fontFamily: "'Fira Code', monospace",
            fontLigatures: true,
            convertEol: true,        // Convert \n to \r\n
        });

        // FitAddon: auto-sizes the terminal to its container
        const fitAddon = new FitAddon();
        term.loadAddon(fitAddon);

        // Mount the terminal to the DOM element
        term.open(terminalRef.current);
        fitAddon.fit();

        // Auto-resize when the container size changes (e.g., dragging Allotment divider)
        const resizeObserver = new ResizeObserver(() => {
            fitAddon.fit();
        });
        resizeObserver.observe(terminalRef.current);

        // Attach the WebSocket when it's ready
        let handleOpen;
        if (terminalSocket) {
            handleOpen = () => {
                const attachAddon = new AttachAddon(terminalSocket);
                term.loadAddon(attachAddon);
            };

            if (terminalSocket.readyState === WebSocket.OPEN) {
                handleOpen();
            } else {
                terminalSocket.addEventListener("open", handleOpen);
            }
        }

        // Cleanup
        return () => {
            resizeObserver.disconnect();
            if (terminalSocket && handleOpen) {
                terminalSocket.removeEventListener("open", handleOpen);
            }
            term.dispose();
        };
    }, [terminalSocket]);

    return (
        <div
            ref={terminalRef}
            style={{ height: "100%", width: "100%" }}
            className="terminal"
        />
    );
};
```

### Key Mechanisms:

1. **xterm.js Terminal:**
   - Creates a full terminal emulator in the browser
   - Supports ANSI colors, cursor movement, scroll, and more
   - Uses the Dracula color theme for consistency with the editor

2. **FitAddon:**
   - Calculates how many rows and columns fit in the container
   - Called on initial render and on every resize

3. **ResizeObserver:**
   - Watches the container element for size changes
   - When the user drags the Allotment split-pane divider, the terminal auto-resizes

4. **AttachAddon:**
   - Bridges xterm.js with a raw WebSocket
   - All keystrokes go directly to the WebSocket
   - All incoming data from the WebSocket is rendered in the terminal
   - This is why the terminal server uses `ws` instead of Socket.IO

5. **WebSocket Readiness:**
   - The socket might not be open when the component mounts
   - Checks `readyState === WebSocket.OPEN` first
   - If not open yet, waits for the `"open"` event

---

## 15.3 `TreeNode` — File/Folder Tree Item

**Location:** `frontend/src/components/molecules/TreeNode/`

```javascript
export const TreeNode = ({ fileFolderData }) => {
    const [visibility, setVisibility] = useState({});
    const { editorSocket } = useEditorSocketStore();
    const { openMenu } = useFileContextMenuStore();
```

### Recursive Tree Rendering:

This component is **recursive** — it renders itself for each child node:

```javascript
{visibility[fileFolderData.name] &&
    fileFolderData.children &&
    fileFolderData.children.map((child) => (
        <TreeNode fileFolderData={child} key={child.name} />
    ))}
```

### Folder vs File Detection:

```javascript
{fileFolderData.children ? (
    // It's a folder → render as expandable button
    <button onClick={() => toggleVisibility(fileFolderData.name)}>
        {visibility[fileFolderData.name] ? <IoIosArrowDown /> : <IoIosArrowForward />}
        {visibility[fileFolderData.name] ? <FaFolderOpen /> : <FaFolder />}
        <span>{fileFolderData.name}</span>
    </button>
) : (
    // It's a file → render as clickable text
    <div>
        <FileIcon extension={computeExtension(fileFolderData)} />
        <p onDoubleClick={() => handleDoubleClick(fileFolderData)}>
            {fileFolderData.name}
        </p>
    </div>
)}
```

The `directory-tree` library adds a `children` array only for directories. Files have no `children` property. This is the detection mechanism.

### Interactions:

- **Single click (folder):** Toggle expand/collapse
- **Double click (file):** Open in editor (`editorSocket.emit("readFile", ...)`)
- **Right click (both):** Open context menu (`openMenu({x, y, path, isFolder})`)

### Visibility State:

```javascript
const [visibility, setVisibility] = useState({});
// { "src": true, "components": false, "public": true }
```

Each folder's expand/collapse state is tracked by name. Initially all folders are collapsed.

---

## 15.4 `FileContextMenu` — Right-Click Menu

**Location:** `frontend/src/components/molecules/ContextMenu/`

```javascript
export const FileContextMenu = ({ x, y, path, isFolder }) => {
    const { closeMenu } = useFileContextMenuStore();
    const { editorSocket } = useEditorSocketStore();
    const [showInput, setShowInput] = useState(null); // 'file' | 'folder' | null
    const [inputValue, setInputValue] = useState('');
```

### Available Actions:

| Action | Button | Socket Event | Condition |
|---|---|---|---|
| Create File | 📄 New File | `createFile` | Always shown |
| Create Folder | 📁 New Folder | `createFolder` | Always shown |
| Delete File | 🗑️ Delete File | `deleteFile` | Shown for files |
| Delete Folder | 🗑️ Delete Folder | `deleteFolder` | Shown for folders |

### Inline Name Input:

When "New File" or "New Folder" is clicked, an inline text input appears inside the context menu:

```javascript
function handleInputSubmit(e) {
    if (e.key === 'Enter' && inputValue.trim()) {
        const basePath = isFolder ? path : path.substring(0, path.lastIndexOf('/'));
        const newPath = `${basePath}/${inputValue.trim()}`;
        
        if (showInput === 'file') {
            editorSocket.emit("createFile", { pathToFileOrFolder: newPath });
        } else if (showInput === 'folder') {
            editorSocket.emit("createFolder", { pathToFileOrFolder: newPath });
        }
        closeMenu();
    } else if (e.key === 'Escape') {
        setShowInput(null);
    }
}
```

**Path Calculation:** If right-clicking on a **folder**, the new item is created inside it. If right-clicking on a **file**, the new item is created in the same parent directory.

### Styling:

The context menu uses a dedicated CSS file (`FileContextMenu.css`) with:
- Fixed positioning at cursor coordinates
- Dark background (`#1e1f2e`) with subtle border
- Hover effects with background color change
- Danger styling (red hover) for delete actions
- Input field with focus styling (purple glow)

---

> **Next Chapter:** [Chapter 16 — UI Components — Organisms →](./chapter-16-components-organisms.md)
