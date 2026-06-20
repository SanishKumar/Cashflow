/**
 * Auth Service Tests — Unit tests with mocked Prisma
 *
 * Tests the authentication service: register, login, refresh, logout.
 * The JWT module is NOT mocked so we get real token generation.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

vi.stubEnv("JWT_SECRET", "test-secret-that-is-at-least-32-characters-long-for-testing");

const { mockPrisma } = vi.hoisted(() => ({
  mockPrisma: {
    user: {
      findUnique: vi.fn(),
      create: vi.fn(),
    },
    session: {
      create: vi.fn(),
      findUnique: vi.fn(),
      findMany: vi.fn(),
      delete: vi.fn(),
      deleteMany: vi.fn(),
      count: vi.fn(),
    },
    $transaction: vi.fn((fn: any) => fn(mockPrisma)),
  } as any,
}));

vi.mock("../lib/prisma.js", () => ({ default: mockPrisma }));

import { authService } from "../services/authService.js";

describe("AuthService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPrisma.session.count.mockResolvedValue(0);
    mockPrisma.session.create.mockResolvedValue({
      id: "session-1",
      refreshToken: "hashed-refresh-token",
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    });
  });

  describe("register", () => {
    it("creates a new user with hashed password and returns tokens", async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);
      mockPrisma.user.create.mockResolvedValue({
        id: "user-1",
        name: "Test User",
        email: "test@example.com",
        avatarUrl: null,
        createdAt: new Date(),
      });

      const result = await authService.register(
        "Test User",
        "test@example.com",
        "SecurePass1"
      );

      expect(result.user.name).toBe("Test User");
      expect(result.user.email).toBe("test@example.com");
      expect(result.tokens.accessToken).toBeDefined();
      expect(result.tokens.refreshToken).toBeDefined();
      expect(result.tokens.expiresIn).toBe(900);
    });

    it("throws ConflictError for duplicate email", async () => {
      mockPrisma.user.findUnique.mockResolvedValue({
        id: "existing-user",
        email: "taken@example.com",
      });

      await expect(
        authService.register("Duplicate", "taken@example.com", "SecurePass1")
      ).rejects.toThrow("already exists");
    });

    it("validates password length (minimum 8 characters)", async () => {
      await expect(
        authService.register("Test", "test@example.com", "Sh0rt")
      ).rejects.toThrow();
    });

    it("validates password requires uppercase letter", async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);
      await expect(
        authService.register("Test", "new@example.com", "alllowercase1")
      ).rejects.toThrow("uppercase");
    });

    it("validates password requires digit", async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);
      await expect(
        authService.register("Test", "new2@example.com", "NoDigitsHere")
      ).rejects.toThrow("digit");
    });
  });

  describe("login", () => {
    it("returns user and tokens for valid credentials", async () => {
      // Use a real bcrypt hash for "SecurePass1"
      const bcrypt = await import("bcrypt");
      const hash = await bcrypt.hash("SecurePass1", 4); // Low rounds for speed

      mockPrisma.user.findUnique.mockResolvedValue({
        id: "user-1",
        name: "Test User",
        email: "test@example.com",
        passwordHash: hash,
        avatarUrl: null,
        createdAt: new Date(),
      });

      const result = await authService.login("test@example.com", "SecurePass1");

      expect(result.user.id).toBe("user-1");
      expect(result.tokens.accessToken).toBeDefined();
      expect(result.tokens.refreshToken).toBeDefined();
    });

    it("throws InvalidCredentialsError for wrong password", async () => {
      const bcrypt = await import("bcrypt");
      const hash = await bcrypt.hash("CorrectPassword1", 4);

      mockPrisma.user.findUnique.mockResolvedValue({
        id: "user-1",
        email: "test@example.com",
        passwordHash: hash,
        createdAt: new Date(),
      });

      await expect(
        authService.login("test@example.com", "WrongPassword1")
      ).rejects.toThrow("Invalid email or password");
    });

    it("throws InvalidCredentialsError for non-existent email", async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);

      await expect(
        authService.login("nonexistent@example.com", "SomePass123")
      ).rejects.toThrow("Invalid email or password");
    });
  });

  describe("logout", () => {
    it("deletes the session for a valid refresh token", async () => {
      mockPrisma.session.findUnique.mockResolvedValue({
        id: "session-1",
        userId: "user-1",
        refreshToken: "hashed-refresh-token",
        expiresAt: new Date(Date.now() + 86400000),
      });
      mockPrisma.session.delete.mockResolvedValue({});

      await expect(authService.logout("valid-refresh-token")).resolves.not.toThrow();
      expect(mockPrisma.session.delete).toHaveBeenCalled();
    });

    it("silently succeeds for invalid refresh token", async () => {
      mockPrisma.session.findUnique.mockResolvedValue(null);
      await expect(authService.logout("invalid-token")).resolves.not.toThrow();
    });
  });

  describe("verifyAccessToken", () => {
    it("returns decoded payload for valid JWT", async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);
      mockPrisma.user.create.mockResolvedValue({
        id: "user-1",
        name: "Test User",
        email: "test@example.com",
        avatarUrl: null,
        createdAt: new Date(),
      });

      const { tokens } = await authService.register(
        "Test User",
        "test@example.com",
        "SecurePass1"
      );

      const payload = authService.verifyAccessToken(tokens.accessToken);
      expect(payload.sub).toBe("user-1");
      expect(payload.email).toBe("test@example.com");
    });

    it("throws for an invalid JWT", () => {
      expect(() => authService.verifyAccessToken("invalid.jwt.token")).toThrow();
    });
  });
});
