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
import exportRoutes from "./routes/exports.js";
import { apiLimiter } from "./middleware/rateLimiter.js";
import { errorHandler } from "./middleware/errorHandler.js";
import prisma from "./lib/prisma.js";

const app = express();

// Trust the reverse proxy (e.g. Render) to accurately resolve X-Forwarded-For IP addresses
app.set("trust proxy", 1);

// Security & Parsing Middleware
app.use(helmet());
app.use(
  cors({
    origin: process.env.CORS_ORIGIN || "http://localhost:5173",
    credentials: true,
  })
);
app.use(express.json({ limit: "10mb" }));
// Structured JSON logging for production/staging, dev otherwise
if (process.env.NODE_ENV === "production") {
  app.use(
    morgan((tokens, req, res) => {
      return JSON.stringify({
        method: tokens.method(req, res),
        url: tokens.url(req, res),
        status: Number(tokens.status(req, res)),
        content_length: tokens.res(req, res, "content-length"),
        response_time: Number(tokens["response-time"](req, res)),
        remote_addr: tokens["remote-addr"](req, res),
        timestamp: new Date().toISOString(),
      });
    })
  );
} else {
  app.use(morgan("dev"));
}

// Health Check (public)
app.get("/api/health", async (_req, res) => {
  let dbStatus = "unknown";
  try {
    await prisma.$queryRaw`SELECT 1`;
    dbStatus = "connected";
  } catch (err) {
    dbStatus = "disconnected";
  }

  res.json({
    success: true,
    data: {
      status: "healthy",
      database: dbStatus,
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      version: "3.0.0",
    },
  });
});

// Apply rate limiting to all API routes
app.use("/api/", apiLimiter);

// Auth routes (public — no token required)
app.use("/api/auth", authRoutes);

// API Routes (protected via auth middleware applied in each router)
app.use("/api/users", userRoutes);
app.use("/api/groups", groupRoutes);
app.use("/api/groups", transactionRoutes);
app.use("/api/audit-logs", auditLogRoutes);
app.use("/api/groups/:groupId/export", exportRoutes);

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
