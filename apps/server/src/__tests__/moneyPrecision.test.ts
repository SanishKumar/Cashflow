import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockPrisma, mockRequireRole } = vi.hoisted(() => ({
  mockPrisma: {
    group: { findUnique: vi.fn() },
    transaction: { create: vi.fn() },
  } as any,
  mockRequireRole: vi.fn(),
}));

vi.mock("../lib/prisma.js", () => ({ default: mockPrisma }));
vi.mock("../services/groupService.js", () => ({
  groupService: { requireRole: mockRequireRole },
}));
vi.mock("../socket/socketServer.js", () => ({ broadcastToGroup: vi.fn() }));

import { CreateTransactionSchema } from "../types/api.js";
import { transactionService } from "../services/transactionService.js";

const decimal = (value: number) => ({ toNumber: () => value });

describe("money precision", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireRole.mockResolvedValue({ role: "MEMBER" });
  });

  it("accepts cent values and rejects fractions smaller than a cent", () => {
    const base = {
      paidById: "user-1",
      description: "Dinner",
      shares: [{ owedById: "user-1", amount: 10.25 }],
    };

    expect(CreateTransactionSchema.safeParse({ ...base, amount: 10.25 }).success).toBe(true);
    expect(CreateTransactionSchema.safeParse({
      ...base,
      amount: 10.251,
      shares: [{ owedById: "user-1", amount: 10.251 }],
    }).success).toBe(false);
  });

  it("converts fixed-point database decimals to numeric API values", async () => {
    mockPrisma.group.findUnique.mockResolvedValue({
      id: "group-1",
      currency: "USD",
      members: [{ userId: "user-1" }],
    });
    mockPrisma.transaction.create.mockResolvedValue({
      id: "tx-1",
      groupId: "group-1",
      paidById: "user-1",
      amount: decimal(10.25),
      originalCurrency: null,
      exchangeRate: null,
      description: "Dinner",
      status: "COMPLETED",
      createdAt: new Date(),
      updatedAt: new Date(),
      paidBy: { id: "user-1", name: "Alice", email: "alice@example.com" },
      debtShares: [{
        id: "share-1",
        transactionId: "tx-1",
        owedById: "user-1",
        amount: decimal(10.25),
        owedBy: { id: "user-1", name: "Alice", email: "alice@example.com" },
      }],
    });
    vi.spyOn(transactionService, "getSettlements").mockRejectedValueOnce(new Error("skip broadcast computation"));

    const result = await transactionService.create("group-1", {
      paidById: "user-1",
      amount: 10.25,
      description: "Dinner",
      shares: [{ owedById: "user-1", amount: 10.25 }],
    }, "user-1");

    expect(result.amount).toBe(10.25);
    expect(result.debtShares[0].amount).toBe(10.25);
  });
});
