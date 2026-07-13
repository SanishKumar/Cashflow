import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.stubEnv("NODE_ENV", "production");
vi.stubEnv("CORS_ORIGIN", "https://cashflow.example");

const { mockAuthService, mockAuditLogService } = vi.hoisted(() => ({
  mockAuthService: {
    register: vi.fn(),
    login: vi.fn(),
    refresh: vi.fn(),
    logout: vi.fn(),
    logoutAll: vi.fn(),
    verifyAccessToken: vi.fn(),
  },
  mockAuditLogService: { log: vi.fn() },
}));

vi.mock("../services/authService.js", () => ({ authService: mockAuthService }));
vi.mock("../services/auditLogService.js", () => ({ auditLogService: mockAuditLogService }));
vi.mock("../middleware/rateLimiter.js", () => ({
  authLimiter: (_req: unknown, _res: unknown, next: () => void) => next(),
}));

import authRoutes from "../routes/auth.js";
import { errorHandler } from "../middleware/errorHandler.js";

const app = express();
app.use(express.json());
app.use("/api/auth", authRoutes);
app.use(errorHandler);

const user = {
  id: "user-1",
  name: "Alice",
  email: "alice@example.com",
  avatarUrl: null,
  createdAt: new Date("2026-01-01"),
};

function authResult(refreshToken: string) {
  return {
    user,
    tokens: { accessToken: "access-token", refreshToken, expiresIn: 900 },
  };
}

describe("HttpOnly refresh cookie routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAuthService.login.mockResolvedValue(authResult("new-refresh-token"));
    mockAuthService.refresh.mockResolvedValue(authResult("rotated-refresh-token"));
    mockAuthService.logout.mockResolvedValue(undefined);
  });

  it("sets the refresh token only in a secure HttpOnly cookie", async () => {
    const response = await request(app)
      .post("/api/auth/login")
      .set("Origin", "https://cashflow.example")
      .send({ email: "alice@example.com", password: "SecurePass1" });

    expect(response.status).toBe(200);
    expect(response.body.data).toMatchObject({
      user: { id: "user-1", email: "alice@example.com" },
      accessToken: "access-token",
      expiresIn: 900,
    });
    expect(response.body.data).not.toHaveProperty("refreshToken");
    expect(response.headers["set-cookie"]?.[0]).toContain("cashflow_refresh=new-refresh-token");
    expect(response.headers["set-cookie"]?.[0]).toContain("HttpOnly");
    expect(response.headers["set-cookie"]?.[0]).toContain("Secure");
    expect(response.headers["set-cookie"]?.[0]).toContain("SameSite=None");
    expect(response.headers["set-cookie"]?.[0]).toContain("Path=/api/auth");
  });

  it("rotates using the cookie and never accepts a body refresh token", async () => {
    const response = await request(app)
      .post("/api/auth/refresh")
      .set("Origin", "https://cashflow.example")
      .set("Cookie", "cashflow_refresh=old-refresh-token");

    expect(response.status).toBe(200);
    expect(mockAuthService.refresh).toHaveBeenCalledWith(
      "old-refresh-token",
      expect.objectContaining({ ipAddress: expect.any(String) })
    );
    expect(response.body.data).not.toHaveProperty("refreshToken");
    expect(response.headers["set-cookie"]?.[0]).toContain("rotated-refresh-token");

    const bodyOnly = await request(app)
      .post("/api/auth/refresh")
      .set("Origin", "https://cashflow.example")
      .send({ refreshToken: "attacker-controlled-body-token" });
    expect(bodyOnly.status).toBe(401);
  });

  it("rejects browser auth requests from an untrusted origin", async () => {
    const response = await request(app)
      .post("/api/auth/login")
      .set("Origin", "https://attacker.example")
      .send({ email: "alice@example.com", password: "SecurePass1" });

    expect(response.status).toBe(403);
    expect(response.body.code).toBe("UNTRUSTED_ORIGIN");
    expect(mockAuthService.login).not.toHaveBeenCalled();
  });

  it("clears the cookie during logout", async () => {
    const response = await request(app)
      .post("/api/auth/logout")
      .set("Origin", "https://cashflow.example")
      .set("Cookie", "cashflow_refresh=refresh-token");

    expect(response.status).toBe(200);
    expect(mockAuthService.logout).toHaveBeenCalledWith("refresh-token");
    expect(response.headers["set-cookie"]?.[0]).toContain("cashflow_refresh=");
  });
});
