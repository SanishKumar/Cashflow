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
    settlementPayment: { count: vi.fn(), findMany: vi.fn(), aggregate: vi.fn() },
    auditLog: { findMany: vi.fn() },
    user: { findUnique: vi.fn() },
    groupMember: { findMany: vi.fn() },
    debtShare: { aggregate: vi.fn() },
    $queryRaw: vi.fn(),
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
  receiptScanLimiter: (_req: any, _res: any, next: any) => next(),
}));

import app from "../app.js";

describe("Dashboard API", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("GET /api/dashboard/stats", () => {
    it("returns aggregated dashboard stats for the authenticated user", async () => {
      // Mock the Prisma queries called in the dashboard route
      mockPrisma.groupMember.findMany.mockResolvedValue([
        { group: { id: "group-1", name: "Trip", description: null, currency: "EUR", _count: { members: 4, transactions: 30 } } },
        { group: { id: "group-2", name: "Home", description: null, currency: "USD", _count: { members: 3, transactions: 12 } } },
      ]);
      mockPrisma.settlementPayment.findMany.mockResolvedValue([
        { id: "p1", groupId: "group-1", fromUserId: "user-2", toUserId: "user-1", amount: 10, currency: "EUR", createdAt: new Date(), group: { name: "Trip" }, fromUser: { name: "Bob" }, toUser: { name: "Alice" } },
        { id: "p2", groupId: "group-1", fromUserId: "user-3", toUserId: "user-1", amount: 15, currency: "EUR", createdAt: new Date(), group: { name: "Trip" }, fromUser: { name: "Chris" }, toUser: { name: "Alice" } },
        { id: "p3", groupId: "group-2", fromUserId: "user-4", toUserId: "user-1", amount: 20, currency: "USD", createdAt: new Date(), group: { name: "Home" }, fromUser: { name: "Dana" }, toUser: { name: "Alice" } },
      ]);
      mockPrisma.$queryRaw.mockResolvedValue([
        { groupId: "group-1", fromUserId: "user-1", fromName: "Alice", toUserId: "user-2", toName: "Bob", amount: 42.5 },
      ]);
      
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
      expect(response.body.data).toHaveProperty("totalGroups", 2);
      expect(response.body.data).toHaveProperty("totalTransactions", 42);
      expect(response.body.data).toHaveProperty("pendingSettlements", 3);
      expect(response.body.data.pendingGroups).toEqual([
        { groupId: "group-1", groupName: "Trip", pendingCount: 2 },
        { groupId: "group-2", groupName: "Home", pendingCount: 1 },
      ]);
      expect(response.body.data).toHaveProperty("recentActivity");
      expect(response.body.data.recentActivity).toHaveLength(1);
      expect(response.body.data.monthlyVolume).toBeDefined();
      expect(response.body.data.totalVolume).toBeUndefined();
      expect(response.body.data.groups).toHaveLength(2);
      expect(response.body.data.outgoingSettlements[0]).toMatchObject({
        groupId: "group-1",
        currency: "EUR",
        toName: "Bob",
        amount: 42.5,
      });
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
