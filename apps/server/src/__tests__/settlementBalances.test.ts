import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockPrisma, mockRequireRole, mockSolveDebts } = vi.hoisted(() => ({
  mockPrisma: {
    group: { findUnique: vi.fn() },
    transaction: { findMany: vi.fn() },
    settlementPayment: { findMany: vi.fn() },
  } as any,
  mockRequireRole: vi.fn(),
  mockSolveDebts: vi.fn(),
}));

vi.mock("../lib/prisma.js", () => ({ default: mockPrisma }));
vi.mock("../services/groupService.js", () => ({
  groupService: { requireRole: mockRequireRole },
}));
vi.mock("../wasm/wasmLoader.js", () => ({ solveDebts: mockSolveDebts }));
vi.mock("../socket/socketServer.js", () => ({ broadcastToGroup: vi.fn() }));

import { transactionService } from "../services/transactionService.js";

const decimal = (value: number) => ({ toNumber: () => value });

describe("confirmed settlement balances", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireRole.mockResolvedValue({ role: "MEMBER" });
    mockPrisma.group.findUnique.mockResolvedValue({
      id: "group-1",
      members: [
        { user: { id: "user-1", name: "Alice" } },
        { user: { id: "user-2", name: "Bob" } },
      ],
    });
    mockPrisma.transaction.findMany.mockResolvedValue([{
      paidById: "user-2",
      paidBy: { id: "user-2", name: "Bob" },
      debtShares: [{
        owedById: "user-1",
        amount: decimal(100),
        owedBy: { id: "user-1", name: "Alice" },
      }],
    }]);
    mockPrisma.settlementPayment.findMany.mockResolvedValue([{
      fromUserId: "user-1",
      toUserId: "user-2",
      amount: decimal(40),
    }]);
    mockSolveDebts.mockResolvedValue({
      settlements: [{ from: "user-1", fromName: "Alice", to: "user-2", toName: "Bob", amount: 60 }],
      engine: "typescript",
      strategy: "exact",
      exact: true,
      activeBalances: 2,
    });
  });

  it("offsets expenses only after a payment is confirmed", async () => {
    const result = await transactionService.getSettlements("group-1", "user-1");

    expect(mockPrisma.settlementPayment.findMany).toHaveBeenCalledWith({
      where: { groupId: "group-1", status: "CONFIRMED" },
      select: { fromUserId: true, toUserId: true, amount: true },
    });
    expect(mockSolveDebts).toHaveBeenCalledWith([
      { from: "user-1", to: "user-2", amount: 100 },
      { from: "user-2", to: "user-1", amount: 40 },
    ], expect.any(Map));
    expect(result.balances).toEqual([
      { userId: "user-1", name: "Alice", netBalance: -60 },
      { userId: "user-2", name: "Bob", netBalance: 60 },
    ]);
  });
});
