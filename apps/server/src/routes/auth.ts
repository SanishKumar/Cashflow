/**
 * Authentication Routes
 *
 * POST /api/auth/register  — Create account (name, email, password)
 * POST /api/auth/login     — Login (email, password)
 * POST /api/auth/refresh   — Rotate tokens (refreshToken)
 * POST /api/auth/logout    — Invalidate session (refreshToken)
 * POST /api/auth/logout-all — Invalidate all sessions (requires auth)
 * GET  /api/auth/me        — Get current user profile (requires auth)
 */

import { Router } from "express";
import { z } from "zod";
import { validate } from "../middleware/validate.js";
import { requireAuth } from "../middleware/auth.js";
import { authService } from "../services/authService.js";
import { auditLogService } from "../services/auditLogService.js";

const router = Router();

// Validation schemas
const RegisterSchema = z.object({
  name: z.string().min(1, "Name is required").max(100),
  email: z.string().email("Invalid email format"),
  password: z
    .string()
    .min(8, "Password must be at least 8 characters"),
});

const LoginSchema = z.object({
  email: z.string().email("Invalid email format"),
  password: z.string().min(1, "Password is required"),
});

const RefreshSchema = z.object({
  refreshToken: z.string().min(1, "Refresh token is required"),
});

const LogoutSchema = z.object({
  refreshToken: z.string().min(1, "Refresh token is required"),
});

// POST /api/auth/register
router.post(
  "/register",
  validate(RegisterSchema),
  async (req, res, next) => {
    try {
      const { name, email, password } = req.body;

      const result = await authService.register(name, email, password, {
        userAgent: req.headers["user-agent"],
        ipAddress: req.ip,
      });

      // Audit log
      await auditLogService.log({
        userId: result.user.id,
        action: "USER_REGISTER",
        details: `Account created for ${result.user.email}`,
        metadata: { ipAddress: req.ip },
      });

      res.status(201).json({
        success: true,
        data: {
          user: result.user,
          accessToken: result.tokens.accessToken,
          refreshToken: result.tokens.refreshToken,
          expiresIn: result.tokens.expiresIn,
        },
      });
    } catch (err) {
      next(err);
    }
  }
);

// POST /api/auth/login
router.post(
  "/login",
  validate(LoginSchema),
  async (req, res, next) => {
    try {
      const { email, password } = req.body;

      const result = await authService.login(email, password, {
        userAgent: req.headers["user-agent"],
        ipAddress: req.ip,
      });

      // Audit log
      await auditLogService.log({
        userId: result.user.id,
        action: "USER_LOGIN",
        details: `Logged in from ${req.headers["user-agent"]?.slice(0, 100) ?? "unknown agent"}`,
        metadata: { ipAddress: req.ip },
      });

      res.json({
        success: true,
        data: {
          user: result.user,
          accessToken: result.tokens.accessToken,
          refreshToken: result.tokens.refreshToken,
          expiresIn: result.tokens.expiresIn,
        },
      });
    } catch (err) {
      next(err);
    }
  }
);

// POST /api/auth/refresh
router.post(
  "/refresh",
  validate(RefreshSchema),
  async (req, res, next) => {
    try {
      const tokens = await authService.refresh(req.body.refreshToken, {
        userAgent: req.headers["user-agent"],
        ipAddress: req.ip,
      });

      res.json({
        success: true,
        data: {
          accessToken: tokens.accessToken,
          refreshToken: tokens.refreshToken,
          expiresIn: tokens.expiresIn,
        },
      });
    } catch (err) {
      next(err);
    }
  }
);

// POST /api/auth/logout
router.post(
  "/logout",
  validate(LogoutSchema),
  async (req, res, next) => {
    try {
      await authService.logout(req.body.refreshToken);

      res.json({
        success: true,
        message: "Logged out successfully",
      });
    } catch (err) {
      next(err);
    }
  }
);

// POST /api/auth/logout-all — requires auth
router.post(
  "/logout-all",
  requireAuth,
  async (req, res, next) => {
    try {
      const count = await authService.logoutAll(req.userId!);

      // Audit log
      await auditLogService.log({
        userId: req.userId!,
        action: "USER_LOGOUT",
        details: `Logged out from all ${count} sessions`,
      });

      res.json({
        success: true,
        message: `Logged out from ${count} session(s)`,
      });
    } catch (err) {
      next(err);
    }
  }
);

// GET /api/auth/me — requires auth
router.get(
  "/me",
  requireAuth,
  async (req, res, next) => {
    try {
      const { default: prisma } = await import("../lib/prisma.js");
      const user = await prisma.user.findUnique({
        where: { id: req.userId! },
        select: {
          id: true,
          name: true,
          email: true,
          avatarUrl: true,
          createdAt: true,
        },
      });

      if (!user) {
        res.status(404).json({ success: false, error: "User not found" });
        return;
      }

      res.json({ success: true, data: user });
    } catch (err) {
      next(err);
    }
  }
);

export default router;
