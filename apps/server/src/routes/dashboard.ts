import { Router } from "express";
import { Prisma } from "@prisma/client";
import prisma from "../lib/prisma.js";
import { asyncHandler } from "../middleware/errorHandler.js";
import { requireAuth } from "../middleware/auth.js";
import { solveDebts } from "../wasm/wasmLoader.js";
import type { DebtEdge, Settlement } from "../types/api.js";

const router = Router();
router.use(requireAuth);

interface EdgeRow {
  groupId: string;
  fromUserId: string;
  fromName: string;
  toUserId: string;
  toName: string;
  amount: Prisma.Decimal | number | string;
}

router.get(
  "/stats",
  asyncHandler(async (req, res) => {
    const userId = req.userId!;
    const memberships = await prisma.groupMember.findMany({
      where: { userId },
      select: {
        group: {
          select: {
            id: true,
            name: true,
            description: true,
            currency: true,
            _count: {
              select: {
                members: true,
                transactions: { where: { status: "COMPLETED" } },
              },
            },
          },
        },
      },
    });
    const groups = memberships.map((membership) => membership.group);
    const groupIds = groups.map((group) => group.id);

    const [pendingRows, recentActivity, edgeRows] = await Promise.all([
      prisma.settlementPayment.findMany({
        where: {
          groupId: { in: groupIds },
          status: "PENDING",
          OR: [{ fromUserId: userId }, { toUserId: userId }],
        },
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          groupId: true,
          fromUserId: true,
          toUserId: true,
          amount: true,
          currency: true,
          createdAt: true,
          group: { select: { name: true } },
          fromUser: { select: { name: true } },
          toUser: { select: { name: true } },
        },
      }),
      prisma.auditLog.findMany({
        where: { groupId: { in: groupIds } },
        orderBy: { createdAt: "desc" },
        take: 8,
        include: {
          user: { select: { id: true, name: true, email: true, avatarUrl: true } },
          group: { select: { id: true, name: true } },
        },
      }),
      getAggregatedEdges(groupIds),
    ]);

    const edgesByGroup = new Map<string, DebtEdge[]>();
    const namesByGroup = new Map<string, Map<string, string>>();
    for (const row of edgeRows) {
      const edges = edgesByGroup.get(row.groupId) ?? [];
      edges.push({ from: row.fromUserId, to: row.toUserId, amount: Number(row.amount) });
      edgesByGroup.set(row.groupId, edges);

      const names = namesByGroup.get(row.groupId) ?? new Map<string, string>();
      names.set(row.fromUserId, row.fromName);
      names.set(row.toUserId, row.toName);
      namesByGroup.set(row.groupId, names);
    }

    const settlementPlans = await Promise.all(groups.map(async (group) => {
      const outcome = await solveDebts(edgesByGroup.get(group.id) ?? [], namesByGroup.get(group.id) ?? new Map());
      return { group, settlements: outcome.settlements };
    }));

    const pendingOutgoingPairs = new Set(
      pendingRows
        .filter((payment) => payment.fromUserId === userId)
        .map((payment) => `${payment.groupId}:${payment.fromUserId}:${payment.toUserId}`)
    );
    const toDashboardSettlement = (group: typeof groups[number], settlement: Settlement) => ({
      groupId: group.id,
      groupName: group.name,
      currency: group.currency,
      fromUserId: settlement.from,
      fromName: settlement.fromName,
      toUserId: settlement.to,
      toName: settlement.toName,
      amount: settlement.amount,
      state: pendingOutgoingPairs.has(`${group.id}:${settlement.from}:${settlement.to}`)
        ? "PENDING_CONFIRMATION" as const
        : "OPEN" as const,
    });

    const outgoingSettlements = settlementPlans.flatMap(({ group, settlements }) =>
      settlements.filter((settlement) => settlement.from === userId).map((settlement) => toDashboardSettlement(group, settlement))
    );
    const incomingSettlements = settlementPlans.flatMap(({ group, settlements }) =>
      settlements.filter((settlement) => settlement.to === userId).map((settlement) => toDashboardSettlement(group, settlement))
    );

    const pendingConfirmations = pendingRows
      .filter((payment) => payment.toUserId === userId)
      .map((payment) => ({
        id: payment.id,
        groupId: payment.groupId,
        groupName: payment.group.name,
        fromUserId: payment.fromUserId,
        fromName: payment.fromUser.name,
        amount: Number(payment.amount),
        currency: payment.currency,
        createdAt: payment.createdAt,
      }));

    const pendingGroupMap = new Map<string, { groupId: string; groupName: string; pendingCount: number }>();
    for (const payment of pendingConfirmations) {
      const current = pendingGroupMap.get(payment.groupId);
      if (current) current.pendingCount += 1;
      else pendingGroupMap.set(payment.groupId, {
        groupId: payment.groupId,
        groupName: payment.groupName,
        pendingCount: 1,
      });
    }

    res.json({
      success: true,
      data: {
        totalGroups: groups.length,
        totalTransactions: groups.reduce((total, group) => total + group._count.transactions, 0),
        pendingSettlements: pendingConfirmations.length,
        pendingGroups: [...pendingGroupMap.values()],
        groups: groups.map((group) => ({
          id: group.id,
          name: group.name,
          description: group.description,
          currency: group.currency,
          memberCount: group._count.members,
          expenseCount: group._count.transactions,
        })),
        outgoingSettlements,
        incomingSettlements,
        pendingConfirmations,
        recentActivity,
      },
    });
  })
);

async function getAggregatedEdges(groupIds: string[]): Promise<EdgeRow[]> {
  if (groupIds.length === 0) return [];

  return prisma.$queryRaw<EdgeRow[]>(Prisma.sql`
    WITH combined_edges AS (
      SELECT
        transaction."groupId" AS "groupId",
        share."owedById" AS "fromUserId",
        transaction."paidById" AS "toUserId",
        share."amount" AS "amount"
      FROM "debt_shares" AS share
      JOIN "transactions" AS transaction ON transaction."id" = share."transactionId"
      WHERE transaction."groupId" IN (${Prisma.join(groupIds)})
        AND transaction."status" = ${"COMPLETED"}::"TransactionStatus"
        AND share."owedById" <> transaction."paidById"

      UNION ALL

      SELECT
        payment."groupId" AS "groupId",
        payment."toUserId" AS "fromUserId",
        payment."fromUserId" AS "toUserId",
        payment."amount" AS "amount"
      FROM "settlement_payments" AS payment
      WHERE payment."groupId" IN (${Prisma.join(groupIds)})
        AND payment."status" = ${"CONFIRMED"}::"SettlementPaymentStatus"
    )
    SELECT
      edge."groupId",
      edge."fromUserId",
      sender."name" AS "fromName",
      edge."toUserId",
      recipient."name" AS "toName",
      SUM(edge."amount") AS "amount"
    FROM combined_edges AS edge
    JOIN "users" AS sender ON sender."id" = edge."fromUserId"
    JOIN "users" AS recipient ON recipient."id" = edge."toUserId"
    GROUP BY edge."groupId", edge."fromUserId", sender."name", edge."toUserId", recipient."name"
  `);
}

export default router;
