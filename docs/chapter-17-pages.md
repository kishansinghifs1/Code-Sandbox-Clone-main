# Chapter 17 — Pages

Pages are route-level components that compose organisms into full-screen layouts.

---

## 17.1 `CreateProject` — Landing Page

**Location:** `frontend/src/pages/CreateProject.jsx`

This is the first page users see at `/`. It provides a stunning, animated landing page with a single call-to-action: create a new playground.

### Component Logic:

```javascript
import { Button } from "antd";
import { useCreateProject } from "../hooks/apis/mutations/useCreateProject";
import { useNavigate } from "react-router-dom";

export const CreateProject = () => {
    const { createProjectMutation } = useCreateProject();
    const navigate = useNavigate();

    async function handleCreateProject() {
        try {
            const response = await createProjectMutation();
            navigate(`/project/${response.data}`);
        } catch (error) {
            console.log("Error creating project", error);
        }
    }

    return (
        <div style={styles.wrapper}>
            <div style={styles.gridOverlay} />
            <div style={styles.glow} />
            <div style={styles.glow2} />
            <div style={styles.content}>
                <h1 style={styles.title}>CODE SANDBOX</h1>
                <p style={styles.subtitle}>
                    Spin up a live coding environment in seconds.
                </p>
                <Button size="large" onClick={handleCreateProject} style={styles.button}>
                    🚀 Create Playground
                </Button>
            </div>
        </div>
    );
};
```

### Visual Design:

1. **Background:** Dark gradient (`#0b1120` → `#111827` → `#0b1120`) at 135° angle

2. **Grid Overlay:** A subtle tech-grid pattern using CSS `backgroundImage` with transparent white lines at 60px intervals

3. **Glow Effects:** Two animated radial gradients:
   - Primary: Indigo/purple glow (600×600px) with 120px blur
   - Secondary: Violet glow (500×500px) offset to top-right

4. **Title:** Gradient text using `background-clip: text`:
   - `#6366f1` (indigo) → `#8b5cf6` (violet) → `#22d3ee` (cyan)
   - 64px, weight 800, 2px letter spacing

5. **Button:** Gradient background with large box-shadow glow effect. Hover animation lifts the button (`translateY(-3px)`) and scales it slightly (`scale(1.03)`)

### Click Flow:

```
User clicks "🚀 Create Playground"
        │
        ▼
handleCreateProject()
        │
        ▼
createProjectMutation() → POST /api/v1/projects
        │
        ▼ (waits for scaffolding to complete)
Response: { data: "abc-123-uuid" }
        │
        ▼
navigate("/project/abc-123-uuid")
        │
        ▼
React Router renders <ProjectPlayground />
```

---

## 17.2 `ProjectPlayground` — IDE Interface

**Location:** `frontend/src/pages/ProjectPlayground.jsx`

This is the main IDE page at `/project/:projectId`. It composes all organisms into a full-screen development environment.

### Layout Structure:

```
┌─────────────────────────────────────────────────────────────────────────┐
│                                                                         │
│  ┌───────────┐  ┌──────────────────────────┐  ┌──────────────────────┐  │
│  │           │  │                          │  │ [🧠 AI Agent] [🌐]  │  │
│  │   File    │  │     Monaco Editor        │  ├──────────────────────┤  │
│  │   Tree    │  │                          │  │                      │  │
│  │ (sidebar) │  │                          │  │   Agent Panel        │  │
│  │           │  │                          │  │   or                 │  │
│  │           │  ├──────────────────────────┤  │   Browser Preview    │  │
│  │           │  │                          │  │                      │  │
│  │           │  │   Terminal (xterm.js)     │  │                      │  │
│  │           │  │                          │  │                      │  │
│  │           │  │                          │  │                      │  │
│  └───────────┘  └──────────────────────────┘  └──────────────────────┘  │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
    Fixed width        ← Allotment (resizable) →         Allotment →
    250px min
```

### Connection Setup:

```javascript
useEffect(() => {
    if (projectIdFromUrl) {
        // Store the project ID
        setProjectId(projectIdFromUrl);

        // 1. Connect Socket.IO for editor events
        const editorSocketConn = io("/editor", {
            query: { projectId: projectIdFromUrl }
        });

        // 2. Connect raw WebSocket for terminal
        try {
            const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
            const wsUrl = `${protocol}//${window.location.host}/terminal?projectId=${projectIdFromUrl}`;
            const ws = new WebSocket(wsUrl);
            setTerminalSocket(ws);
        } catch(error) {
            console.log("error in ws", error);
        }

        setEditorSocket(editorSocketConn);
    }
}, [setProjectId, projectIdFromUrl, setEditorSocket, setTerminalSocket]);
```

**Two connections are established:**
1. **Socket.IO** → `/editor` namespace on port 3000 (proxied via Vite)
2. **Raw WebSocket** → `/terminal?projectId=...` on port 4000 (proxied via Vite)

The WebSocket URL is dynamically constructed:
- `ws:` for HTTP, `wss:` for HTTPS
- Uses `window.location.host` to work in all deployment scenarios

### Right Panel Tabs:

```javascript
const [rightPanelTab, setRightPanelTab] = useState("agent"); // "agent" or "browser"
```

The right panel switches between two views:
- **🧠 AI Agent** — The `AgentPanel` component
- **🌐 Browser** — The `Browser` live preview component

Tab buttons use Dracula-themed styling with active/inactive states.

### Allotment Layout:

```javascript
<Allotment>
    <div> {/* Left: Editor + Terminal (vertical split) */}
        <Allotment vertical={true}>
            <EditorComponent />
            <BrowserTerminal />
        </Allotment>
    </div>
    <div> {/* Right: Agent Panel or Browser */}
        {/* Tab buttons */}
        {rightPanelTab === "agent" && <AgentPanel />}
        {rightPanelTab === "browser" && <Browser />}
    </div>
</Allotment>
```

The `Allotment` component from the `allotment` library provides VS Code-style resizable split panes:
- **Horizontal split:** Editor+Terminal | Agent/Browser
- **Vertical split (nested):** Editor | Terminal

Users can drag dividers to resize any section.

### Lazy Browser Loading:

```javascript
const [loadBrowser, setLoadBrowser] = useState(false);

// Browser only loads when the tab is first clicked
{loadBrowser && projectIdFromUrl && terminalSocket && <Browser projectId={projectIdFromUrl} />}

// Or via a "Load my browser" button
{!loadBrowser && (
    <Button onClick={() => setLoadBrowser(true)}>Load my browser</Button>
)}
```

The browser iframe is not loaded immediately — it waits until:
1. The user clicks the "🌐 Browser" tab, OR
2. The user clicks the "Load my browser" button

This prevents the iframe from loading before the sandbox container is ready (which would show an error page).

---

> **Next Chapter:** [Chapter 18 — Deployment & Docker Compose →](./chapter-18-deployment.md)
