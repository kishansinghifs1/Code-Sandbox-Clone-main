# React + Vite

This template provides a minimal setup to get React working in Vite with HMR and some ESLint rules.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Babel](https://babeljs.io/) (or [oxc](https://oxc.rs) when used in [rolldown-vite](https://vite.dev/guide/rolldown)) for Fast Refresh
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/) for Fast Refresh

## React Compiler

The React Compiler is not enabled on this template because of its impact on dev & build performances. To add it, see [this documentation](https://react.dev/learn/react-compiler/installation).

## Expanding the ESLint configuration

If you are developing a production application, we recommend using TypeScript with type-aware lint rules enabled. Check out the [TS template](https://github.com/vitejs/vite/tree/main/packages/create-vite/template-react-ts) for information on how to integrate TypeScript and [`typescript-eslint`](https://typescript-eslint.io) in your project.
----------------------------------
## Data Fetching Strategy (TanStack Query)

This project uses **TanStack Query** to manage all server-side state.

### Queries
Queries are used for **fetching data** from the server.
Examples:
- Fetch all sandboxes
- Fetch sandbox details

Benefits:
- Automatic caching
- Loading and error handling
- Background refetching

---

### Mutations
Mutations are used for **modifying server data**.
Examples:
- Create a new sandbox
- Update sandbox files
- Delete a sandbox

After a successful mutation, related queries are invalidated to keep the UI in sync.

---

## Query Invalidation
Query invalidation ensures that the application always shows the latest server data after mutations without manual refresh logic.

---
