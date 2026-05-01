# Chapter 11 — Frontend Entry & Routing

This chapter covers how the React application boots, what providers wrap it, and how routing works.

---

## 11.1 Application Entry — `frontend/src/main.jsx`

```javascript
import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App.jsx";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter } from "react-router-dom";

const queryClient = new QueryClient();

createRoot(document.getElementById("root")).render(
  <BrowserRouter>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </BrowserRouter>
);
```

### Provider Stack:

```
<BrowserRouter>                    ← React Router (URL-based routing)
  <QueryClientProvider>            ← React Query (server-state caching)
    <App />                        ← Application root
  </QueryClientProvider>
</BrowserRouter>
```

1. **`BrowserRouter`** — Enables client-side routing using the browser's History API. This means navigating to `/project/abc` doesn't make a server request — React handles it.

2. **`QueryClientProvider`** — Provides a `QueryClient` instance to all components. React Query manages server-state (data fetched from APIs) separately from client-state (Zustand stores).

3. **`QueryClient`** — Created with default options. It manages a cache of API responses, handles refetching, and provides loading/error states.

**Note:** Unlike many React apps, `StrictMode` is NOT used here. This is likely intentional to prevent double-mounting effects that would create duplicate WebSocket connections.

---

## 11.2 Root Component — `frontend/src/App.jsx`

```javascript
import './App.css'
import { Router } from './Router.jsx';

function App() {
  return (
    <Router />
  )
}

export default App
```

The root component is minimal — it just renders the router. `App.css` is imported but currently empty/minimal.

---

## 11.3 Router — `frontend/src/Router.jsx`

```javascript
import { Route, Routes } from "react-router-dom"
import { CreateProject } from "./pages/CreateProject"
import { ProjectPlayground } from "./pages/ProjectPlayground"

export const Router = () => {
    return (
        <Routes>
            <Route path="/" element={<CreateProject />} />
            <Route path="/project/:projectId" element={<ProjectPlayground />} />
        </Routes>
    )
}
```

### Routes:

| Path | Component | Purpose |
|---|---|---|
| `/` | `<CreateProject />` | Landing page with "Create Playground" button |
| `/project/:projectId` | `<ProjectPlayground />` | Full IDE interface |

### How Navigation Works:

1. User visits `http://localhost:5173/` → sees the `CreateProject` landing page
2. User clicks "🚀 Create Playground"
3. Frontend calls `POST /api/v1/projects` → receives a UUID
4. Frontend navigates to `/project/<uuid>` using `useNavigate()` from React Router
5. `ProjectPlayground` renders with the UUID extracted via `useParams()`

The `:projectId` is a dynamic route parameter. Inside `ProjectPlayground`, it's accessed as:

```javascript
const { projectId: projectIdFromUrl } = useParams();
```

---

## 11.4 CSS Entry — `frontend/src/index.css`

```css
:root {
  /* minimal base styles */
}
```

The base CSS is intentionally minimal. Most styling is done inline in JSX (using style objects) or via component-specific CSS files.

---

> **Next Chapter:** [Chapter 12 — State Management (Zustand Stores) →](./chapter-12-state-management.md)
