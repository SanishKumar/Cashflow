import { Router, type CookieOptions, type NextFunction, type Request, type Response } from "express";
import { z } from "zod";
import { validate } from "../middleware/validate.js";
import { requireAuth } from "../middleware/auth.js";
import { authService } from "../services/authService.js";
import { auditLogService } from "../services/auditLogService.js";
import { authLimiter } from "../middleware/rateLimiter.js";
import { InvalidTokenError } from "../lib/errors.js";

const router = Router();
const REFRESH_COOKIE_NAME = "cashflow_refresh";
const REFRESH_COOKIE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

function refreshCookieOptions(): CookieOptions {
  const production = process.env.NODE_ENV === "production";
  return {
    httpOnly: true,
    secure: production,
    sameSite: production ? "none" : "lax",
    path: "/api/auth",
  };
}

function setRefreshCookie(res: Response, token: string): void {
  res.cookie(REFRESH_COOKIE_NAME, token, {
    ...refreshCookieOptions(),
    maxAge: REFRESH_COOKIE_MAX_AGE_MS,
  });
}

function clearRefreshCookie(res: Response): void {
  res.clearCookie(REFRESH_COOKIE_NAME, refreshCookieOptions());
}

function readRefreshCookie(req: Request): string | null {
  const cookieHeader = req.headers.cookie;
  if (!cookieHeader) return null;

  for (const item of cookieHeader.split(";")) {
    const [rawName, ...rawValue] = item.trim().split("=");
    if (rawName === REFRESH_COOKIE_NAME) return decodeURIComponent(rawValue.join("="));
  }
  return null;
}

/** Browser auth mutations are accepted only from the configured frontend. */
function requireTrustedOrigin(req: Request, res: Response, next: NextFunction): void {
  const origin = req.headers.origin;
  const trustedOrigin = process.env.CORS_ORIGIN || "http://localhost:5173";

  if (origin && origin !== trustedOrigin) {
    res.status(403).json({
      success: false,
      error: "Request origin is not allowed",
      code: "UNTRUSTED_ORIGIN",
    });
    return;
  }
  next();
}

router.use(requireTrustedOrigin);

const RegisterSchema = z.object({
  name: z.string().min(1, "Name is required").max(100),
  email: z.string().email("Invalid email format"),
  password: z.string().min(8, "Password must be at least 8 characters"),
});

const LoginSchema = z.object({
  email: z.string().email("Invalid email format"),
  password: z.string().min(1, "Password is required"),
});

router.post("/register", authLimiter, validate(RegisterSchema), async (req, res, next) => {
  try {
    const { name, email, password } = req.body;
    const result = await authService.register(name, email, password, {
      userAgent: req.headers["user-agent"],
      ipAddress: req.ip,
    });

    await auditLogService.log({
      userId: result.user.id,
      action: "USER_REGISTER",
      details: `Account created for ${result.user.email}`,
      metadata: { ipAddress: req.ip },
    });

    setRefreshCookie(res, result.tokens.refreshToken);
    res.status(201).json({
      success: true,
      data: {
        user: result.user,
        accessToken: result.tokens.accessToken,
        expiresIn: result.tokens.expiresIn,
      },
    });
  } catch (err) {
    next(err);
  }
});

router.post("/login", authLimiter, validate(LoginSchema), async (req, res, next) => {
  try {
    const { email, password } = req.body;
    const result = await authService.login(email, password, {
      userAgent: req.headers["user-agent"],
      ipAddress: req.ip,
    });

    await auditLogService.log({
      userId: result.user.id,
      action: "USER_LOGIN",
      details: `Logged in from ${req.headers["user-agent"]?.slice(0, 100) ?? "unknown agent"}`,
      metadata: { ipAddress: req.ip },
    });

    setRefreshCookie(res, result.tokens.refreshToken);
    res.json({
      success: true,
      data: {
        user: result.user,
        accessToken: result.tokens.accessToken,
        expiresIn: result.tokens.expiresIn,
      },
    });
  } catch (err) {
    next(err);
  }
});

router.post("/refresh", async (req, res, next) => {
  try {
    const refreshToken = readRefreshCookie(req);
    if (!refreshToken) throw new InvalidTokenError();

    const result = await authService.refresh(refreshToken, {
      userAgent: req.headers["user-agent"],
      ipAddress: req.ip,
    });

    setRefreshCookie(res, result.tokens.refreshToken);
    res.json({
      success: true,
      data: {
        user: result.user,
        accessToken: result.tokens.accessToken,
        expiresIn: result.tokens.expiresIn,
      },
    });
  } catch (err) {
    next(err);
  }
});

router.post("/logout", async (req, res, next) => {
  try {
    const refreshToken = readRefreshCookie(req);
    if (refreshToken) await authService.logout(refreshToken);
    clearRefreshCookie(res);
    res.json({ success: true, message: "Logged out successfully" });
  } catch (err) {
    next(err);
  }
});

router.post("/logout-all", requireAuth, async (req, res, next) => {
  try {
    const count = await authService.logoutAll(req.userId!);
    await auditLogService.log({
      userId: req.userId!,
      action: "USER_LOGOUT",
      details: `Logged out from all ${count} sessions`,
    });
    clearRefreshCookie(res);
    res.json({ success: true, message: `Logged out from ${count} session(s)` });
  } catch (err) {
    next(err);
  }
});

router.get("/me", requireAuth, async (req, res, next) => {
  try {
    const { default: prisma } = await import("../lib/prisma.js");
    const user = await prisma.user.findUnique({
      where: { id: req.userId! },
      select: { id: true, name: true, email: true, avatarUrl: true, createdAt: true },
    });

    if (!user) {
      res.status(404).json({ success: false, error: "User not found" });
      return;
    }
    res.json({ success: true, data: user });
  } catch (err) {
    next(err);
  }
});

export default router;
