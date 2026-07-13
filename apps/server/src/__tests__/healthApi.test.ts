import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockPrisma } = vi.hoisted(() => ({
  mockPrisma: { $queryRaw: vi.fn() } as any,
}));

vi.mock("../lib/prisma.js", () => ({ default: mockPrisma }));
vi.mock("../middleware/rateLimiter.js", () => ({
  apiLimiter: (_req: any, _res: any, next: any) => next(),
  authLimiter: (_req: any, _res: any, next: any) => next(),
  receiptScanLimiter: (_req: any, _res: any, next: any) => next(),
}));

import app from "../app.js";

describe("service health endpoints", () => {
  beforeEach(() => vi.clearAllMocks());

  it("answers host liveness probes at the root", async () => {
    const response = await request(app).get("/");

    expect(response.status).toBe(200);
    expect(response.body.data).toMatchObject({ service: "CashFlow API", status: "ok", health: "/api/health" });
    expect(mockPrisma.$queryRaw).not.toHaveBeenCalled();
  });

  it("reports ready only when PostgreSQL is reachable", async () => {
    mockPrisma.$queryRaw.mockResolvedValueOnce([{ "?column?": 1 }]);

    const response = await request(app).get("/api/health");

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ success: true, data: { status: "healthy", database: "connected" } });
    expect(response.headers["cache-control"]).toBe("private, no-store");
  });

  it("returns 503 when PostgreSQL is unavailable", async () => {
    mockPrisma.$queryRaw.mockRejectedValueOnce(new Error("database unavailable"));

    const response = await request(app).get("/api/health");

    expect(response.status).toBe(503);
    expect(response.body).toMatchObject({ success: false, data: { status: "unhealthy", database: "disconnected" } });
  });
});
