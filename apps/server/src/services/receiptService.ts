import { createWorker } from "tesseract.js";
import { mkdirSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import {
  mergeBoxes,
  parseReceiptLines,
  parseReceiptText,
  type BoundingBox,
  type ReceiptData,
  type ReceiptLine,
} from "./receiptParser.js";

export type { ReceiptData, ReceiptItem, BoundingBox } from "./receiptParser.js";

interface OcrSpaceWord {
  WordText?: string;
  Left?: number;
  Top?: number;
  Height?: number;
  Width?: number;
}

interface OcrSpaceLine {
  LineText?: string;
  Words?: OcrSpaceWord[];
}

interface OcrSpaceParsedResult {
  ParsedText?: string | null;
  ErrorMessage?: string | string[] | null;
  ErrorDetails?: string | null;
  TextOverlay?: { Lines?: OcrSpaceLine[] } | null;
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
  return [
    errorText(payload.ErrorMessage),
    errorText(payload.ErrorDetails),
    ...(payload.ParsedResults ?? []).flatMap((result) => [
      errorText(result.ErrorMessage),
      errorText(result.ErrorDetails),
    ]),
  ]
    .filter(Boolean)
    .join("; ");
}

/**
 * Turns the provider's word overlay into lines that carry their position on the
 * image. Without geometry a receipt is just a wall of text, and the interface
 * can only ask people to trust the parse; with it, every row can be pointed at.
 */
function linesFromOverlay(results: readonly OcrSpaceParsedResult[]): ReceiptLine[] {
  const lines: ReceiptLine[] = [];

  for (const result of results) {
    for (const line of result.TextOverlay?.Lines ?? []) {
      const words = line.Words ?? [];
      const text = (line.LineText ?? words.map((word) => word.WordText ?? "").join(" ")).trim();
      if (!text) continue;

      const boxes: BoundingBox[] = [];
      for (const word of words) {
        if (
          typeof word.Left === "number" &&
          typeof word.Top === "number" &&
          typeof word.Width === "number" &&
          typeof word.Height === "number"
        ) {
          boxes.push({ x: word.Left, y: word.Top, width: word.Width, height: word.Height });
        }
      }

      const bbox = mergeBoxes(boxes);
      lines.push(bbox ? { text, bbox } : { text });
    }
  }

  return lines;
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
  // Word geometry is what makes a line addressable in the interface.
  formData.set("isOverlayRequired", "true");
  formData.set("detectOrientation", "true");
  formData.set("scale", "true");
  formData.set("isTable", "true");

  const response = await fetch(OCR_SPACE_ENDPOINT, {
    method: "POST",
    headers: { apikey: apiKey },
    body: formData,
  });

  if (!response.ok) throw new Error(`OCR.space request failed with status ${response.status}`);

  const payload = (await response.json()) as OcrSpaceResponse;
  const results = payload.ParsedResults ?? [];
  const providerError = ocrSpaceErrorMessage(payload);

  const overlayLines = linesFromOverlay(results);
  if (overlayLines.length > 0) return parseReceiptLines(overlayLines);

  const rawText = results
    .map((result) => result.ParsedText?.trim() ?? "")
    .filter(Boolean)
    .join("\n");

  if (payload.IsErroredOnProcessing || !rawText) {
    throw new Error(providerError || "OCR.space did not return readable receipt text");
  }

  return parseReceiptText(rawText);
}

async function extractWithLocalOcr(image: Buffer): Promise<ReceiptData> {
  mkdirSync(TESSERACT_CACHE_PATH, { recursive: true });
  const worker = await createWorker("eng", 1, { cachePath: TESSERACT_CACHE_PATH });
  try {
    const { data } = await worker.recognize(image);
    return parseReceiptText(data.text);
  } finally {
    await worker.terminate();
  }
}

/**
 * OCR.space Engine 3 is the primary reader. Local Tesseract covers the cases
 * where the provider, its free quota, or the upload size rules it out.
 */
export async function scanReceipt(image: Buffer, mimetype: string): Promise<ReceiptData> {
  try {
    return await extractWithOcrSpace(image, mimetype);
  } catch (providerError) {
    console.warn(
      "[RECEIPT] OCR.space scan failed; using local OCR fallback:",
      providerError instanceof Error ? providerError.message : "unknown error"
    );
    try {
      return await extractWithLocalOcr(image);
    } catch (ocrError) {
      console.warn(
        "[RECEIPT] Local OCR fallback failed:",
        ocrError instanceof Error ? ocrError.message : "unknown error"
      );
      return parseReceiptText("");
    }
  }
}
