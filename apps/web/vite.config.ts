/// <reference types="vitest" />
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { resolve } from "path";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  test: {
    globals: true,
    environment: "happy-dom",
    setupFiles: "./src/setupTests.ts",
  },
  resolve: {
    alias: {
      "@": resolve(__dirname, "./src"),
      // The clearing engine is plain dependency-free TypeScript, so it is
      // aliased to source rather than pre-bundled. That keeps it running in the
      // browser with no server round trip.
      "@cashflow/clearing": resolve(__dirname, "../../packages/clearing/src/index.ts"),
    },
  },
  server: {
    port: 5173,
    fs: {
      // Serving from a sibling workspace package requires opting the repo root in.
      allow: [resolve(__dirname, "../..")],
    },
    proxy: {
      "/api": {
        target: "http://localhost:4000",
        changeOrigin: true,
      },
      "/socket.io": {
        target: "http://localhost:4000",
        changeOrigin: true,
        ws: true,
      },
    },
  },
});
