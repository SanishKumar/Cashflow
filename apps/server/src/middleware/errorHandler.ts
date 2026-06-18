/**
 * Global Error Handler Middleware
 *
 * Catches all unhandled errors in route handlers and sends structured
 * JSON responses. Supports the typed error hierarchy from lib/errors.ts
 * while maintaining backward compatibility with inline error classes.
 */

import type { Request, Response, NextFunction } from "express";
import { AppError, ValidationError, RateLimitError } from "../lib/errors.js";

// Re-export error classes for backward compatibility with existing code
// that imports from this file. New code should import from lib/errors.ts.
export { AppError, NotFoundError, ConflictError, ValidationError } from "../lib/errors.js";

/**
 * Global async error handler.
 * Catches all unhandled errors in route handlers and sends structured JSON responses.
 */
export function errorHandler(
  err: Error,
  _req: Request,
  res: Response,
  _next: NextFunction
): void {
  // Structured error logging
  const timestamp = new Date().toISOString();
  const errCode = (err as any).code || "UNKNOWN";
  const statusCode = (err as any).statusCode || 500;
  console.error(
    JSON.stringify({
      level: "error",
      timestamp,
      code: errCode,
      status: statusCode,
      message: err.message,
      stack: process.env.NODE_ENV !== "production" ? err.stack : undefined,
    })
  );

  // Handle our typed errors
  if (err instanceof AppError) {
    const response: Record<string, unknown> = {
      success: false,
      error: err.message,
      code: err.code,
    };

    // Include validation details if present
    if (err instanceof ValidationError && Object.keys(err.details).length > 0) {
      response.details = err.details;
    }

    // Include Retry-After header for rate limiting
    if (err instanceof RateLimitError) {
      res.setHeader("Retry-After", String(err.retryAfter));
    }

    res.status(err.statusCode).json(response);
    return;
  }

  // Prisma unique constraint violation
  if (err.constructor.name === "PrismaClientKnownRequestError") {
    const prismaErr = err as Error & { code: string; meta?: { target?: string[] } };
    if (prismaErr.code === "P2002") {
      res.status(409).json({
        success: false,
        error: `Duplicate entry: ${prismaErr.meta?.target?.join(", ") ?? "unknown field"}`,
        code: "CONFLICT",
      });
      return;
    }
    if (prismaErr.code === "P2025") {
      res.status(404).json({
        success: false,
        error: "Referenced record not found",
        code: "NOT_FOUND",
      });
      return;
    }
  }

  // Fallback — 500 Internal Server Error
  res.status(500).json({
    success: false,
    error: process.env.NODE_ENV === "production" ? "Internal server error" : err.message,
    code: "INTERNAL_ERROR",
  });
}

/**
 * Wrapper for async route handlers to catch promise rejections.
 */
export function asyncHandler(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<void>
) {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}
