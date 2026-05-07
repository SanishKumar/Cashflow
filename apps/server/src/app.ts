// ──────────────────────────────────────────────
// Express Application Setup
// ──────────────────────────────────────────────

import express from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";

import userRoutes from "./routes/users.js";
import groupRoutes from "./routes/groups.js";
import transactionRoutes from "./routes/transactions.js";
import { errorHandler } from "./middleware/errorHandler.js";

const app = express();

// ── Security & Parsing Middleware ──────────────
app.use(helmet());
app.use(
  cors({
    origin: process.env.CORS_ORIGIN || "http://localhost:5173",
    credentials: true,
  })
);
app.use(express.json({ limit: "10mb" }));
app.use(morgan("dev"));

// ── Health Check ───────────────────────────────
app.get("/api/health", (_req, res) => {
  res.json({
    success: true,
    data: {
      status: "healthy",
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      version: "2.0.0",
    },
  });
});

// ── API Routes ─────────────────────────────────
app.use("/api/users", userRoutes);
app.use("/api/groups", groupRoutes);
// Transaction routes are nested under /api/groups/:groupId
app.use("/api/groups", transactionRoutes);

// ── 404 Handler ────────────────────────────────
app.use((_req, res) => {
  res.status(404).json({
    success: false,
    error: "Endpoint not found",
  });
});

// ── Global Error Handler ───────────────────────
app.use(errorHandler);

export default app;
