/**
 * Authentication Service
 *
 * Handles user registration, login, token management, and session lifecycle.
 * Passwords are hashed with bcrypt (cost=12). Sessions use JWT access tokens
 * (15min TTL) paired with opaque refresh tokens (7-day TTL, rotated on use).
 *
 * Security considerations:
 * - Refresh tokens are stored hashed in DB to prevent theft via DB dump
 * - Token rotation: every refresh invalidates the old token
 * - Concurrent session limit: max 5 active sessions per user
 * - Timing-safe comparison for password verification (bcrypt handles this)
 */

import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import crypto from "crypto";
import prisma from "../lib/prisma.js";
import {
  InvalidCredentialsError,
  ConflictError,
  InvalidTokenError,
  TokenExpiredError,
  AuthenticationError,
  AppError,
} from "../lib/errors.js";

const BCRYPT_ROUNDS = 12;
const ACCESS_TOKEN_TTL = "15m";
const REFRESH_TOKEN_TTL_DAYS = 7;
const MAX_SESSIONS_PER_USER = 5;

function getJwtSecret(): string {
  const secret = process.env.JWT_SECRET;
  if (!secret || secret.length < 32) {
    throw new AppError(
      "JWT_SECRET must be set and at least 32 characters long",
      500,
      "CONFIG_ERROR"
    );
  }
  return secret;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  expiresIn: number; // seconds until access token expires
}

export interface JwtPayload {
  sub: string; // userId
  email: string;
  iat?: number;
  exp?: number;
}

export interface AuthUser {
  id: string;
  name: string;
  email: string;
  avatarUrl: string | null;
  createdAt: Date;
}

/**
 * Generate a cryptographically random refresh token.
 * Uses 48 bytes of randomness encoded as URL-safe base64 (64 chars).
 */
function generateRefreshToken(): string {
  return crypto.randomBytes(48).toString("base64url");
}

/**
 * Hash a refresh token before storing in DB.
 * We use SHA-256 rather than bcrypt here because refresh tokens
 * are already high-entropy random strings (not user-chosen passwords).
 */
function hashRefreshToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

export class AuthService {
  /**
   * Register a new user account.
   *
   * @throws ConflictError if email is already registered
   */
  async register(
    name: string,
    email: string,
    password: string,
    meta?: { userAgent?: string; ipAddress?: string }
  ): Promise<{ user: AuthUser; tokens: AuthTokens }> {
    // Check for existing user
    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      throw new ConflictError("An account with this email already exists");
    }

    // Validate password strength
    this.validatePassword(password);

