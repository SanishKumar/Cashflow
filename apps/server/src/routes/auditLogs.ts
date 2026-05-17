// ──────────────────────────────────────────────
// Audit Log Routes
// ──────────────────────────────────────────────

import { Router } from "express";
import { auditLogService } from "../services/auditLogService.js";
import { asyncHandler } from "../middleware/errorHandler.js";
import { requireIdentity } from "../middleware/identity.js";

const router = Router();

router.use(requireIdentity);

// GET /api/audit-logs — Get audit logs for the current user's groups
router.get(
  "/",
  asyncHandler(async (req, res) => {
    const logs = await auditLogService.findByUser(req.userId!);
    res.json({ success: true, data: logs });
  })
);

// GET /api/audit-logs/group/:groupId — Get audit logs for a specific group
router.get(
  "/group/:groupId",
  asyncHandler(async (req, res) => {
    const logs = await auditLogService.findByGroup(req.params.groupId as string);
    res.json({ success: true, data: logs });
  })
);

export default router;
