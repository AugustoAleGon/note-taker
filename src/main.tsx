import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App";
import { createApi } from "./notes/api";

// Run the mock in development and preview.
const ready = import("./mocks/browser").then((module) => module.startMockApi());
// Prevent an unhandled rejection. API requests still receive the error.
void ready.catch(() => {});
const api = createApi(ready);
createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App api={api} />
  </StrictMode>,
);
