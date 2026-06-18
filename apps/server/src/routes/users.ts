/**
 * User Routes — Protected
 *
 * User management endpoints. Listing and reading users is protected
 * by auth. User creation now goes through /api/auth/register instead.
 */

import { Router } from "express";
import { userService } from "../services/userService.js";
import { validate } from "../middleware/validate.js";
import { asyncHandler } from "../middleware/errorHandler.js";
import { requireAuth } from "../middleware/auth.js";
import { UpdateUserSchema } from "../types/api.js";

const router = Router();

// All user routes require auth
router.use(requireAuth);

// GET /api/users — List all users (for member picker, etc.)
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
    const user = await userService.findById(req.params.id as string);
    res.json({ success: true, data: user });
  })
);

// PATCH /api/users/:id — Update a user (only self or admin in future)
router.patch(
  "/:id",
  validate(UpdateUserSchema),
  asyncHandler(async (req, res) => {
    const user = await userService.update(req.params.id as string, req.body);
    res.json({ success: true, data: user });
  })
);

// DELETE /api/users/:id — Delete a user
router.delete(
  "/:id",
  asyncHandler(async (req, res) => {
    await userService.delete(req.params.id as string);
    res.json({ success: true, message: "User deleted" });
  })
);

export default router;
