// ──────────────────────────────────────────────
// Transaction Routes
// ──────────────────────────────────────────────

import { Router } from "express";
import { transactionService } from "../services/transactionService.js";
import { validate } from "../middleware/validate.js";
import { asyncHandler } from "../middleware/errorHandler.js";
import { CreateTransactionSchema } from "../types/api.js";

const router = Router();

// POST /api/groups/:groupId/transactions — Create a new transaction
router.post(
  "/:groupId/transactions",
  validate(CreateTransactionSchema),
  asyncHandler(async (req, res) => {
    const transaction = await transactionService.create(req.params.groupId, req.body);
    res.status(201).json({ success: true, data: transaction });
  })
);

// GET /api/groups/:groupId/transactions — List group transactions
router.get(
  "/:groupId/transactions",
  asyncHandler(async (req, res) => {
    const transactions = await transactionService.findByGroup(req.params.groupId);
    res.json({ success: true, data: transactions });
  })
);

// GET /api/groups/:groupId/transactions/:id — Get single transaction
router.get(
  "/:groupId/transactions/:id",
  asyncHandler(async (req, res) => {
    const transaction = await transactionService.findById(
      req.params.groupId,
      req.params.id
    );
    res.json({ success: true, data: transaction });
  })
);

// DELETE /api/groups/:groupId/transactions/:id — Delete a transaction
router.delete(
  "/:groupId/transactions/:id",
  asyncHandler(async (req, res) => {
    await transactionService.delete(req.params.groupId, req.params.id);
    res.json({ success: true, message: "Transaction deleted" });
  })
);

// GET /api/groups/:groupId/settlements — Compute minimized settlements
router.get(
  "/:groupId/settlements",
  asyncHandler(async (req, res) => {
    const settlements = await transactionService.getSettlements(req.params.groupId);
    res.json({ success: true, data: settlements });
  })
);

export default router;
