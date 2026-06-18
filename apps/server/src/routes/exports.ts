/**
 * Export Routes
 *
 * GET /api/groups/:groupId/export/csv — Download CSV ledger
 * GET /api/groups/:groupId/export/pdf — Download PDF settlements
 */

import { Router } from "express";
import { exportService } from "../services/exportService.js";
import { groupService } from "../services/groupService.js";
import { auditLogService } from "../services/auditLogService.js";
import { asyncHandler } from "../middleware/errorHandler.js";
import { requireAuth } from "../middleware/auth.js";

const router = Router({ mergeParams: true });

// All export routes require authentication
router.use(requireAuth);

// GET /api/groups/:groupId/export/csv
router.get(
  "/csv",
  asyncHandler(async (req, res) => {
    const groupId = req.params.groupId as string;
    
    // Verify membership (any role can export)
    await groupService.requireRole(groupId, req.userId!, ["ADMIN", "MEMBER", "AUDITOR"]);

    const { filename, content } = await exportService.generateLedgerCSV(groupId);

    // Audit log
    await auditLogService.log({
      userId: req.userId!,
      groupId,
      action: "EXPORT_CSV",
      details: "Exported group ledger to CSV",
    });

    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.send(content);
  })
);

// GET /api/groups/:groupId/export/pdf
router.get(
  "/pdf",
  asyncHandler(async (req, res) => {
    const groupId = req.params.groupId as string;

    // Verify membership
    await groupService.requireRole(groupId, req.userId!, ["ADMIN", "MEMBER", "AUDITOR"]);

    const { filename, buffer } = await exportService.generateSettlementPDF(groupId);

    // Audit log
    await auditLogService.log({
      userId: req.userId!,
      groupId,
      action: "EXPORT_PDF",
      details: "Exported settlement plan to PDF",
    });

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.send(buffer);
  })
);

export default router;
