import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockPrisma, mockVerifyAccessToken } = vi.hoisted(() => ({
  mockPrisma: {
    groupMember: { findMany: vi.fn() },
    transaction: { count: vi.fn(), aggregate: vi.fn() },
    debtShare: { aggregate: vi.fn() },
    settlementPayment: { count: vi.fn(), findMany: vi.fn(), aggregate: vi.fn() },
    auditLog: { findMany: vi.fn() },
    $queryRaw: vi.fn(),
  } as any,
  mockVerifyAccessToken: vi.fn(),
}));

vi.mock("../lib/prisma.js", () => ({ default: mockPrisma }));
vi.mock("../services/authService.js", () => ({
  authService: { verifyAccessToken: mockVerifyAccessToken },
}));

import dashboardRoutes from "../routes/dashboard.js";
import { errorHandler } from "../middleware/errorHandler.js";

const app = express();
app.use(express.json());
app.use("/api/dashboard", dashboardRoutes);
app.use(errorHandler);

describe("dashboard settlement summaries", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockVerifyAccessToken.mockReturnValue({ sub: "user-1", email: "alice@example.com" });
    mockPrisma.groupMember.findMany.mockResolvedValue([{
      group: { id: "group-1", name: "Lisbon trip", description: null, currency: "USD", _count: { members: 3, transactions: 5 } },
    }]);
    mockPrisma.transaction.count.mockResolvedValue(5);
    mockPrisma.transaction.aggregate
      .mockResolvedValueOnce({ _sum: { amount: 500 } })
      .mockResolvedValueOnce({ _sum: { amount: 200 } });
    mockPrisma.debtShare.aggregate.mockResolvedValue({ _sum: { amount: 250 } });
    mockPrisma.settlementPayment.count.mockResolvedValue(2);
    mockPrisma.settlementPayment.findMany.mockResolvedValue([
      { id: "p1", groupId: "group-1", fromUserId: "user-2", toUserId: "user-1", amount: 10, currency: "USD", createdAt: new Date(), group: { name: "Lisbon trip" }, fromUser: { name: "Bob" }, toUser: { name: "Alice" } },
      { id: "p2", groupId: "group-1", fromUserId: "user-3", toUserId: "user-1", amount: 20, currency: "USD", createdAt: new Date(), group: { name: "Lisbon trip" }, fromUser: { name: "Chris" }, toUser: { name: "Alice" } },
    ]);
    mockPrisma.settlementPayment.aggregate
      .mockResolvedValueOnce({ _sum: { amount: 30 } })
      .mockResolvedValueOnce({ _sum: { amount: 10 } });
    mockPrisma.auditLog.findMany.mockResolvedValue([]);
    mockPrisma.$queryRaw.mockResolvedValue([]);
  });

  it("returns only incoming pending payments as confirmation actions", async () => {
    const response = await request(app)
      .get("/api/dashboard/stats")
      .set("Authorization", "Bearer valid-token");

    expect(response.status).toBe(200);
    expect(mockPrisma.settlementPayment.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: {
        groupId: { in: ["group-1"] },
        status: "PENDING",
        OR: [{ fromUserId: "user-1" }, { toUserId: "user-1" }],
      },
    }));
    expect(response.body.data.pendingSettlements).toBe(2);
    expect(response.body.data.pendingGroups).toEqual([
      { groupId: "group-1", groupName: "Lisbon trip", pendingCount: 2 },
    ]);
    expect(response.body.data.pendingConfirmations).toHaveLength(2);
    expect(response.body.data.netPosition).toBeUndefined();
  });
});
