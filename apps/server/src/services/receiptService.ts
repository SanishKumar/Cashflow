import { createWorker } from "tesseract.js";
import { mkdirSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";

export interface ReceiptItem {
  name: string;
  quantity: number;
  price: number;
}

export interface ReceiptData {
  vendor: string;
  date: string;
  total: number;
  subtotal?: number;
  tax?: number;
  tip?: number;
  currency: string;
  category: string;
  items: ReceiptItem[];
  confidence: number;
  rawText: string;
}

const RECEIPT_PROMPT = `Extract this receipt into the requested JSON shape. Use ISO-8601 YYYY-MM-DD for date when visible, otherwise an empty string. Do not invent values: use 0 for an unavailable total and null for unavailable subtotal, tax, or tip. Identify the final amount charged as total. Infer one lower-case category from groceries, dining, transport, utilities, shopping, entertainment, travel, health, or other. Return individual purchased items only when they are readable.`;
const TESSERACT_CACHE_PATH = join(tmpdir(), "cashflow-tesseract-cache");

const receiptSchema = {
  type: "object",
  additionalProperties: false,
  required: ["vendor", "date", "total", "subtotal", "tax", "tip", "currency", "category", "items", "confidence", "rawText"],
  properties: {
    vendor: { type: "string" },
    date: { type: "string" },
    total: { type: "number" },
    subtotal: { type: ["number", "null"] },
    tax: { type: ["number", "null"] },
    tip: { type: ["number", "null"] },
    currency: { type: "string" },
    category: { type: "string" },
    items: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["name", "quantity", "price"],
        properties: {
          name: { type: "string" },
          quantity: { type: "number" },
          price: { type: "number" },
        },
      },
    },
    confidence: { type: "number" },
    rawText: { type: "string" },
  },
};

function asRecord(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function toNumber(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value.replace(/[^0-9.-]/g, ""));
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  return undefined;
}

function toOptionalNumber(value: unknown): number | undefined {
  return value === null || value === undefined ? undefined : toNumber(value);
}

function detectCurrency(text: string): string {
  if (/₹|\bINR\b/i.test(text)) return "INR";
  if (/€|\bEUR\b/i.test(text)) return "EUR";
  if (/£|\bGBP\b/i.test(text)) return "GBP";
  if (/\bCAD\b/i.test(text)) return "CAD";
  if (/\bAUD\b/i.test(text)) return "AUD";
  return "USD";
}

function categoryFromText(text: string): string {
  const normalized = text.toLowerCase();
  if (/uber|lyft|taxi|metro|fuel|gas station|parking/.test(normalized)) return "transport";
  if (/restaurant|cafe|coffee|pizza|burger|dining|food/.test(normalized)) return "dining";
  if (/grocery|market|supermarket|walmart|vegetable/.test(normalized)) return "groceries";
  if (/hotel|airlines|flight|airbnb/.test(normalized)) return "travel";
  if (/pharmacy|clinic|hospital/.test(normalized)) return "health";
  if (/movie|cinema|streaming|game/.test(normalized)) return "entertainment";
  if (/electric|water bill|internet|utility/.test(normalized)) return "utilities";
  if (/store|mall|shop/.test(normalized)) return "shopping";
  return "other";
}

function dateFromText(text: string): string {
  const isoMatch = text.match(/\b(20\d{2})[-/.](0?[1-9]|1[0-2])[-/.]([0-2]?\d|3[01])\b/);
  if (isoMatch) return `${isoMatch[1]}-${isoMatch[2].padStart(2, "0")}-${isoMatch[3].padStart(2, "0")}`;

  const slashMatch = text.match(/\b(0?[1-9]|[12]\d|3[01])[/.](0?[1-9]|1[0-2])[/.](20\d{2})\b/);
  if (slashMatch) return `${slashMatch[3]}-${slashMatch[2].padStart(2, "0")}-${slashMatch[1].padStart(2, "0")}`;
  return "";
}

function monetaryValues(text: string): number[] {
  return [...text.matchAll(/(?:[$₹€£]|\b(?:USD|INR|EUR|GBP)\s*)?\s*(\d{1,3}(?:,\d{3})*\.\d{2})\b/gi)]
    .map((match) => Number(match[1].replace(/,/g, "")))
    .filter((amount) => Number.isFinite(amount) && amount >= 0);
}

function amountForLabel(text: string, label: RegExp): number | undefined {
  const matches = [...text.matchAll(label)];
  const lastMatch = matches.at(-1);
  return lastMatch ? toNumber(lastMatch[1]) : undefined;
}

function itemLines(text: string): ReceiptItem[] {
  const ignored = /subtotal|total|tax|tip|change|cash|card|visa|mastercard|balance|amount due/i;
  return text.split(/\r?\n/).flatMap((line) => {
    const match = line.trim().match(/^(.+?)\s+(?:(\d+)\s*[x×]\s*)?([$₹€£]?\s*\d{1,3}(?:,\d{3})*\.\d{2})$/i);
    if (!match || ignored.test(match[1])) return [];
    const price = toNumber(match[3]);
    if (price === undefined || !match[1].trim()) return [];
    return [{ name: match[1].trim(), quantity: Number(match[2] || 1), price }];
  }).slice(0, 30);
}

