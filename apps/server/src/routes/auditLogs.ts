/**
 * Audit Log Routes — Paginated Activity Feed
 *
 * GET /api/audit-logs                 — User's activity (paginated)
 * GET /api/audit-logs/group/:groupId  — Group activity (paginated)
 *
 * Query params:
 *   ?page=1&limit=50           — Pagination
 *   ?actions=EXPENSE_ADDED,SETTLEMENT_COMPLETED  — Filter by action types
 *   ?startDate=2024-01-01&endDate=2024-12-31     — Date range
 */

import { Router } from "express";
import { auditLogService } from "../services/auditLogService.js";
import { asyncHandler } from "../middleware/errorHandler.js";
import { requireAuth } from "../middleware/auth.js";
import type { AuditAction } from "@prisma/client";

const router = Router();

router.use(requireAuth);

function parseQueryOptions(query: Record<string, any>) {
  return {
    page: query.page ? parseInt(query.page as string, 10) : 1,
    limit: query.limit ? parseInt(query.limit as string, 10) : 50,
    actions: query.actions
      ? (query.actions as string).split(",").map((a) => a.trim() as AuditAction)
      : undefined,
    startDate: query.startDate ? new Date(query.startDate as string) : undefined,
    endDate: query.endDate ? new Date(query.endDate as string) : undefined,
  };
}

// GET /api/audit-logs — User's activity feed (paginated)
router.get(
  "/",
  asyncHandler(async (req, res) => {
    const options = parseQueryOptions(req.query);
    const result = await auditLogService.findByUser(req.userId!, options);
    res.json({ success: true, data: result });
  })
);

// GET /api/audit-logs/group/:groupId — Group activity (paginated)
router.get(
  "/group/:groupId",
  asyncHandler(async (req, res) => {
    const options = parseQueryOptions(req.query);
    const result = await auditLogService.findByGroup(
      req.params.groupId as string,
      options
    );
    res.json({ success: true, data: result });
  })
);

export default router;
