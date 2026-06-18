// ──────────────────────────────────────────────
// Group Routes — Identity-Aware with RBAC
// ──────────────────────────────────────────────

import { Router } from "express";
import { groupService } from "../services/groupService.js";
import { validate } from "../middleware/validate.js";
import { asyncHandler } from "../middleware/errorHandler.js";
import { requireAuth } from "../middleware/auth.js";
import { CreateGroupSchema, UpdateGroupSchema, AddMemberSchema } from "../types/api.js";
import { z } from "zod";

const router = Router();

// All group routes require identity
router.use(requireAuth);

// POST /api/groups — Create a new group (creator becomes ADMIN)
router.post(
  "/",
  validate(CreateGroupSchema),
  asyncHandler(async (req, res) => {
    const group = await groupService.create(req.body, req.userId!);
    res.status(201).json({ success: true, data: group });
  })
);

// GET /api/groups
router.get(
  "/",
  asyncHandler(async (req, res) => {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 50;

    const groups = await groupService.findAll(req.userId!, page, limit);

    res.json({ success: true, data: groups });
  })
);

// GET /api/groups/:id — Get group details
router.get(
  "/:id",
  asyncHandler(async (req, res) => {
    const group = await groupService.findById(req.params.id as string);
    res.json({ success: true, data: group });
  })
);

// PATCH /api/groups/:id — Update a group (ADMIN only)
router.patch(
  "/:id",
  validate(UpdateGroupSchema),
  asyncHandler(async (req, res) => {
    const group = await groupService.update(req.params.id as string, req.body, req.userId!);
    res.json({ success: true, data: group });
  })
);

// DELETE /api/groups/:id — Delete a group (ADMIN only)
router.delete(
  "/:id",
  asyncHandler(async (req, res) => {
    await groupService.delete(req.params.id as string, req.userId!);
    res.json({ success: true, message: "Group deleted" });
  })
);

// ── Member Management ──────────────────────────

// POST /api/groups/:id/members — Add member (ADMIN only)
router.post(
  "/:id/members",
  validate(AddMemberSchema),
  asyncHandler(async (req, res) => {
    const member = await groupService.addMember(req.params.id as string, req.body.userId, req.userId!);
    res.status(201).json({ success: true, data: member });
  })
);

// DELETE /api/groups/:id/members/:userId — Remove member (ADMIN, or self-leave)
router.delete(
  "/:id/members/:userId",
  asyncHandler(async (req, res) => {
    await groupService.removeMember(req.params.id as string, req.params.userId as string, req.userId!);
    res.json({ success: true, message: "Member removed from group" });
  })
);

// PATCH /api/groups/:id/members/:userId/role — Change member role (ADMIN only)
router.patch(
  "/:id/members/:userId/role",
  validate(z.object({ role: z.enum(["ADMIN", "MEMBER", "AUDITOR"]) })),
  asyncHandler(async (req, res) => {
    const updated = await groupService.changeRole(
      req.params.id as string,
      req.params.userId as string,
      req.body.role,
      req.userId!
    );
    res.json({ success: true, data: updated });
  })
);

export default router;
