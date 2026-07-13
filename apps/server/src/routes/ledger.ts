import { Router } from "express";
import prisma from "../lib/prisma.js";
import { requireAuth } from "../middleware/auth.js";
import { asyncHandler } from "../middleware/errorHandler.js";

const router = Router();
router.use(requireAuth);

router.get(
  "/transactions",
  asyncHandler(async (req, res) => {
    const page = Math.max(1, Number.parseInt(req.query.page as string, 10) || 1);
    const requestedLimit = Number.parseInt(req.query.limit as string, 10) || 50;
    const limit = Math.min(100, Math.max(1, requestedLimit));
    const memberships = await prisma.groupMember.findMany({
      where: { userId: req.userId! },
      select: { groupId: true },
    });
    const groupIds = memberships.map((membership) => membership.groupId);
    const where = { groupId: { in: groupIds }, status: "COMPLETED" as const };

    const [transactions, total] = await Promise.all([
      prisma.transaction.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
        select: {
          id: true,
          groupId: true,
          amount: true,
          description: true,
          createdAt: true,
          paidBy: { select: { id: true, name: true } },
          group: { select: { name: true, currency: true } },
        },
      }),
      prisma.transaction.count({ where }),
    ]);

    res.json({
      success: true,
      data: {
        items: transactions.map((transaction) => ({
          id: transaction.id,
          groupId: transaction.groupId,
          groupName: transaction.group.name,
          groupCurrency: transaction.group.currency,
          amount: Number(transaction.amount),
          description: transaction.description,
          createdAt: transaction.createdAt,
          paidBy: transaction.paidBy,
        })),
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    });
  })
);

export default router;
