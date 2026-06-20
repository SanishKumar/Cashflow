/**
 * Dashboard API Tests
 *
 * Tests the /api/dashboard endpoints using supertest.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";

const { mockPrisma } = vi.hoisted(() => ({
  mockPrisma: {
    group: { count: vi.fn() },
    transaction: { count: vi.fn(), findMany: vi.fn(), aggregate: vi.fn() },
    settlement: { count: vi.fn() },
    auditLog: { findMany: vi.fn() },
    user: { findUnique: vi.fn() },
    groupMember: { findMany: vi.fn() },
    debtShare: { aggregate: vi.fn() },
  } as any,
}));

vi.mock("../lib/prisma.js", () => ({ default: mockPrisma }));

// Mock verifyAccessToken so auth middleware passes
vi.mock("../services/authService.js", () => ({
  authService: {
    verifyAccessToken: vi.fn().mockReturnValue({ sub: "user-1", email: "test@test.com" }),
  },
}));

// Mock rate limiter to avoid Redis connection errors during tests
vi.mock("../middleware/rateLimiter.js", () => ({
  apiLimiter: (_req: any, _res: any, next: any) => next(),
  authLimiter: (_req: any, _res: any, next: any) => next(),
}));

import app from "../app.js";

describe("Dashboard API", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("GET /api/dashboard/stats", () => {
    it("returns aggregated dashboard stats for the authenticated user", async () => {
      // Mock the Prisma queries called in the dashboard route
      mockPrisma.groupMember.findMany.mockResolvedValue([ { groupId: "group-1" } ]);
      mockPrisma.group.count.mockResolvedValue(5);
      mockPrisma.transaction.count.mockResolvedValue(42);
      
      // Net position mocked to be 1500
      mockPrisma.transaction.findMany.mockResolvedValue([
        { amount: 2000, paidById: "user-1", createdAt: new Date() },
      ]);
      
      mockPrisma.settlement.count.mockResolvedValue(3);
      
      // Monthly volume aggregation mock
      mockPrisma.transaction.aggregate.mockResolvedValue({
        _sum: { amount: 1200 },
      });
      
      mockPrisma.debtShare.aggregate.mockResolvedValue({
        _sum: { amount: 500 },
      });
      
      mockPrisma.auditLog.findMany.mockResolvedValue([
        {
          id: "log-1",
          action: "EXPENSE_ADDED",
          details: "Lunch",
          createdAt: new Date(),
          user: { id: "user-1", name: "Alice", email: "alice@test.com", avatarUrl: null },
          group: { id: "group-1", name: "Trip" },
        },
      ]);

      const response = await request(app)
        .get("/api/dashboard/stats")
        .set("Authorization", "Bearer valid-mock-token");

      expect(response.status).toBe(200);
      expect(response.body.data).toHaveProperty("totalGroups", 1);
      expect(response.body.data).toHaveProperty("totalTransactions", 42);
      expect(response.body.data).toHaveProperty("pendingSettlements", 42);
      expect(response.body.data).toHaveProperty("recentActivity");
      expect(response.body.data.recentActivity).toHaveLength(1);
      expect(response.body.data.monthlyVolume).toBeDefined();
      expect(response.body.data.totalVolume).toBe(1200);
    });

    it("returns 401 if unauthorized", async () => {
      // We must reset the mock for this specific test
      const { authService } = await import("../services/authService.js");
      const { InvalidTokenError } = await import("../lib/errors.js");
      vi.mocked(authService.verifyAccessToken).mockImplementationOnce(() => {
        throw new InvalidTokenError();
      });

      const response = await request(app)
        .get("/api/dashboard/stats")
        .set("Authorization", "Bearer invalid-token");

      expect(response.status).toBe(401);
    });
  });
});
