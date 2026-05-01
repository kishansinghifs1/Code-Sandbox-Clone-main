# Chapter 13 — API Layer & React Query Hooks

This chapter covers the HTTP API client layer — Axios configuration, API wrappers, and React Query hooks.

---

## 13.1 Axios Configuration — `frontend/src/config/axiosConfig.js`

```javascript
import axios from 'axios';

const axiosInstance = axios.create({
    baseURL: import.meta.env.VITE_BACKEND_URL || ""
});

export default axiosInstance;
```

### How It Works:

- **`import.meta.env.VITE_BACKEND_URL`** — Vite injects environment variables prefixed with `VITE_` at build time.
- **In development:** `VITE_BACKEND_URL` is empty (`""`) because the Vite proxy handles routing.
  - API calls go to `/api/v1/projects` → Vite proxy forwards to `http://localhost:3000/api/v1/projects`
- **In production (behind Nginx):** Also empty because Nginx proxies `/api` to the backend service.
- **If set explicitly:** e.g., `http://backend:3000` for direct access.

All API modules import this configured instance instead of raw `axios` to ensure consistent base URL handling.

---

## 13.2 API Wrappers — `frontend/src/apis/`

### `ping.js` — Health Check API

```javascript
import axios from '../config/axiosConfig';

export const pingApi = async () => {
    try {
        const response = await axios.get('/api/v1/ping');
        console.log(response.data);
        return response.data;
    } catch(error) {
        console.log(error);
        throw error;
    }
};
```

Makes a `GET /api/v1/ping` request. Returns `{ message: "pong" }`. Used by the `PingComponent` and `usePing` hook to verify backend connectivity.

### `projects.js` — Project API

```javascript
import axios from '../config/axiosConfig';

export const createProjectApi = async () => {
    try {
        const response = await axios.post('/api/v1/projects');
        console.log(response.data);
        return response.data;
    } catch(error) {
        console.log(error);
        throw error;
    }
};

export const getProjectTree = async ({ projectId }) => {
    try {
        const response = await axios.get(`/api/v1/projects/${projectId}/tree`);
        console.log(response.data);
        return response?.data?.data;  // Unwrap: { data: { data: tree } } → tree
    } catch(error) {
        console.log(error);
        throw error;
    }
};
```

**`createProjectApi`:**
- `POST /api/v1/projects` — Creates a new project
- Returns `{ message: "Project created", data: "<uuid>" }`

**`getProjectTree`:**
- `GET /api/v1/projects/:id/tree` — Fetches the file tree
- **Note the double unwrap:** The backend wraps the tree in `{ success: true, data: tree }`, and Axios wraps the response in `{ data: responseBody }`, so the tree is at `response.data.data`.

---

## 13.3 React Query Hooks — `frontend/src/hooks/apis/`

### 13.3.1 Query Hooks (Read Operations)

#### `usePing.js`

```javascript
import { useQuery } from '@tanstack/react-query';
import { pingApi } from '../../../apis/ping.js';

export default function usePing() {
    const { isLoading, isError, data, error } = useQuery({
        queryFn: pingApi,
        queryKey: ['ping'],
        staleTime: 10000  // Data is "fresh" for 10 seconds
    });

    return {
        isLoading,
        isError,
        data,
        error
    };
}
```

**`staleTime: 10000`** — After the first successful fetch, React Query won't refetch for 10 seconds, even if the component re-renders. This prevents unnecessary network requests.

#### `useProjectTree.js`

```javascript
import { useQuery } from "@tanstack/react-query";
import { getProjectTree } from "../../../apis/projects";

export const useProjectTree = (projectId) => {
    const { isLoading, isError, data: projectTree, error } = useQuery({
        queryFn: () => getProjectTree({ projectId }),
    });

    return {
        isLoading,
        isError,
        projectTree,
        error,
    };
};
```

**Note:** This hook exists but is **not actively used** in the current codebase. The `TreeStructure` component fetches the tree through the `treeStructureStore` instead. This hook could be used as an alternative approach.

### 13.3.2 Mutation Hooks (Write Operations)

#### `useCreateProject.js`

```javascript
import { useMutation } from "@tanstack/react-query";
import { createProjectApi } from "../../../apis/projects";

export const useCreateProject = () => {
    const { mutateAsync, isPending, isSuccess, error } = useMutation({
        mutationFn: createProjectApi,
        onSuccess: (data) => {
            console.log("Project created successfully", data);
        },
        onError: () => {
            console.log("Error creating project");
        }
    });

    return {
        createProjectMutation: mutateAsync,
        isPending,
        isSuccess,
        error
    };
};
```

**Key Detail: `mutateAsync` vs `mutate`**
- `mutateAsync` returns a Promise that can be `await`ed
- Used in `CreateProject.jsx`:
  ```javascript
  const response = await createProjectMutation();
  navigate(`/project/${response.data}`);
  ```
- This allows the component to wait for the project to be created before navigating

---

## 13.4 Query vs Mutation

| Concept | React Query Term | HTTP Method | Example |
|---|---|---|---|
| Read data | `useQuery` | GET | Fetch file tree, ping |
| Write/modify data | `useMutation` | POST/PUT/DELETE | Create project |

React Query automatically handles:
- **Loading states** — `isLoading` / `isPending`
- **Error states** — `isError` / `error`
- **Caching** — Responses are cached by `queryKey`
- **Deduplication** — Multiple components requesting the same data get the same cached response
- **Background refetching** — Stale data is refetched in the background

---

## 13.5 Data Flow: Creating a Project

```
User clicks "🚀 Create Playground"
        │
        ▼
CreateProject.jsx: handleCreateProject()
        │
        ▼
useCreateProject hook: createProjectMutation()
        │
        ▼
useMutation → createProjectApi()
        │
        ▼
Axios: POST /api/v1/projects
        │
        ▼ (Vite proxy)
Backend: createProjectController → createProjectService
        │
        ▼
Response: { message: "Project created", data: "abc-123" }
        │
        ▼
CreateProject.jsx: navigate(`/project/abc-123`)
        │
        ▼
React Router: renders <ProjectPlayground /> with projectId="abc-123"
```

---

> **Next Chapter:** [Chapter 14 — UI Components — Atoms →](./chapter-14-components-atoms.md)
