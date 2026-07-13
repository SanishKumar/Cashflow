import prisma from "../lib/prisma.js";
import { AppError, AuthorizationError, ConflictError, NotFoundError } from "../lib/errors.js";
import type { CreateSettlementPaymentInput } from "../types/api.js";
import { broadcastToGroup } from "../socket/socketServer.js";
import { groupService } from "./groupService.js";
import { transactionService } from "./transactionService.js";

const paymentInclude = {
  fromUser: { select: { id: true, name: true, email: true } },
  toUser: { select: { id: true, name: true, email: true } },
} as const;

interface DecimalValue {
  toNumber(): number;
}

function toApiPayment<T extends { amount: DecimalValue }>(payment: T) {
  return { ...payment, amount: payment.amount.toNumber() };
}

async function broadcastCurrentPlan(groupId: string) {
  try {
    const plan = await transactionService.getSettlements(groupId);
    broadcastToGroup(groupId, "settlements:updated", plan.settlements);
  } catch {
    console.warn(`[WS] Failed to broadcast settlement payment update for group ${groupId}`);
  }
}

export class SettlementPaymentService {
  async list(
    groupId: string,
    requestingUserId: string,
    status?: "PENDING" | "CONFIRMED" | "REJECTED" | "CANCELLED"
  ) {
    await groupService.requireRole(groupId, requestingUserId, ["ADMIN", "MEMBER", "AUDITOR"]);

    const payments = await prisma.settlementPayment.findMany({
      where: { groupId, ...(status ? { status } : {}) },
      include: paymentInclude,
      orderBy: { createdAt: "desc" },
    });

    return payments.map(toApiPayment);
  }

  async create(groupId: string, input: CreateSettlementPaymentInput, requestingUserId: string) {
    await groupService.requireRole(groupId, requestingUserId, ["ADMIN", "MEMBER"]);

    const group = await prisma.group.findUnique({
      where: { id: groupId },
      select: { currency: true, members: { select: { userId: true } } },
    });
    if (!group) throw new NotFoundError("Group", groupId);
    if (input.toUserId === requestingUserId) {
      throw new AppError("A settlement payment must be sent to another group member", 400, "INVALID_SETTLEMENT_PAYMENT");
    }
    if (!group.members.some((member) => member.userId === input.toUserId)) {
      throw new AppError("The recipient is not a member of this group", 400, "INVALID_SETTLEMENT_RECIPIENT");
    }

    const existingPending = await prisma.settlementPayment.findFirst({
      where: {
        groupId,
        fromUserId: requestingUserId,
        toUserId: input.toUserId,
        status: "PENDING",
      },
      select: { id: true },
    });
    if (existingPending) {
      throw new ConflictError("A payment to this member is already waiting for confirmation");
    }

    const plan = await transactionService.getSettlements(groupId, requestingUserId);
    const suggestion = plan.settlements.find(
      (settlement) => settlement.from === requestingUserId && settlement.to === input.toUserId
    );
    const requestedCents = Math.round(input.amount * 100);
    const suggestedCents = suggestion ? Math.round(suggestion.amount * 100) : 0;
    if (!suggestion || requestedCents > suggestedCents) {
      throw new ConflictError("This payment is no longer part of the current settlement plan. Refresh and review the latest plan.");
    }

    const payment = await prisma.settlementPayment.create({
      data: {
        groupId,
        fromUserId: requestingUserId,
        toUserId: input.toUserId,
        amount: input.amount,
        currency: group.currency,
        note: input.note || null,
      },
      include: paymentInclude,
    });

    await broadcastCurrentPlan(groupId);
    return toApiPayment(payment);
  }

  async confirm(groupId: string, paymentId: string, requestingUserId: string, decisionNote?: string) {
    return this.decide(groupId, paymentId, requestingUserId, "CONFIRMED", decisionNote);
  }

  async reject(groupId: string, paymentId: string, requestingUserId: string, decisionNote?: string) {
    return this.decide(groupId, paymentId, requestingUserId, "REJECTED", decisionNote);
  }

  async cancel(groupId: string, paymentId: string, requestingUserId: string, decisionNote?: string) {
    return this.decide(groupId, paymentId, requestingUserId, "CANCELLED", decisionNote);
  }

  private async decide(
    groupId: string,
    paymentId: string,
    requestingUserId: string,
    status: "CONFIRMED" | "REJECTED" | "CANCELLED",
    decisionNote?: string
  ) {
    await groupService.requireRole(groupId, requestingUserId, ["ADMIN", "MEMBER", "AUDITOR"]);

    const payment = await prisma.settlementPayment.findFirst({
      where: { id: paymentId, groupId },
      select: { id: true, fromUserId: true, toUserId: true, status: true },
    });
    if (!payment) throw new NotFoundError("Settlement payment", paymentId);
    if (payment.status !== "PENDING") {
      throw new ConflictError(`This payment has already been ${payment.status.toLowerCase()}`);
    }

    const mustBeSender = status === "CANCELLED";
    const authorizedUserId = mustBeSender ? payment.fromUserId : payment.toUserId;
    if (requestingUserId !== authorizedUserId) {
      throw new AuthorizationError(
        mustBeSender
          ? "Only the sender can cancel this payment"
          : "Only the receiving member can confirm or reject this payment"
      );
    }

    const update = await prisma.settlementPayment.updateMany({
      where: { id: paymentId, groupId, status: "PENDING" },
      data: { status, decidedAt: new Date(), decisionNote: decisionNote || null },
    });
    if (update.count !== 1) {
      throw new ConflictError("This payment was updated by another member. Refresh to see its current status.");
    }

    const updated = await prisma.settlementPayment.findUnique({
      where: { id: paymentId },
      include: paymentInclude,
    });
    if (!updated) throw new NotFoundError("Settlement payment", paymentId);

    await broadcastCurrentPlan(groupId);
    return toApiPayment(updated);
  }
}

export const settlementPaymentService = new SettlementPaymentService();