    // Hash password
    const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);

    // Create user
    const user = await prisma.user.create({
      data: {
        name: name.trim(),
        email: email.toLowerCase().trim(),
        passwordHash,
      },
      select: {
        id: true,
        name: true,
        email: true,
        avatarUrl: true,
        createdAt: true,
      },
    });

    // Issue tokens
    const tokens = await this.createSession(user.id, user.email, meta);

    return { user, tokens };
  }

  /**
   * Authenticate with email and password.
   *
   * @throws InvalidCredentialsError if email not found or password wrong
   */
  async login(
    email: string,
    password: string,
    meta?: { userAgent?: string; ipAddress?: string }
  ): Promise<{ user: AuthUser; tokens: AuthTokens }> {
    const user = await prisma.user.findUnique({
      where: { email: email.toLowerCase().trim() },
      select: {
        id: true,
        name: true,
        email: true,
        avatarUrl: true,
        createdAt: true,
        passwordHash: true,
      },
    });

    if (!user) {
      // Still run bcrypt.compare to prevent timing attacks that reveal
      // whether an email exists. Compare against a dummy hash.
      await bcrypt.compare(password, "$2b$12$invalidhashpaddingtopre.venttimingattacksXXXXXXXXXXXXXXX");
      throw new InvalidCredentialsError();
    }

    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) {
      throw new InvalidCredentialsError();
    }

    // Issue tokens
    const tokens = await this.createSession(user.id, user.email, meta);

    const { passwordHash: _, ...safeUser } = user;
    return { user: safeUser, tokens };
  }

  /**
   * Rotate refresh token: invalidate old, issue new.
   *
   * Refresh token rotation is a security best practice. If a refresh token
   * is stolen, the legitimate user's next refresh will fail (because the
   * stolen token was already used), alerting them to the compromise.
   *
   * @throws InvalidTokenError if refresh token is not found
   * @throws TokenExpiredError if refresh token has expired
   */
  async refresh(
    refreshToken: string,
    meta?: { userAgent?: string; ipAddress?: string }
  ): Promise<AuthTokens> {
    const tokenHash = hashRefreshToken(refreshToken);

    const session = await prisma.session.findUnique({
      where: { refreshToken: tokenHash },
      include: {
        user: {
          select: { id: true, email: true },
        },
      },
    });

    if (!session) {
      throw new InvalidTokenError();
    }

    if (session.expiresAt < new Date()) {
      // Clean up expired session
      await prisma.session.delete({ where: { id: session.id } }).catch(() => {});
      throw new TokenExpiredError();
    }

    // Delete old session
    await prisma.session.delete({ where: { id: session.id } });

    // Issue new tokens with a fresh session
    return this.createSession(session.user.id, session.user.email, meta);
  }

  /**
   * Invalidate a refresh token (logout).
   */
  async logout(refreshToken: string): Promise<void> {
    const tokenHash = hashRefreshToken(refreshToken);
    await prisma.session
      .delete({ where: { refreshToken: tokenHash } })
      .catch(() => {
        // Token may already be deleted or invalid — don't error
      });
  }

  /**
   * Invalidate all sessions for a user (force logout everywhere).
   */
  async logoutAll(userId: string): Promise<number> {
    const result = await prisma.session.deleteMany({
      where: { userId },
    });
    return result.count;
  }

  /**
   * Verify a JWT access token and return the payload.
   *
   * @throws InvalidTokenError if token is malformed
   * @throws TokenExpiredError if token has expired
   */
  verifyAccessToken(token: string): JwtPayload {
    try {
      const payload = jwt.verify(token, getJwtSecret()) as JwtPayload;
      return payload;
    } catch (err: any) {
      if (err.name === "TokenExpiredError") {
        throw new TokenExpiredError();
      }
      throw new InvalidTokenError();
    }
  }

  /**
   * Create a session: generate tokens, persist refresh token hash.
   * Enforces max concurrent sessions by evicting oldest when limit reached.
   */
  private async createSession(
    userId: string,
    email: string,
    meta?: { userAgent?: string; ipAddress?: string }
  ): Promise<AuthTokens> {
    // Enforce session limit — evict oldest sessions if at max
    const sessionCount = await prisma.session.count({ where: { userId } });
    if (sessionCount >= MAX_SESSIONS_PER_USER) {
      const oldest = await prisma.session.findMany({
        where: { userId },
        orderBy: { createdAt: "asc" },
        take: sessionCount - MAX_SESSIONS_PER_USER + 1,
        select: { id: true },
      });
      await prisma.session.deleteMany({
        where: { id: { in: oldest.map((s) => s.id) } },
      });
    }

    // Generate tokens
    const accessToken = jwt.sign(
      { sub: userId, email } satisfies JwtPayload,
      getJwtSecret(),
      { expiresIn: ACCESS_TOKEN_TTL }
    );

    const rawRefreshToken = generateRefreshToken();
    const refreshTokenHash = hashRefreshToken(rawRefreshToken);

    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + REFRESH_TOKEN_TTL_DAYS);

    // Persist session
    await prisma.session.create({
      data: {
        userId,
        refreshToken: refreshTokenHash,
        userAgent: meta?.userAgent?.slice(0, 500),
        ipAddress: meta?.ipAddress,
        expiresAt,
      },
    });

    return {
      accessToken,
      refreshToken: rawRefreshToken,
      expiresIn: 900, // 15 minutes in seconds
    };
  }

  /**
   * Validate password meets minimum complexity requirements.
   * Requirements: 8+ chars, at least one uppercase, one lowercase, one digit.
   */
  private validatePassword(password: string): void {
    const issues: string[] = [];

    if (password.length < 8) {
      issues.push("Password must be at least 8 characters");
    }
    if (!/[A-Z]/.test(password)) {
      issues.push("Password must contain at least one uppercase letter");
    }
    if (!/[a-z]/.test(password)) {
      issues.push("Password must contain at least one lowercase letter");
    }
    if (!/[0-9]/.test(password)) {
      issues.push("Password must contain at least one digit");
    }

    if (issues.length > 0) {
      throw new AppError(issues.join(". "), 400, "WEAK_PASSWORD");
    }
  }
}

export const authService = new AuthService();
