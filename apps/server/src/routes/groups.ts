// ──────────────────────────────────────────────
// Group Routes
// ──────────────────────────────────────────────

import { Router } from "express";
import { groupService } from "../services/groupService.js";
import { validate } from "../middleware/validate.js";
import { asyncHandler } from "../middleware/errorHandler.js";
import { CreateGroupSchema, UpdateGroupSchema, AddMemberSchema } from "../types/api.js";

const router = Router();

// POST /api/groups — Create a new group
router.post(
  "/",
  validate(CreateGroupSchema),
  asyncHandler(async (req, res) => {
    const group = await groupService.create(req.body);
    res.status(201).json({ success: true, data: group });
  })
);

// GET /api/groups — List all groups
router.get(
  "/",
  asyncHandler(async (_req, res) => {
    const groups = await groupService.findAll();
    res.json({ success: true, data: groups });
  })
);

// GET /api/groups/:id — Get group details
router.get(
  "/:id",
  asyncHandler(async (req, res) => {
    const group = await groupService.findById(req.params.id);
    res.json({ success: true, data: group });
  })
);

// PATCH /api/groups/:id — Update a group
router.patch(
  "/:id",
  validate(UpdateGroupSchema),
  asyncHandler(async (req, res) => {
    const group = await groupService.update(req.params.id, req.body);
    res.json({ success: true, data: group });
  })
);

// DELETE /api/groups/:id — Delete a group
router.delete(
  "/:id",
  asyncHandler(async (req, res) => {
    await groupService.delete(req.params.id);
    res.json({ success: true, message: "Group deleted" });
  })
);

// ── Member Management ──────────────────────────

// POST /api/groups/:id/members — Add member to group
router.post(
  "/:id/members",
  validate(AddMemberSchema),
  asyncHandler(async (req, res) => {
    const member = await groupService.addMember(req.params.id, req.body.userId);
    res.status(201).json({ success: true, data: member });
  })
);

// DELETE /api/groups/:id/members/:userId — Remove member from group
router.delete(
  "/:id/members/:userId",
  asyncHandler(async (req, res) => {
    await groupService.removeMember(req.params.id, req.params.userId);
    res.json({ success: true, message: "Member removed from group" });
  })
);

export default router;
