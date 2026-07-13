import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockScanReceipt } = vi.hoisted(() => ({
  mockScanReceipt: vi.fn(),
}));

vi.mock("../services/authService.js", () => ({
  authService: {
    verifyAccessToken: vi.fn().mockReturnValue({ sub: "free-user", email: "free@example.com" }),
  },
}));

vi.mock("../services/receiptService.js", () => ({
  scanReceipt: mockScanReceipt,
}));

vi.mock("../middleware/rateLimiter.js", () => ({
  receiptScanLimiter: (_req: unknown, _res: unknown, next: () => void) => next(),
}));

import receiptRoutes from "../routes/receipts.js";
import { errorHandler } from "../middleware/errorHandler.js";

const app = express();
app.use("/api/receipts", receiptRoutes);
app.use(errorHandler);

const scannedReceipt = {
  vendor: "Corner Market",
  date: "2026-07-10",
  total: 12.5,
  currency: "USD",
  category: "groceries",
  items: [],
  confidence: 0.92,
  rawText: "Corner Market\nTOTAL 12.50",
};

const pngImage = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  Buffer.from("test-png-payload"),
]);

describe("Receipt scan API", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockScanReceipt.mockResolvedValue(scannedReceipt);
  });

  it("accepts an authenticated PNG upload and returns structured receipt data", async () => {
    const response = await request(app)
      .post("/api/receipts/scan")
      .set("Authorization", "Bearer valid-token")
      .field("ocrConsent", "true")
      .attach("receipt", pngImage, { filename: "receipt.png", contentType: "image/png" });

    expect(response.status).toBe(200);
    expect(response.body.data).toEqual({
      vendor: "Corner Market",
      date: "2026-07-10",
      total: 12.5,
      currency: "USD",
      category: "groceries",
      items: [],
      confidence: 0.92,
    });
    expect(response.body.data).not.toHaveProperty("rawText");
    expect(mockScanReceipt).toHaveBeenCalledWith(expect.any(Buffer), "image/png");
  });

  it("requires explicit OCR processing consent", async () => {
    const response = await request(app)
      .post("/api/receipts/scan")
      .set("Authorization", "Bearer valid-token")
      .attach("receipt", pngImage, { filename: "receipt.png", contentType: "image/png" });

    expect(response.status).toBe(400);
    expect(response.body.error).toContain("Confirm receipt OCR processing");
    expect(mockScanReceipt).not.toHaveBeenCalled();
  });

  it("rejects a spoofed image Content-Type", async () => {
    const response = await request(app)
      .post("/api/receipts/scan")
      .set("Authorization", "Bearer valid-token")
      .field("ocrConsent", "true")
      .attach("receipt", Buffer.from("not actually a PNG"), { filename: "receipt.png", contentType: "image/png" });

    expect(response.status).toBe(400);
    expect(response.body.error).toContain("do not match");
    expect(mockScanReceipt).not.toHaveBeenCalled();
  });

  it("rejects unsupported file types before scanning", async () => {
    const response = await request(app)
      .post("/api/receipts/scan")
      .set("Authorization", "Bearer valid-token")
      .field("ocrConsent", "true")
      .attach("receipt", Buffer.from("not an image"), { filename: "receipt.pdf", contentType: "application/pdf" });

    expect(response.status).toBe(400);
    expect(response.body.error).toContain("JPEG, PNG, WEBP, or HEIC");
    expect(mockScanReceipt).not.toHaveBeenCalled();
  });

  it("requires a receipt image", async () => {
    const response = await request(app)
      .post("/api/receipts/scan")
      .set("Authorization", "Bearer valid-token")
      .field("ocrConsent", "true");

    expect(response.status).toBe(400);
    expect(response.body.error).toContain("receipt image is required");
  });
});
