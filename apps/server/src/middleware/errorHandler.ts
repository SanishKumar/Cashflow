// ──────────────────────────────────────────────
// Global Error Handler Middleware
// ──────────────────────────────────────────────

import type { Request, Response, NextFunction } from "express";

/**
 * Custom application error with HTTP status code.
 */
export class AppError extends Error {
  public readonly statusCode: number;
  public readonly isOperational: boolean;

  constructor(message: string, statusCode: number, isOperational = true) {
    super(message);
    this.statusCode = statusCode;
    this.isOperational = isOperational;
    Object.setPrototypeOf(this, AppError.prototype);
  }
}

/**
 * Not Found error — 404
 */
export class NotFoundError extends AppError {
  constructor(resource: string, id?: string) {
    const msg = id ? `${resource} with id '${id}' not found` : `${resource} not found`;
    super(msg, 404);
  }
}

/**
 * Conflict error — 409
 */
export class ConflictError extends AppError {
  constructor(message: string) {
    super(message, 409);
  }
}

/**
 * Global async error handler.
 * Catches all unhandled errors in route handlers and sends structured JSON responses.
 * Never crashes the server on bad input.
 */
export function errorHandler(
  err: Error,
  _req: Request,
  res: Response,
  _next: NextFunction
): void {
  console.error(`[ERROR] ${err.message}`, err.stack);

  if (err instanceof AppError) {
    res.status(err.statusCode).json({
      success: false,
      error: err.message,
    });
    return;
  }

  // Prisma unique constraint violation
  if (err.constructor.name === "PrismaClientKnownRequestError") {
    const prismaErr = err as Error & { code: string; meta?: { target?: string[] } };
    if (prismaErr.code === "P2002") {
      res.status(409).json({
        success: false,
        error: `Duplicate entry: ${prismaErr.meta?.target?.join(", ") ?? "unknown field"}`,
      });
      return;
    }
    if (prismaErr.code === "P2025") {
      res.status(404).json({
        success: false,
        error: "Referenced record not found",
      });
      return;
    }
  }

  // Fallback — 500 Internal Server Error
  res.status(500).json({
    success: false,
    error: process.env.NODE_ENV === "production" ? "Internal server error" : err.message,
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
