// ──────────────────────────────────────────────
// Transaction Routes
// ──────────────────────────────────────────────

import { Router } from "express";
import { transactionService } from "../services/transactionService.js";
import { validate } from "../middleware/validate.js";
import { asyncHandler } from "../middleware/errorHandler.js";
import { z } from "zod";
import { CreateTransactionSchema } from "../types/api.js";

const router = Router();

// POST /api/groups/:groupId/transactions — Create a new transaction
router.post(
  "/:groupId/transactions",
  validate(CreateTransactionSchema),
  asyncHandler(async (req, res) => {
    const transaction = await transactionService.create(req.params.groupId as string, req.body);
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
