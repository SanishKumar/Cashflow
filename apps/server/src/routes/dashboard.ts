/**
 * Dashboard Routes — Aggregated KPI Stats
 *
 * GET /api/dashboard/stats — Returns aggregated analytics for the
 * authenticated user across all their groups.
 */

import { Router } from "express";
import prisma from "../lib/prisma.js";
import { asyncHandler } from "../middleware/errorHandler.js";
import { requireAuth } from "../middleware/auth.js";

const router = Router();

router.use(requireAuth);

// GET /api/dashboard/stats
router.get(
  "/stats",
  asyncHandler(async (req, res) => {
    const userId = req.userId!;

    // Get all groups the user belongs to
    const memberships = await prisma.groupMember.findMany({
      where: { userId },
      select: { groupId: true },
    });
    const groupIds = memberships.map((m) => m.groupId);

    // Parallel queries for efficiency
    const [
      totalGroups,
      totalTransactions,
      volumeResult,
      pendingSettlementsCount,
      recentActivity,
      monthlyVolume,
    ] = await Promise.all([
      // Total groups
      Promise.resolve(groupIds.length),

      // Total transactions across all groups
      prisma.transaction.count({
        where: { groupId: { in: groupIds } },
      }),

      // Total volume (sum of all transaction amounts)
      prisma.transaction.aggregate({
        where: { groupId: { in: groupIds } },
        _sum: { amount: true },
      }),

      // Pending transactions count
      prisma.transaction.count({
        where: {
          groupId: { in: groupIds },
          status: "PENDING",
        },
      }),

      // Recent activity (last 10 audit log entries)
      prisma.auditLog.findMany({
        where: { userId },
        orderBy: { createdAt: "desc" },
        take: 10,
        include: {
          user: { select: { id: true, name: true, email: true, avatarUrl: true } },
          group: { select: { id: true, name: true } },
        },
      }),

      // Monthly volume: last 6 months of transaction data
      getMonthlyVolume(groupIds),
    ]);

    // Calculate net position across all groups
    const netPosition = await calculateNetPosition(userId, groupIds);

    res.json({
      success: true,
      data: {
        totalGroups,
        totalTransactions,
        totalVolume: volumeResult._sum.amount ?? 0,
        pendingSettlements: pendingSettlementsCount,
        netPosition,
        recentActivity,
        monthlyVolume,
      },
    });
  })
);

/**
 * Calculate the user's net balance across all groups.
 * Positive = others owe you. Negative = you owe others.
 */
async function calculateNetPosition(userId: string, groupIds: string[]): Promise<number> {
  if (groupIds.length === 0) return 0;

  // Total amount paid by this user
  const paidResult = await prisma.transaction.aggregate({
    where: {
      groupId: { in: groupIds },
      paidById: userId,
      status: { not: "REJECTED" },
    },
    _sum: { amount: true },
  });

  // Total debt shares assigned to this user
  const owedResult = await prisma.debtShare.aggregate({
    where: {
      transaction: {
        groupId: { in: groupIds },
        status: { not: "REJECTED" },
      },
      owedById: userId,
    },
    _sum: { amount: true },
  });

  const totalPaid = paidResult._sum.amount ?? 0;
  const totalOwed = owedResult._sum.amount ?? 0;

  return Math.round((totalPaid - totalOwed) * 100) / 100;
}

/**
 * Get monthly transaction volume for the last 6 months.
 * Returns an array of { month: "2026-01", volume: 1234.56 }.
 */
async function getMonthlyVolume(
  groupIds: string[]
): Promise<{ month: string; volume: number }[]> {
  if (groupIds.length === 0) {
    return generateEmptyMonths();
  }

  const sixMonthsAgo = new Date();
  sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 5);
  sixMonthsAgo.setDate(1);
  sixMonthsAgo.setHours(0, 0, 0, 0);

  const transactions = await prisma.transaction.findMany({
    where: {
      groupId: { in: groupIds },
      createdAt: { gte: sixMonthsAgo },
      status: { not: "REJECTED" },
    },
    select: { amount: true, createdAt: true },
  });

  // Aggregate by month
  const monthMap = new Map<string, number>();
  for (const tx of transactions) {
    const key = `${tx.createdAt.getFullYear()}-${String(tx.createdAt.getMonth() + 1).padStart(2, "0")}`;
    monthMap.set(key, (monthMap.get(key) ?? 0) + tx.amount);
  }

  // Fill in all 6 months (even if no transactions)
  const result: { month: string; volume: number }[] = [];
  for (let i = 0; i < 6; i++) {
    const d = new Date();
    d.setMonth(d.getMonth() - (5 - i));
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    result.push({ month: key, volume: Math.round((monthMap.get(key) ?? 0) * 100) / 100 });
  }

  return result;
}

function generateEmptyMonths(): { month: string; volume: number }[] {
  const result: { month: string; volume: number }[] = [];
  for (let i = 0; i < 6; i++) {
    const d = new Date();
    d.setMonth(d.getMonth() - (5 - i));
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    result.push({ month: key, volume: 0 });
  }
  return result;
}

export default router;
