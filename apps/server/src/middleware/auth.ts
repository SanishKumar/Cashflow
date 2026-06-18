/**
 * Authentication Middleware
 *
 * Extracts and validates JWT Bearer tokens from the Authorization header.
 * Two variants:
 *   - requireAuth: blocks request if no valid token (protected routes)
 *   - optionalAuth: attaches userId if present, doesn't block (public routes
 *     that behave differently when authenticated)
 *
 * Migration note: for backward compatibility during the transition from
 * the old X-User-Id header approach, we also check that header as a
 * fallback. This should be removed once the frontend is fully migrated.
 */

import type { Request, Response, NextFunction } from "express";
import { authService } from "../services/authService.js";
import { AuthenticationError } from "../lib/errors.js";

// Extend Express Request to include authenticated user info
declare global {
  namespace Express {
    interface Request {
      userId?: string;
      userEmail?: string;
    }
  }
}

/**
 * Extract Bearer token from Authorization header.
 * Format: "Bearer <token>"
 */
function extractBearerToken(req: Request): string | null {
  const authHeader = req.headers.authorization;
  if (!authHeader) return null;

  const parts = authHeader.split(" ");
  if (parts.length !== 2 || parts[0] !== "Bearer") return null;

  return parts[1];
}

/**
 * Required authentication middleware.
 * Validates JWT and attaches userId + userEmail to the request.
 * Returns 401 if no valid token is provided.
 */
export async function requireAuth(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const token = extractBearerToken(req);

    if (token) {
      const payload = authService.verifyAccessToken(token);
      req.userId = payload.sub;
      req.userEmail = payload.email;
      return next();
    }

    // Fallback: check legacy X-User-Id header during migration period
    const legacyUserId = req.headers["x-user-id"] as string | undefined;
    if (legacyUserId) {
      // Validate the user actually exists
      const { default: prisma } = await import("../lib/prisma.js");
      const user = await prisma.user.findUnique({
        where: { id: legacyUserId },
        select: { id: true, email: true },
      });
      if (user) {
        req.userId = user.id;
        req.userEmail = user.email;
        return next();
      }
    }

    throw new AuthenticationError();
  } catch (err) {
    if (err instanceof AuthenticationError) {
      res.status(401).json({
        success: false,
        error: err.message,
        code: err.code,
      });
      return;
    }

    // Token errors from authService (expired, invalid)
    const appErr = err as any;
    if (appErr.statusCode === 401) {
      res.status(401).json({
        success: false,
        error: appErr.message,
        code: appErr.code,
      });
      return;
    }

    next(err);
  }
}

/**
 * Optional authentication middleware.
 * Attaches userId if a valid token is present, but doesn't block
 * the request if authentication fails.
 */
export async function optionalAuth(
  req: Request,
  _res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const token = extractBearerToken(req);

    if (token) {
      const payload = authService.verifyAccessToken(token);
      req.userId = payload.sub;
      req.userEmail = payload.email;
    } else {
      // Legacy fallback
      const legacyUserId = req.headers["x-user-id"] as string | undefined;
      if (legacyUserId) {
        const { default: prisma } = await import("../lib/prisma.js");
        const user = await prisma.user.findUnique({
          where: { id: legacyUserId },
          select: { id: true, email: true },
        });
        if (user) {
          req.userId = user.id;
          req.userEmail = user.email;
        }
      }
    }
  } catch {
    // Silently continue without auth — this is optional
  }

  next();
}
