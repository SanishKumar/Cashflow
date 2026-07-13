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
  limits: { fileSize: 5 * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, callback) => {
    if (ACCEPTED_IMAGE_TYPES.has(file.mimetype)) {
      callback(null, true);
      return;
    }
    callback(new ValidationError("Receipt must be a JPEG, PNG, WEBP, or HEIC image"));
  },
});

function detectImageType(buffer: Buffer): string | null {
  if (buffer.length >= 8 && buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
    return "image/png";
  }
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return "image/jpeg";
  }
  if (buffer.length >= 12 && buffer.toString("ascii", 0, 4) === "RIFF" && buffer.toString("ascii", 8, 12) === "WEBP") {
    return "image/webp";
  }
  if (buffer.length >= 12 && buffer.toString("ascii", 4, 8) === "ftyp") {
    const brand = buffer.toString("ascii", 8, 12);
    if (["heic", "heix", "hevc", "hevx", "mif1", "msf1"].includes(brand)) return "image/heic";
  }
  return null;
}

router.use(requireAuth);

// POST /api/receipts/scan
router.post(
  "/scan",
  receiptScanLimiter,
  receiptUpload.single("receipt"),
  asyncHandler(async (req, res) => {
    if (!req.file) throw new ValidationError("A receipt image is required");
    if (req.body.ocrConsent !== "true") {
      throw new ValidationError("Confirm receipt OCR processing before uploading");
    }

    const detectedType = detectImageType(req.file.buffer);
    if (!detectedType || detectedType !== req.file.mimetype) {
      throw new ValidationError("Receipt contents do not match the declared image type");
    }

    const receipt = await scanReceipt(req.file.buffer, detectedType);
    const { rawText, ...safeReceipt } = receipt;
    void rawText;
    res.json({ success: true, data: safeReceipt });
  })
);

export default router;
