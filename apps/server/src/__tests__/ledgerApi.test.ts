import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockPrisma, mockVerifyAccessToken } = vi.hoisted(() => ({
  mockPrisma: {
    groupMember: { findMany: vi.fn() },
    transaction: { findMany: vi.fn(), count: vi.fn() },
  } as any,
  mockVerifyAccessToken: vi.fn(),
}));

vi.mock("../lib/prisma.js", () => ({ default: mockPrisma }));
vi.mock("../services/authService.js", () => ({
  authService: { verifyAccessToken: mockVerifyAccessToken },
}));

import ledgerRoutes from "../routes/ledger.js";
import { errorHandler } from "../middleware/errorHandler.js";

const app = express();
app.use("/api/ledger", ledgerRoutes);
app.use(errorHandler);

describe("ledger API", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockVerifyAccessToken.mockReturnValue({ sub: "user-1", email: "alice@example.com" });
    mockPrisma.groupMember.findMany.mockResolvedValue([{ groupId: "group-1" }, { groupId: "group-2" }]);
    mockPrisma.transaction.count.mockResolvedValue(51);
    mockPrisma.transaction.findMany.mockResolvedValue([{
      id: "tx-1",
      groupId: "group-2",
      amount: 24.5,
      description: "Dinner",
      createdAt: new Date("2026-07-13T12:00:00.000Z"),
      paidBy: { id: "user-1", name: "Alice" },
      group: { name: "Lisbon trip", currency: "EUR" },
    }]);
  });

  it("returns one authorized, paginated transaction feed", async () => {
    const response = await request(app)
      .get("/api/ledger/transactions?page=2&limit=25")
      .set("Authorization", "Bearer valid-token");

    expect(response.status).toBe(200);
    expect(mockPrisma.groupMember.findMany).toHaveBeenCalledWith({
      where: { userId: "user-1" },
      select: { groupId: true },
    });
    expect(mockPrisma.transaction.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { groupId: { in: ["group-1", "group-2"] }, status: "COMPLETED" },
      skip: 25,
      take: 25,
    }));
    expect(response.body.data).toMatchObject({
      total: 51,
      page: 2,
      limit: 25,
      totalPages: 3,
      items: [{ id: "tx-1", groupName: "Lisbon trip", groupCurrency: "EUR", amount: 24.5 }],
    });
  });

  it("requires an authenticated user", async () => {
    const response = await request(app).get("/api/ledger/transactions");

    expect(response.status).toBe(401);
    expect(mockPrisma.groupMember.findMany).not.toHaveBeenCalled();
  });
});
