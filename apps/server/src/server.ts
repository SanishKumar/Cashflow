// ──────────────────────────────────────────────
// Server Entry Point
// ──────────────────────────────────────────────

import "dotenv/config";
import { createServer } from "http";
import app from "./app.js";
import prisma from "./lib/prisma.js";
import { initSocketServer } from "./socket/socketServer.js";
import { initSolver } from "./wasm/wasmLoader.js";

const PORT = parseInt(process.env.PORT || "4000", 10);

const httpServer = createServer(app);

// ── Initialize Socket.io ───────────────────────
initSocketServer(httpServer);

// ── Graceful Shutdown ──────────────────────────
async function shutdown(signal: string) {
  console.log(`\n[SERVER] Received ${signal}. Shutting down gracefully...`);

  httpServer.close(() => {
    console.log("[SERVER] HTTP server closed.");
  });

  await prisma.$disconnect();
  console.log("[SERVER] Database connection closed.");

  process.exit(0);
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));

// ── Start Server ───────────────────────────────
async function main() {
  try {
    // Initialize WASM solver (falls back to TS if unavailable)
    await initSolver();

    // Verify database connection with retry for Neon cold starts
    let retries = 5;
    while (retries > 0) {
      try {
        await prisma.$connect();
        console.log("[DB] PostgreSQL connected successfully.");
        break;
      } catch (err: any) {
        if (err.errorCode === 'P1001' && retries > 1) {
          console.warn(`[DB] Neon cold start timeout (P1001), retrying... (${retries - 1} attempts left)`);
          await new Promise(res => setTimeout(res, 4000));
          retries--;
        } else {
          throw err;
        }
      }
    }

    httpServer.listen(PORT, () => {
      console.log(`
╔══════════════════════════════════════════════╗
║  CASHFLOW API v2.0.0                         ║
║──────────────────────────────────────────────║
║  HTTP:   http://localhost:${PORT}              ║
║  WS:     ws://localhost:${PORT}                ║
║  Health: http://localhost:${PORT}/api/health    ║
║  Env:    ${(process.env.NODE_ENV || "development").padEnd(35)}║
╚══════════════════════════════════════════════╝
      `.trim());
    });
  } catch (error) {
    console.error("[SERVER] Failed to start:", error);
    await prisma.$disconnect();
    process.exit(1);
  }
}

main();
