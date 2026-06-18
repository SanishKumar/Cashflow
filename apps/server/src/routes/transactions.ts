// ──────────────────────────────────────────────
// Transaction Routes — Identity-Aware
// ──────────────────────────────────────────────

import { Router } from "express";
import { transactionService } from "../services/transactionService.js";
import { auditLogService } from "../services/auditLogService.js";
import { validate } from "../middleware/validate.js";
import { asyncHandler } from "../middleware/errorHandler.js";
import { requireAuth } from "../middleware/auth.js";
import { z } from "zod";
import { CreateTransactionSchema } from "../types/api.js";

const router = Router();

// All transaction routes require identity
router.use(requireAuth);

// POST /api/groups/:groupId/transactions — Create a new transaction
router.post(
  "/:groupId/transactions",
  validate(CreateTransactionSchema),
  asyncHandler(async (req, res) => {
    const transaction = await transactionService.create(req.params.groupId as string, req.body);

    // Audit log
    await auditLogService.log({
      userId: req.userId!,
      groupId: req.params.groupId as string,
      action: "EXPENSE_ADDED",
      details: `Added expense "${req.body.description}" for ${req.body.amount}`,
    });

    res.status(201).json({ success: true, data: transaction });
  })
);

// GET /api/groups/:groupId/transactions — List group transactions
router.get(
  "/:groupId/transactions",
  asyncHandler(async (req, res) => {
    const transactions = await transactionService.findByGroup(req.params.groupId as string);
    res.json({ success: true, data: transactions });
  })
);

// GET /api/groups/:groupId/transactions/:id — Get single transaction
router.get(
  "/:groupId/transactions/:id",
  asyncHandler(async (req, res) => {
    const transaction = await transactionService.findById(
      req.params.groupId as string,
      req.params.id as string
    );
    res.json({ success: true, data: transaction });
  })
);

// DELETE /api/groups/:groupId/transactions/:id — Delete a transaction
router.delete(
  "/:groupId/transactions/:id",
  asyncHandler(async (req, res) => {
    await transactionService.delete(req.params.groupId as string, req.params.id as string);

    // Audit log
    await auditLogService.log({
      userId: req.userId!,
      groupId: req.params.groupId as string,
      action: "EXPENSE_DELETED",
      details: `Deleted transaction ${req.params.id}`,
    });

    res.json({ success: true, message: "Transaction deleted" });
  })
);

// PATCH /api/groups/:groupId/transactions/:id/status — Update status
router.patch(
  "/:groupId/transactions/:id/status",
  validate(z.object({ status: z.enum(["COMPLETED", "PENDING", "REJECTED"]) })),
  asyncHandler(async (req, res) => {
    const updated = await transactionService.updateStatus(
      req.params.groupId as string,
      req.params.id as string,
      req.body.status
    );

    // Audit log
    await auditLogService.log({
      userId: req.userId!,
      groupId: req.params.groupId as string,
      action: `TRANSACTION_${req.body.status}`,
      details: `Marked transaction as ${req.body.status.toLowerCase()}`,
    });

    res.json({ success: true, data: updated });
  })
);

// GET /api/groups/:groupId/settlements — Compute minimized settlements
router.get(
  "/:groupId/settlements",
  asyncHandler(async (req, res) => {
    const settlements = await transactionService.getSettlements(req.params.groupId as string);
    res.json({ success: true, data: settlements });
  })
);

export default router;
