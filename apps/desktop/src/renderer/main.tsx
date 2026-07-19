import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "@fontsource/dm-sans/400.css";
import "@fontsource/dm-sans/500.css";
import "@fontsource/dm-sans/600.css";
import type { StudioApi } from "../shared/ipc";
import App from "./App";
import "./styles.css";

const rootEl = document.getElementById("root");
if (!rootEl) {
  throw new Error('Root element "#root" not found');
}

const studio = (window as unknown as { studio?: StudioApi }).studio;

createRoot(rootEl).render(
  <StrictMode>
    {studio ? (
      <App />
    ) : (
      <main className="pane">
        <div className="project-error" role="alert">
          Studio bridge unavailable — restart the app.
        </div>
      </main>
    )}
  </StrictMode>,
);
