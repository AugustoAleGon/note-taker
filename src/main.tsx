import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App";
import { createApi } from "./notes/api";

// The exercise deliberately ships its mock in preview builds as well as development.
const ready = import("./mocks/browser").then((module) => module.startMockApi());
// Handle startup rejection immediately; requests still receive the original error.
void ready.catch(() => {});
const api = createApi(ready);
createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App api={api} />
  </StrictMode>,
);
