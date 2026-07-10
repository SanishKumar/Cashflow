// ──────────────────────────────────────────────
// Application Entry Point
// ──────────────────────────────────────────────

import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { Analytics } from "@vercel/analytics/react";
import { SpeedInsights } from "@vercel/speed-insights/react";
import { ErrorBoundary } from "./components/ErrorBoundary";
import App from "./App";
import "./index.css";

const enableVercelInsights = import.meta.env.PROD;

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
      {enableVercelInsights && (
        <>
          <Analytics />
          <SpeedInsights />
        </>
      )}
    </ErrorBoundary>
  </StrictMode>
);
