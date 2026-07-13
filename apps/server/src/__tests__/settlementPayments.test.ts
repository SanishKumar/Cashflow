import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  mockPrisma,
  mockRequireRole,
  mockGetSettlements,
  mockVerifyAccessToken,
  mockAuditLog,
} = vi.hoisted(() => ({
  mockPrisma: {
    group: { findUnique: vi.fn() },
    settlementPayment: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      updateMany: vi.fn(),
    },
  } as any,
  mockRequireRole: vi.fn(),
  mockGetSettlements: vi.fn(),
  mockVerifyAccessToken: vi.fn(),
  mockAuditLog: vi.fn(),
}));

vi.mock("../lib/prisma.js", () => ({ default: mockPrisma }));
vi.mock("../services/groupService.js", () => ({
  groupService: { requireRole: mockRequireRole },
}));
vi.mock("../services/transactionService.js", () => ({
  transactionService: { getSettlements: mockGetSettlements },
}));
vi.mock("../services/authService.js", () => ({
  authService: { verifyAccessToken: mockVerifyAccessToken },
}));
vi.mock("../services/auditLogService.js", () => ({
  auditLogService: { log: mockAuditLog },
}));
vi.mock("../socket/socketServer.js", () => ({ broadcastToGroup: vi.fn() }));

import settlementPaymentRoutes from "../routes/settlementPayments.js";
import { settlementPaymentService } from "../services/settlementPaymentService.js";
import { errorHandler } from "../middleware/errorHandler.js";

const app = express();
app.use(express.json());
app.use("/api/groups", settlementPaymentRoutes);
app.use(errorHandler);

const decimal = (value: number) => ({ toNumber: () => value });
const pendingPayment = {
  id: "payment-1",
  groupId: "group-1",
  fromUserId: "user-1",
  toUserId: "user-2",
  amount: decimal(25),
  currency: "USD",
  status: "PENDING",
  note: null,
  decisionNote: null,
  createdAt: new Date(),
  decidedAt: null,
  fromUser: { id: "user-1", name: "Alice", email: "alice@example.com" },
  toUser: { id: "user-2", name: "Bob", email: "bob@example.com" },
};

describe("settlement payment workflow", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockVerifyAccessToken.mockReturnValue({ sub: "user-1", email: "alice@example.com" });
    mockRequireRole.mockResolvedValue({ role: "MEMBER" });
    mockPrisma.group.findUnique.mockResolvedValue({
      currency: "USD",
      members: [{ userId: "user-1" }, { userId: "user-2" }, { userId: "user-3" }],
    });
    mockPrisma.settlementPayment.findFirst.mockResolvedValue(null);
    mockPrisma.settlementPayment.create.mockResolvedValue(pendingPayment);
    mockGetSettlements.mockResolvedValue({
      settlements: [{ from: "user-1", fromName: "Alice", to: "user-2", toName: "Bob", amount: 25 }],
    });
  });

  it("derives the sender from the authenticated identity", async () => {
    const response = await request(app)
      .post("/api/groups/group-1/settlement-payments")
      .set("Authorization", "Bearer valid-token")
      .send({ fromUserId: "victim", toUserId: "user-2", amount: 25 });

    expect(response.status).toBe(201);
    expect(mockPrisma.settlementPayment.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ fromUserId: "user-1", toUserId: "user-2", amount: 25 }),
    }));
    expect(response.body.data.fromUserId).toBe("user-1");
  });

  it("rejects a transfer that is not in the sender's current plan", async () => {
    mockGetSettlements.mockResolvedValueOnce({
      settlements: [{ from: "user-3", fromName: "Chris", to: "user-2", toName: "Bob", amount: 25 }],
    });

    await expect(
      settlementPaymentService.create("group-1", { toUserId: "user-2", amount: 25 }, "user-1")
    ).rejects.toThrow("no longer part of the current settlement plan");
    expect(mockPrisma.settlementPayment.create).not.toHaveBeenCalled();
  });

  it("prevents duplicate pending payments for the same pair", async () => {
    mockPrisma.settlementPayment.findFirst.mockResolvedValueOnce({ id: "existing" });

    await expect(
      settlementPaymentService.create("group-1", { toUserId: "user-2", amount: 25 }, "user-1")
    ).rejects.toThrow("already waiting for confirmation");
    expect(mockGetSettlements).not.toHaveBeenCalled();
  });

  it("allows only the receiving member to confirm a pending payment", async () => {
    mockPrisma.settlementPayment.findFirst.mockResolvedValue({
      id: "payment-1",
      fromUserId: "user-1",
      toUserId: "user-2",
      status: "PENDING",
    });

    await expect(
      settlementPaymentService.confirm("group-1", "payment-1", "user-1")
    ).rejects.toThrow("Only the receiving member");
    expect(mockPrisma.settlementPayment.updateMany).not.toHaveBeenCalled();

    mockPrisma.settlementPayment.updateMany.mockResolvedValue({ count: 1 });
    mockPrisma.settlementPayment.findUnique.mockResolvedValue({
      ...pendingPayment,
      status: "CONFIRMED",
      decidedAt: new Date(),
    });
    const result = await settlementPaymentService.confirm("group-1", "payment-1", "user-2");

    expect(result.status).toBe("CONFIRMED");
    expect(mockPrisma.settlementPayment.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "payment-1", groupId: "group-1", status: "PENDING" },
      data: expect.objectContaining({ status: "CONFIRMED" }),
    }));
  });

  it("allows only the sender to cancel a pending payment", async () => {
    mockPrisma.settlementPayment.findFirst.mockResolvedValue({
      id: "payment-1",
      fromUserId: "user-1",
      toUserId: "user-2",
      status: "PENDING",
    });

    await expect(
      settlementPaymentService.cancel("group-1", "payment-1", "user-2")
    ).rejects.toThrow("Only the sender");
    expect(mockPrisma.settlementPayment.updateMany).not.toHaveBeenCalled();
  });
});
