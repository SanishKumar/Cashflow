import { Router } from "express";
import multer from "multer";
import { requireAuth } from "../middleware/auth.js";
import { asyncHandler } from "../middleware/errorHandler.js";
import { receiptScanLimiter } from "../middleware/rateLimiter.js";
import { ValidationError } from "../lib/errors.js";
import { scanReceipt } from "../services/receiptService.js";

const router = Router();
const ACCEPTED_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/heic"]);

const receiptUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, callback) => {
    if (ACCEPTED_IMAGE_TYPES.has(file.mimetype)) {
      callback(null, true);
      return;
    }
    callback(new ValidationError("Receipt must be a JPEG, PNG, WEBP, or HEIC image"));
  },
});

router.use(requireAuth);

// POST /api/receipts/scan
router.post(
  "/scan",
  receiptScanLimiter,
  receiptUpload.single("receipt"),
  asyncHandler(async (req, res) => {
    if (!req.file) throw new ValidationError("A receipt image is required");

    const receipt = await scanReceipt(req.file.buffer, req.file.mimetype);
    res.json({ success: true, data: receipt });
  })
);

export default router;
