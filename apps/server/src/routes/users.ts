// ──────────────────────────────────────────────
// User Routes
// ──────────────────────────────────────────────

import { Router } from "express";
import { userService } from "../services/userService.js";
import { validate } from "../middleware/validate.js";
import { asyncHandler } from "../middleware/errorHandler.js";
import { CreateUserSchema, UpdateUserSchema } from "../types/api.js";

const router = Router();

// POST /api/users — Create a new user
router.post(
  "/",
  validate(CreateUserSchema),
  asyncHandler(async (req, res) => {
    const user = await userService.create(req.body);
    res.status(201).json({ success: true, data: user });
  })
);

// GET /api/users — List all users
router.get(
  "/",
  asyncHandler(async (_req, res) => {
    const users = await userService.findAll();
    res.json({ success: true, data: users });
  })
);

// GET /api/users/:id — Get user by ID
router.get(
  "/:id",
  asyncHandler(async (req, res) => {
    const user = await userService.findById(req.params.id);
    res.json({ success: true, data: user });
  })
);

// PATCH /api/users/:id — Update a user
router.patch(
  "/:id",
  validate(UpdateUserSchema),
  asyncHandler(async (req, res) => {
    const user = await userService.update(req.params.id, req.body);
    res.json({ success: true, data: user });
  })
);

// DELETE /api/users/:id — Delete a user
router.delete(
  "/:id",
  asyncHandler(async (req, res) => {
    await userService.delete(req.params.id);
    res.json({ success: true, message: "User deleted" });
  })
);

export default router;
