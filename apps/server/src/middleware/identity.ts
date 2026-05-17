// ──────────────────────────────────────────────
// Identity Middleware — X-User-Id Header Extraction
// ──────────────────────────────────────────────

import type { Request, Response, NextFunction } from "express";
import prisma from "../lib/prisma.js";

// Extend Express Request to include userId
declare global {
  namespace Express {
    interface Request {
      userId?: string;
    }
  }
}

/**
 * Extracts and validates the X-User-Id header.
 * If the header is missing or the user doesn't exist, returns 401.
 */
export async function requireIdentity(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  const userId = req.headers["x-user-id"] as string | undefined;

  if (!userId) {
    res.status(401).json({
      success: false,
      error: "Missing X-User-Id header. Please log in.",
    });
    return;
  }

  try {
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      res.status(401).json({
        success: false,
        error: "Invalid user identity. User not found.",
      });
      return;
    }

    req.userId = userId;
    next();
  } catch (err) {
    next(err);
  }
}

/**
 * Optional identity — attaches userId if present but doesn't block.
 * Useful for public routes that behave differently when authenticated.
 */
export async function optionalIdentity(
  req: Request,
  _res: Response,
  next: NextFunction
): Promise<void> {
  const userId = req.headers["x-user-id"] as string | undefined;

  if (userId) {
    try {
      const user = await prisma.user.findUnique({ where: { id: userId } });
      if (user) {
        req.userId = userId;
      }
    } catch {
      // silently continue without identity
    }
  }

  next();
}
