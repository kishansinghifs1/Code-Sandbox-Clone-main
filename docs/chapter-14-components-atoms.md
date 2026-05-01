# Chapter 14 — UI Components: Atoms

Atoms are the smallest, self-contained UI building blocks. They have no business logic and receive all data via props.

---

## 14.1 `EditorButton` — File Tab Button

**Location:** `frontend/src/components/atoms/EditorButton/`

### `EditorButton.jsx`

```javascript
import './EditorButton.css';

export const EditorButton = ({ isActive }) => {
    function handleClick() {
        // TODO: Implement click handler
    }
    return (
        <button
            className="editor-button"
            style={{
                color: isActive ? 'white' : '#959eba',
                backgroundColor: isActive ? '#303242' : '#4a4859',
                borderTop: isActive ? '2px solid #f7b9dd' : 'none',
            }}
            onClick={handleClick}
        >
            file.js
        </button>
    )
}
```

### `EditorButton.css`

```css
.editor-button {
    outline: none;
    background-color: #303242;
    font-size: 14px;
    height: 30px;
    border-left: none;
    border-bottom: none;
    border-top: 1px solid #f7b9dd;
    color: white;
    min-width: 100px;
    padding: 3px 7px 3px 7px;
}
```

**Purpose:** A tab button styled like VS Code's editor tabs. When active, it has a white text color and a pink/rose top border. When inactive, it's dimmer.

**Status:** Currently a static placeholder. The `handleClick` is a TODO — it would need to switch the active file tab. The filename is hardcoded as "file.js".

**Styling:** Uses the Dracula-inspired dark color scheme:
- Active: `#303242` (dark purple-gray) with pink top border
- Inactive: `#4a4859` (lighter gray)

---

## 14.2 `FileIcon` — File Type Icon

**Location:** `frontend/src/components/atoms/FileIcon/`

### `FileIcon.jsx`

```javascript
import { FaCss3, FaHtml5, FaJs } from "react-icons/fa"
import { GrReactjs } from "react-icons/gr"

export const FileIcon = ({ extension }) => {
    const iconStyle = {
        height: "20px",
        width: "20px"
    }

    const IconMapper = {
        "js":  <FaJs color="yellow" style={iconStyle} />,
        "jsx": <GrReactjs color="#61dbfa" style={iconStyle} />,
        "css": <FaCss3 color="#3c99dc" style={iconStyle}  />,
        "html": <FaHtml5 color="#e34c26" style={iconStyle} />,
    }

    return (
        <>
            {IconMapper[extension]}
        </>
    )
}
```

**Purpose:** Renders a colored icon based on the file extension. Maps file types to their canonical icons and colors:

| Extension | Icon | Color | Source |
|---|---|---|---|
| `.js` | JavaScript logo | Yellow (#FFFF00) | `react-icons/fa` |
| `.jsx` | React atom logo | Cyan (#61dbfa) | `react-icons/gr` |
| `.css` | CSS3 logo | Blue (#3c99dc) | `react-icons/fa` |
| `.html` | HTML5 logo | Orange-red (#e34c26) | `react-icons/fa` |

**Limitation:** Only 4 file types are mapped. Unknown extensions render nothing (empty fragment). The `extensionToFileType.js` utility has a much larger mapping, but FileIcon only uses these four.

**Used by:** `TreeNode` component — displayed next to each file in the tree view.

---

## 14.3 `PingComponent` — Health Check Display

**Location:** `frontend/src/components/atoms/PingComponent.jsx`

```javascript
import usePing from "../../hooks/apis/queries/usePing";

export const PingComponent = () => {
    const { isLoading, data } = usePing();

    if (isLoading) {
        return (
            <>
                Loading...
            </>
        )
    }

    return (
        <>
            Hello {data.message}
        </>
    )
}
```

**Purpose:** A simple component that displays the backend's ping response. Shows "Loading..." while the request is in-flight, then "Hello pong" when the backend responds.

**Status:** This is a utility/debug component. It's not rendered in the main application but exists for testing backend connectivity.

**Data Flow:**
1. `usePing()` hook calls `pingApi()` 
2. `pingApi()` sends `GET /api/v1/ping`
3. Backend returns `{ message: "pong" }`
4. Component renders "Hello pong"

---

## 14.4 File Extension Utility — `frontend/src/utils/extensionToFileType.js`

While not a component, this utility is used by the `EditorComponent` to set the Monaco Editor's language mode.

```javascript
const extensionToTypeMap = {
    js: "javascript",    jsx: "javascript",
    ts: "typescript",    tsx: "typescript",
    html: "html",        htm: "html",
    css: "css",          scss: "css",     sass: "css",   less: "css",
    md: "markdown",      json: "json",
    yaml: "yaml",        yml: "yaml",
    svg: "svg",
    png: "image",        jpg: "image",   jpeg: "image",
    gif: "image",        webp: "image",  ico: "image",
    txt: "text",         env: "env",     lock: "lock",
    xml: "xml",
    py: "python",        java: "java",
    c: "c",              cpp: "cpp",     cs: "csharp",
    go: "go",            rs: "rust",     php: "php",
    sh: "shell",         bash: "shell",
    sql: "database",     dockerfile: "docker",
};

export const extensionToFileType = (extension) => {
    if (!extension) return undefined;
    return extensionToTypeMap[extension];
};
```

**Purpose:** Maps file extensions to Monaco Editor language identifiers. When a user opens a `.jsx` file, Monaco is told the language is `"javascript"`, enabling JSX syntax highlighting.

---

> **Next Chapter:** [Chapter 15 — UI Components — Molecules →](./chapter-15-components-molecules.md)
