// ──────────────────────────────────────────────
// Transaction Service — Data Access Layer
// ──────────────────────────────────────────────

import prisma from "../lib/prisma.js";
import type {
  CreateTransactionInput,
  DebtEdge,
  Settlement,
  UserBalance,
  GroupBalances,
} from "../types/api.js";
import { NotFoundError, AppError } from "../middleware/errorHandler.js";
import { minimizeDebts } from "./solver.js";
import { broadcastToGroup } from "../socket/socketServer.js";

export class TransactionService {
  /**
   * Create a new transaction with debt shares.
   * Validates that the payer and all debtors are members of the group.
   */
  async create(groupId: string, data: CreateTransactionInput) {
    // Validate group exists
    const group = await prisma.group.findUnique({
      where: { id: groupId },
      include: { members: true },
    });
    if (!group) {
      throw new NotFoundError("Group", groupId);
    }

    // Validate payer is a group member
    const memberIds = new Set(group.members.map((m) => m.userId));
    if (!memberIds.has(data.paidById)) {
      throw new AppError(`Payer '${data.paidById}' is not a member of group '${groupId}'`, 400);
    }

    // Validate all debtors are group members
    for (const share of data.shares) {
      if (!memberIds.has(share.owedById)) {
        throw new AppError(
          `User '${share.owedById}' in debt shares is not a member of group '${groupId}'`,
          400
        );
      }
    }

    // Validate share amounts sum correctly (optional: allow partial splits)
    const shareTotal = data.shares.reduce((sum, s) => sum + s.amount, 0);
    if (Math.abs(shareTotal - data.amount) > 0.01) {
      throw new AppError(
        `Debt shares total ($${shareTotal.toFixed(2)}) does not match transaction amount ($${data.amount.toFixed(2)})`,
        400
      );
    }

    // Create transaction with debt shares in a single atomic operation
    const transaction = await prisma.transaction.create({
      data: {
        groupId,
        paidById: data.paidById,
        amount: data.amount,
        description: data.description,
        debtShares: {
          create: data.shares.map((share) => ({
            owedById: share.owedById,
            amount: share.amount,
          })),
        },
      },
      include: {
        paidBy: { select: { id: true, name: true, email: true } },
        debtShares: {
          include: {
            owedBy: { select: { id: true, name: true, email: true } },
          },
        },
      },
    });

    // Broadcast real-time update to all group members
    try {
      const settlements = await this.getSettlements(groupId);
      broadcastToGroup(groupId, "transaction:created", {
        transaction,
        settlements: settlements.settlements,
      });
    } catch {
      // Don't fail the transaction creation if broadcast fails
      console.warn(`[WS] Failed to broadcast transaction:created for group ${groupId}`);
    }

    return transaction;
  }

  /**
   * Get all transactions for a group with full details.
   */
  async findByGroup(groupId: string) {
    // Validate group exists
    const group = await prisma.group.findUnique({ where: { id: groupId } });
    if (!group) {
      throw new NotFoundError("Group", groupId);
    }

    return prisma.transaction.findMany({
      where: { groupId },
      orderBy: { createdAt: "desc" },
      include: {
        paidBy: { select: { id: true, name: true, email: true } },
        debtShares: {
          include: {
            owedBy: { select: { id: true, name: true, email: true } },
          },
        },
      },
    });
  }

  /**
   * Get a single transaction by ID.
   */
  async findById(groupId: string, transactionId: string) {
    const transaction = await prisma.transaction.findFirst({
      where: { id: transactionId, groupId },
      include: {
        paidBy: { select: { id: true, name: true, email: true } },
        debtShares: {
          include: {
            owedBy: { select: { id: true, name: true, email: true } },
          },
        },
      },
    });

    if (!transaction) {
      throw new NotFoundError("Transaction", transactionId);
    }

    return transaction;
  }

  /**
   * Delete a transaction.
   */
  async delete(groupId: string, transactionId: string) {
    await this.findById(groupId, transactionId);
    const result = await prisma.transaction.delete({ where: { id: transactionId } });

    // Broadcast updated settlements after deletion
    try {
      const settlements = await this.getSettlements(groupId);
      broadcastToGroup(groupId, "settlements:updated", settlements.settlements);
    } catch {
      console.warn(`[WS] Failed to broadcast settlements:updated for group ${groupId}`);
    }

    return result;
  }

  /**
   * Compute minimized settlements for a group.
   *
   * 1. Fetch all transactions and debt shares from the DB.
   * 2. Build a list of directed debt edges.
   * 3. Run the Max Heap solver to minimize the settlement graph.
   * 4. Return balances + minimized settlements.
   */
  async getSettlements(groupId: string): Promise<GroupBalances> {
    const group = await prisma.group.findUnique({
      where: { id: groupId },
      include: {
        members: {
          include: { user: { select: { id: true, name: true } } },
        },
      },
    });

    if (!group) {
      throw new NotFoundError("Group", groupId);
    }

    // Fetch all transactions with shares
    const transactions = await prisma.transaction.findMany({
      where: { groupId },
      include: {
        paidBy: { select: { id: true, name: true } },
        debtShares: {
          include: { owedBy: { select: { id: true, name: true } } },
        },
      },
    });

    // Build user name map
    const userNames = new Map<string, string>();
    for (const member of group.members) {
      userNames.set(member.user.id, member.user.name);
    }

    // Build debt edges from all transactions
    // Each transaction: paidBy paid `amount`, each debtor owes their share
    // Edge: debtor → payer (debtor owes payer their share amount)
    const edges: DebtEdge[] = [];

    for (const tx of transactions) {
      for (const share of tx.debtShares) {
        // Skip self-debts (when the payer is also a debtor for their own share)
        if (share.owedById !== tx.paidById) {
          edges.push({
            from: share.owedById,
            to: tx.paidById,
            amount: share.amount,
          });
        }
      }
    }

    // Run the solver
    const settlements: Settlement[] = minimizeDebts(edges, userNames);

    // Compute per-user balances
    const balanceMap = new Map<string, number>();
    for (const member of group.members) {
      balanceMap.set(member.user.id, 0);
    }
    for (const edge of edges) {
      balanceMap.set(edge.to, (balanceMap.get(edge.to) ?? 0) + edge.amount);
      balanceMap.set(edge.from, (balanceMap.get(edge.from) ?? 0) - edge.amount);
    }

    const balances: UserBalance[] = group.members.map((m) => ({
      userId: m.user.id,
      name: m.user.name,
      netBalance: Math.round((balanceMap.get(m.user.id) ?? 0) * 100) / 100,
    }));

    return {
      groupId,
      balances,
      settlements,
    };
  }
}

export const transactionService = new TransactionService();
