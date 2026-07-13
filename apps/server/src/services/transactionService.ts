// ──────────────────────────────────────────────
// Transaction Service — Data Access Layer
// ──────────────────────────────────────────────

import prisma from "../lib/prisma.js";
import type {
  CreateTransactionInput,
  DebtEdge,
  UserBalance,
  GroupBalances,
  TransactionWithShares,
} from "../types/api.js";
import { NotFoundError, AppError } from "../middleware/errorHandler.js";
import { solveDebts } from "../wasm/wasmLoader.js";
import { broadcastToGroup } from "../socket/socketServer.js";
import { groupService } from "./groupService.js";

interface DecimalValue {
  toNumber(): number;
}

function toApiTransaction<T extends {
  amount: DecimalValue;
  exchangeRate: DecimalValue | null;
  debtShares: Array<{ amount: DecimalValue }>;
}>(transaction: T): TransactionWithShares {
  return {
    ...transaction,
    amount: transaction.amount.toNumber(),
    exchangeRate: transaction.exchangeRate?.toNumber() ?? null,
    debtShares: transaction.debtShares.map((share) => ({
      ...share,
      amount: share.amount.toNumber(),
    })),
  } as unknown as TransactionWithShares;
}

export class TransactionService {
  /**
   * Create a new transaction with debt shares.
   * Validates that the payer and all debtors are members of the group.
   */
  async create(groupId: string, data: CreateTransactionInput, requestingUserId: string) {
    await groupService.requireRole(groupId, requestingUserId, ["ADMIN", "MEMBER"]);

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

    let finalAmount = data.amount;
    let finalShares = data.shares;
    let exchangeRate: number | null = null;
    let originalCurrency: string | null = null;

    if (data.currency && data.currency !== group.currency) {
      try {
        const res = await fetch(`https://api.frankfurter.app/latest?amount=1&from=${data.currency}&to=${group.currency}`);
        const json = await res.json() as any;
        exchangeRate = json.rates[group.currency];
        originalCurrency = data.currency;
        finalAmount = data.amount * exchangeRate!;
        finalShares = data.shares.map(s => ({ ...s, amount: s.amount * exchangeRate! }));
      } catch (err) {
        console.error("Currency conversion failed", err);
        throw new AppError("Failed to convert currency. Please try again.", 500);
      }
    }

    // Create transaction with debt shares in a single atomic operation
    const transaction = await prisma.transaction.create({
      data: {
        groupId,
        paidById: data.paidById,
        amount: finalAmount,
        originalCurrency,
        exchangeRate,
        status: "COMPLETED",
        description: data.description,
        debtShares: {
          create: finalShares.map((share) => ({
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
    const apiTransaction = toApiTransaction(transaction);

    // Broadcast real-time update to all group members
    try {
      const settlements = await this.getSettlements(groupId);
      broadcastToGroup(groupId, "transaction:created", {
        transaction: apiTransaction,
        settlements: settlements.settlements,
      });
    } catch {
      // Don't fail the transaction creation if broadcast fails
      console.warn(`[WS] Failed to broadcast transaction:created for group ${groupId}`);
    }

    return apiTransaction;
  }

  /**
   * Get all transactions for a group with full details.
   */
  async findByGroup(
    groupId: string,
    requestingUserId: string,
    page: number = 1,
    limit: number = 50
  ) {
    await groupService.requireRole(groupId, requestingUserId, ["ADMIN", "MEMBER", "AUDITOR"]);

    // Validate group exists
    const group = await prisma.group.findUnique({ where: { id: groupId } });
    if (!group) {
      throw new NotFoundError("Group", groupId);
    }

    const transactions = await prisma.transaction.findMany({
      where: { groupId },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * limit,
      take: limit,
      include: {
        paidBy: { select: { id: true, name: true, email: true } },
        debtShares: {
          include: {
            owedBy: { select: { id: true, name: true, email: true } },
          },
        },
      },
    });
    return transactions.map(toApiTransaction);
  }

  /**
   * Get a single transaction by ID.
   */
  async findById(groupId: string, transactionId: string, requestingUserId: string) {
    await groupService.requireRole(groupId, requestingUserId, ["ADMIN", "MEMBER", "AUDITOR"]);

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

    return toApiTransaction(transaction);
  }

  /**
   * Delete a transaction.
   */
  async delete(groupId: string, transactionId: string, requestingUserId: string) {
    await groupService.requireRole(groupId, requestingUserId, "ADMIN");
    await this.findById(groupId, transactionId, requestingUserId);
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

  /** Compute a suggested settlement plan from expenses and confirmed payments. */
  async getSettlements(groupId: string, requestingUserId?: string): Promise<GroupBalances> {
    if (requestingUserId) {
      await groupService.requireRole(groupId, requestingUserId, ["ADMIN", "MEMBER", "AUDITOR"]);
    }

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

    const [transactions, confirmedPayments] = await Promise.all([
      prisma.transaction.findMany({
        where: { groupId, status: "COMPLETED" },
        include: {
          paidBy: { select: { id: true, name: true } },
          debtShares: {
            include: { owedBy: { select: { id: true, name: true } } },
          },
        },
      }),
      prisma.settlementPayment.findMany({
        where: { groupId, status: "CONFIRMED" },
        select: { fromUserId: true, toUserId: true, amount: true },
      }),
    ]);

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
            amount: share.amount.toNumber(),
          });
        }
      }
    }

    // A confirmed payment offsets the original obligation. If A owed B and A
    // paid B, add the reverse edge B -> A for the confirmed amount.
    for (const payment of confirmedPayments) {
      edges.push({
        from: payment.toUserId,
        to: payment.fromUserId,
        amount: payment.amount.toNumber(),
      });
    }

    // Run the solver
    const solver = await solveDebts(edges, userNames);

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
      settlements: solver.settlements,
      solver: {
        engine: solver.engine,
        strategy: solver.strategy,
        exact: solver.exact,
        activeBalances: solver.activeBalances,
      },
    };
  }
}

export const transactionService = new TransactionService();
