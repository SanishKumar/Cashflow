// ──────────────────────────────────────────────
// Transaction Routes — Identity-Aware
// ──────────────────────────────────────────────

import { Router } from "express";
import { transactionService } from "../services/transactionService.js";
import { auditLogService } from "../services/auditLogService.js";
import { validate } from "../middleware/validate.js";
import { asyncHandler } from "../middleware/errorHandler.js";
import { requireAuth } from "../middleware/auth.js";
import { CreateTransactionSchema } from "../types/api.js";

const router = Router();

// All transaction routes require identity
router.use(requireAuth);

// POST /api/groups/:groupId/transactions — Create a new transaction
router.post(
  "/:groupId/transactions",
  validate(CreateTransactionSchema),
  asyncHandler(async (req, res) => {
    const transaction = await transactionService.create(
      req.params.groupId as string,
      req.body,
      req.userId!
    );

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
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 50;

    const transactions = await transactionService.findByGroup(
      req.params.groupId as string,
      req.userId!,
      page,
      limit
    );
    res.json({ success: true, data: transactions });
  })
);

// GET /api/groups/:groupId/transactions/:id — Get single transaction
router.get(
  "/:groupId/transactions/:id",
  asyncHandler(async (req, res) => {
    const transaction = await transactionService.findById(
      req.params.groupId as string,
      req.params.id as string,
      req.userId!
    );
    res.json({ success: true, data: transaction });
  })
);

// DELETE /api/groups/:groupId/transactions/:id — Delete a transaction
router.delete(
  "/:groupId/transactions/:id",
  asyncHandler(async (req, res) => {
    await transactionService.delete(
      req.params.groupId as string,
      req.params.id as string,
      req.userId!
    );

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
// GET /api/groups/:groupId/settlements — Compute minimized settlements
router.get(
  "/:groupId/settlements",
  asyncHandler(async (req, res) => {
    const settlements = await transactionService.getSettlements(
      req.params.groupId as string,
      req.userId!
    );
    res.json({ success: true, data: settlements });
  })
);

// GET /api/groups/:groupId/obligations — Raw who-owes-whom, before any netting.
// The clearing engine runs in the browser, so the server's job here is only to
// state the facts it holds; the analysis happens client-side.
router.get(
  "/:groupId/obligations",
  asyncHandler(async (req, res) => {
    const graph = await transactionService.getObligationGraph(
      req.params.groupId as string,
      req.userId!
    );

    res.json({
      success: true,
      data: {
        // Minor units keep the clearing arithmetic exact.
        obligations: graph.edges.map((edge) => ({
          from: edge.from,
          to: edge.to,
          amount: Math.round(edge.amount * 100),
        })),
        members: graph.members,
      },
    });
  })
);

export default router;
