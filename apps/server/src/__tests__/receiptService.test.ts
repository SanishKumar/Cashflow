import { afterEach, describe, expect, it, vi } from "vitest";
import { scanReceipt } from "../services/receiptService.js";

describe("receiptService", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("sends receipt uploads to OCR.space Engine 3 and parses the returned text", async () => {
    vi.stubEnv("OCR_SPACE_API_KEY", "test-ocr-space-key");
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        IsErroredOnProcessing: false,
        ParsedResults: [{
          ParsedText: "Corner Market\n2026-07-10\nMilk 1 x 2.50\nSubtotal 2.50\nTax 0.20\nTOTAL 2.70",
        }],
      }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await scanReceipt(Buffer.from("receipt-image"), "image/png");

    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, options] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://api.ocr.space/parse/image");
    expect(options.headers).toEqual({ apikey: "test-ocr-space-key" });

    const formData = options.body as FormData;
    expect(formData.get("OCREngine")).toBe("3");
    expect(formData.get("language")).toBe("auto");
    expect(formData.get("isTable")).toBe("true");
    expect(formData.get("file")).toBeInstanceOf(Blob);

    expect(result).toMatchObject({
      vendor: "Corner Market",
      date: "2026-07-10",
      total: 2.7,
      subtotal: 2.5,
      tax: 0.2,
      currency: "USD",
      category: "groceries",
      items: [{ name: "Milk", quantity: 1, price: 2.5 }],
    });
  });
});
