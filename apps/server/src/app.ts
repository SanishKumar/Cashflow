/**
 * Express Application Setup
 *
 * Configures middleware, auth, routing, and error handling.
 * Auth routes are public; all other API routes require authentication
 * via JWT Bearer tokens.
 */

import express from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";

import authRoutes from "./routes/auth.js";
import userRoutes from "./routes/users.js";
import groupRoutes from "./routes/groups.js";
import transactionRoutes from "./routes/transactions.js";
import auditLogRoutes from "./routes/auditLogs.js";
import { errorHandler } from "./middleware/errorHandler.js";

const app = express();

// Security & Parsing Middleware
app.use(helmet());
app.use(
  cors({
    origin: process.env.CORS_ORIGIN || "http://localhost:5173",
    credentials: true,
  })
);
app.use(express.json({ limit: "10mb" }));
app.use(morgan("dev"));

// Health Check (public)
app.get("/api/health", (_req, res) => {
  res.json({
    success: true,
    data: {
      status: "healthy",
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      version: "3.0.0",
    },
  });
});

// Auth routes (public — no token required)
app.use("/api/auth", authRoutes);

// API Routes (protected via auth middleware applied in each router)
app.use("/api/users", userRoutes);
app.use("/api/groups", groupRoutes);
app.use("/api/groups", transactionRoutes);
app.use("/api/audit-logs", auditLogRoutes);

// 404 Handler
app.use((_req, res) => {
  res.status(404).json({
    success: false,
    error: "Endpoint not found",
    code: "NOT_FOUND",
  });
});

// Global Error Handler
app.use(errorHandler);

export default app;