function fallbackParse(rawText: string): ReceiptData {
  const total = amountForLabel(
    rawText,
    /(?:grand\s*total|total\s*due|amount\s*due|balance\s*due|\btotal)\D{0,18}(\d{1,3}(?:,\d{3})*\.\d{2})/gi
  ) ?? Math.max(...monetaryValues(rawText), 0);
  const lines = rawText.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const vendor = lines.find((line) => !/receipt|invoice|date|time|tax|total/i.test(line) && /[a-z]/i.test(line)) ?? "Scanned receipt";
  const subtotal = amountForLabel(rawText, /\bsubtotal\D{0,18}(\d{1,3}(?:,\d{3})*\.\d{2})/gi);
  const tax = amountForLabel(rawText, /\btax\D{0,18}(\d{1,3}(?:,\d{3})*\.\d{2})/gi);
  const tip = amountForLabel(rawText, /\btip\D{0,18}(\d{1,3}(?:,\d{3})*\.\d{2})/gi);
  const items = itemLines(rawText);

  return {
    vendor,
    date: dateFromText(rawText),
    total,
    subtotal,
    tax,
    tip,
    currency: detectCurrency(rawText),
    category: categoryFromText(`${vendor} ${rawText}`),
    items,
    confidence: total > 0 ? (items.length > 0 ? 0.68 : 0.52) : 0.2,
    rawText,
  };
}

function normaliseVisionReceipt(value: unknown): ReceiptData {
  const parsed = asRecord(value);
  const itemValues = Array.isArray(parsed.items) ? parsed.items : [];
  const items = itemValues.flatMap((item) => {
    const record = asRecord(item);
    const price = toNumber(record.price);
    if (!price && price !== 0) return [];
    return [{
      name: typeof record.name === "string" && record.name.trim() ? record.name.trim() : "Receipt item",
      quantity: Math.max(1, toNumber(record.quantity) ?? 1),
      price,
    }];
  });
  const rawText = typeof parsed.rawText === "string" ? parsed.rawText : "";
  const total = Math.max(0, toNumber(parsed.total) ?? 0);
  const confidence = Math.min(1, Math.max(0, toNumber(parsed.confidence) ?? (total > 0 ? 0.8 : 0.35)));

  return {
    vendor: typeof parsed.vendor === "string" && parsed.vendor.trim() ? parsed.vendor.trim() : "Scanned receipt",
    date: typeof parsed.date === "string" ? parsed.date : "",
    total,
    subtotal: toOptionalNumber(parsed.subtotal),
    tax: toOptionalNumber(parsed.tax),
    tip: toOptionalNumber(parsed.tip),
    currency: typeof parsed.currency === "string" && /^[A-Za-z]{3}$/.test(parsed.currency) ? parsed.currency.toUpperCase() : detectCurrency(rawText),
    category: typeof parsed.category === "string" && parsed.category.trim() ? parsed.category.toLowerCase() : categoryFromText(rawText),
    items,
    confidence,
    rawText,
  };
}

async function extractWithVision(image: Buffer, mimetype: string): Promise<ReceiptData> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY is not configured");

  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: process.env.OPENAI_RECEIPT_MODEL || "gpt-5-mini",
      store: false,
      input: [{
        role: "user",
        content: [
          { type: "input_text", text: RECEIPT_PROMPT },
          { type: "input_image", image_url: `data:${mimetype};base64,${image.toString("base64")}`, detail: "high" },
        ],
      }],
      text: {
        format: {
          type: "json_schema",
          name: "receipt_data",
          strict: true,
          schema: receiptSchema,
        },
      },
    }),
  });

  if (!response.ok) throw new Error(`Vision request failed with status ${response.status}`);
  const payload = asRecord(await response.json());
  const outputText = typeof payload.output_text === "string"
    ? payload.output_text
    : Array.isArray(payload.output)
      ? payload.output.flatMap((output) => {
        const content = asRecord(output).content;
        return Array.isArray(content) ? content.map((entry) => asRecord(entry).text).filter((text): text is string => typeof text === "string") : [];
      }).join("\n")
      : "";

  if (!outputText) throw new Error("Vision response did not contain receipt data");
  return normaliseVisionReceipt(JSON.parse(outputText));
}

async function extractWithLocalOcr(image: Buffer): Promise<ReceiptData> {
  mkdirSync(TESSERACT_CACHE_PATH, { recursive: true });
  const worker = await createWorker("eng", 1, { cachePath: TESSERACT_CACHE_PATH });
  try {
    const { data } = await worker.recognize(image);
    return fallbackParse(data.text);
  } finally {
    await worker.terminate();
  }
}

/**
 * Prefer AI Vision for receipt understanding, retaining server-side local OCR
 * as a privacy-preserving fallback when the vision provider is unavailable.
 */
export async function scanReceipt(image: Buffer, mimetype: string): Promise<ReceiptData> {
  try {
    return await extractWithVision(image, mimetype);
  } catch (visionError) {
    console.warn("[RECEIPT] Vision scan failed; using local OCR fallback:", visionError instanceof Error ? visionError.message : "unknown error");
    try {
      return await extractWithLocalOcr(image);
    } catch (ocrError) {
      console.warn("[RECEIPT] Local OCR fallback failed:", ocrError instanceof Error ? ocrError.message : "unknown error");
      return fallbackParse("");
    }
  }
}
