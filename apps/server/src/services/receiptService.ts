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

interface OcrSpaceParsedResult {
  ParsedText?: string | null;
  ErrorMessage?: string | string[] | null;
  ErrorDetails?: string | null;
}

interface OcrSpaceResponse {
  IsErroredOnProcessing?: boolean;
  ErrorMessage?: string | string[] | null;
  ErrorDetails?: string | null;
  ParsedResults?: OcrSpaceParsedResult[];
}

const TESSERACT_CACHE_PATH = join(tmpdir(), "cashflow-tesseract-cache");
const OCR_SPACE_ENDPOINT = "https://api.ocr.space/parse/image";
const OCR_SPACE_FREE_FILE_LIMIT_BYTES = 1 * 1024 * 1024;

function toNumber(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value.replace(/[^0-9.-]/g, ""));
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  return undefined;
}

function detectCurrency(text: string): string {
  if (/\u20B9|\bINR\b/i.test(text)) return "INR";
  if (/\u20AC|\bEUR\b/i.test(text)) return "EUR";
  if (/\u00A3|\bGBP\b/i.test(text)) return "GBP";
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
  return [...text.matchAll(/(?:[$\u20B9\u20AC\u00A3]|\b(?:USD|INR|EUR|GBP)\s*)?\s*(\d{1,3}(?:,\d{3})*\.\d{2})\b/gi)]
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
    const match = line.trim().match(/^(.+?)\s+(?:(\d+)\s*[x\u00D7]\s*)?([$\u20B9\u20AC\u00A3]?\s*\d{1,3}(?:,\d{3})*\.\d{2})$/i);
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

function fileExtensionFor(mimetype: string): string {
  switch (mimetype) {
    case "image/png": return "png";
    case "image/webp": return "webp";
    case "image/heic": return "heic";
    default: return "jpg";
  }
}

function errorText(value: unknown): string {
  if (Array.isArray(value)) return value.map(errorText).filter(Boolean).join("; ");
  return typeof value === "string" ? value.trim() : "";
}

function ocrSpaceErrorMessage(payload: OcrSpaceResponse): string {
  const errors = [
    errorText(payload.ErrorMessage),
    errorText(payload.ErrorDetails),
    ...(payload.ParsedResults ?? []).flatMap((result) => [
      errorText(result.ErrorMessage),
      errorText(result.ErrorDetails),
    ]),
  ].filter(Boolean);
  return errors.join("; ");
}

async function extractWithOcrSpace(image: Buffer, mimetype: string): Promise<ReceiptData> {
  const apiKey = process.env.OCR_SPACE_API_KEY;
  if (!apiKey) throw new Error("OCR_SPACE_API_KEY is not configured");
  if (image.byteLength > OCR_SPACE_FREE_FILE_LIMIT_BYTES) {
    throw new Error("OCR.space free plan accepts images up to 1 MB; using local OCR fallback");
  }

  const formData = new FormData();
  formData.set("file", new Blob([new Uint8Array(image)], { type: mimetype }), `receipt.${fileExtensionFor(mimetype)}`);
  formData.set("OCREngine", "3");
  formData.set("language", "auto");
  formData.set("isOverlayRequired", "false");
  formData.set("detectOrientation", "true");
  formData.set("scale", "true");
  formData.set("isTable", "true");

  const response = await fetch(OCR_SPACE_ENDPOINT, {
    method: "POST",
    headers: { apikey: apiKey },
    body: formData,
  });

  if (!response.ok) throw new Error(`OCR.space request failed with status ${response.status}`);

  const payload = await response.json() as OcrSpaceResponse;
  const rawText = (payload.ParsedResults ?? [])
    .map((result) => result.ParsedText?.trim() ?? "")
    .filter(Boolean)
    .join("\n");
  const providerError = ocrSpaceErrorMessage(payload);

  if (payload.IsErroredOnProcessing || !rawText) {
    throw new Error(providerError || "OCR.space did not return readable receipt text");
  }

  return fallbackParse(rawText);
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
 * OCR.space Engine 3 is the primary receipt reader. Local Tesseract remains
 * available when the provider, its free quota, or a large upload is unavailable.
 */
export async function scanReceipt(image: Buffer, mimetype: string): Promise<ReceiptData> {
  try {
    return await extractWithOcrSpace(image, mimetype);
  } catch (providerError) {
    console.warn("[RECEIPT] OCR.space scan failed; using local OCR fallback:", providerError instanceof Error ? providerError.message : "unknown error");
    try {
      return await extractWithLocalOcr(image);
    } catch (ocrError) {
      console.warn("[RECEIPT] Local OCR fallback failed:", ocrError instanceof Error ? ocrError.message : "unknown error");
      return fallbackParse("");
    }
  }
}
