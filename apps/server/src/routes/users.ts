/**
 * User Routes — Protected
 *
 * Self-service account endpoints plus an exact-email invite lookup.
 * There is deliberately no global user directory and no route that allows
 * one account to read, update, or delete another account.
 */

import { Router } from "express";
import { userService } from "../services/userService.js";
import { validate } from "../middleware/validate.js";
import { asyncHandler } from "../middleware/errorHandler.js";
import { requireAuth } from "../middleware/auth.js";
import { UpdateUserSchema } from "../types/api.js";
import { z } from "zod";

const router = Router();

// All user routes require auth
router.use(requireAuth);

// POST /api/users/lookup — exact email lookup for an explicit invitation
router.post(
  "/lookup",
  validate(z.object({ email: z.string().email("Enter a valid email address") })),
  asyncHandler(async (req, res) => {
    const user = await userService.findByEmail(req.body.email);
    res.json({ success: true, data: user });
  })
);

// GET /api/users/me — current account only
router.get(
  "/me",
  asyncHandler(async (req, res) => {
    const user = await userService.findById(req.userId!);
    res.json({ success: true, data: user });
  })
);

// PATCH /api/users/me — current account only
router.patch(
  "/me",
  validate(UpdateUserSchema),
  asyncHandler(async (req, res) => {
    const user = await userService.update(req.userId!, req.body);
    res.json({ success: true, data: user });
  })
);

export default router;
