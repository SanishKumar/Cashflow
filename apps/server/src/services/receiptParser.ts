/**
 * Receipt parsing.
 *
 * Split out from the OCR transport so the parsing rules can be tested against
 * fixed input without stubbing the network.
 *
 * Two things matter here. First, receipts are a two-column layout — label on
 * the left, amount hard right — so a line is parsed by taking the last money
 * token as the amount and everything before it as the label, rather than
 * hoping a single regex matches the whole row. Second, geometry: when the
 * provider returns word boxes we keep them, which is what lets the UI point at
 * the line on the photograph instead of asking people to trust a number.
 */

export interface BoundingBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface ReceiptLine {
  text: string;
  bbox?: BoundingBox;
}

export interface ReceiptItem {
  name: string;
  quantity: number;
  price: number;
  /** Where the line sits on the image, when the provider reports geometry. */
  bbox?: BoundingBox;
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
  /** 0–1, derived from what the parser could actually corroborate. */
  confidence: number;
  /** Plain-language notes on anything the parser could not establish. */
  warnings: string[];
  rawText: string;
}

const MONEY = String.raw`-?\d{1,3}(?:,\d{3})*(?:\.\d{2})?|-?\d+\.\d{2}`;
const CURRENCY_SYMBOL = String.raw`[$₹€£¥]`;

/** Rows that describe the bill itself rather than something that was bought. */
const SUMMARY_LINE =
  /\b(sub\s*total|subtotal|total|tax|gst|vat|cgst|sgst|tip|gratuity|service\s*charge|change|cash|card|visa|master|amex|upi|balance|amount\s*due|rounding|discount|savings|invoice|receipt|thank)/i;

function toAmount(raw: string): number | undefined {
  const cleaned = raw.replace(/[^0-9.-]/g, "");
  if (!cleaned || cleaned === "-" || cleaned === ".") return undefined;
  const value = Number(cleaned);
  return Number.isFinite(value) ? value : undefined;
}

/** Last money token on a line, which on a receipt is the amount column. */
function trailingAmount(text: string): { label: string; amount: number } | undefined {
  const pattern = new RegExp(`(${CURRENCY_SYMBOL})?\\s*(${MONEY})\\s*$`);
  const match = text.trimEnd().match(pattern);
  if (!match) return undefined;

  const amount = toAmount(match[2]!);
  if (amount === undefined) return undefined;

  const label = text.slice(0, match.index).trim().replace(/[.…\-:\s]+$/, "");
  return { label, amount };
}

function labelledAmount(lines: readonly ReceiptLine[], label: RegExp): number | undefined {
  // Later rows win: receipts print running subtotals before the final figure.
  for (let i = lines.length - 1; i >= 0; i -= 1) {
    const text = lines[i]!.text;
    if (!label.test(text)) continue;
    const parsed = trailingAmount(text);
    if (parsed && parsed.amount > 0) return parsed.amount;
  }
  return undefined;
}

export function detectCurrency(text: string): string {
  if (/₹|\bINR\b|\bRs\.?\b/i.test(text)) return "INR";
  if (/€|\bEUR\b/i.test(text)) return "EUR";
  if (/£|\bGBP\b/i.test(text)) return "GBP";
  if (/¥|\bJPY\b/i.test(text)) return "JPY";
  if (/\bCAD\b/i.test(text)) return "CAD";
  if (/\bAUD\b/i.test(text)) return "AUD";
  return "USD";
}

export function categoryFromText(text: string): string {
  const normalized = text.toLowerCase();
  if (/uber|lyft|ola|taxi|metro|fuel|petrol|gas station|parking/.test(normalized)) return "transport";
  if (/restaurant|cafe|coffee|pizza|burger|dining|food|bistro|kitchen|bar\b/.test(normalized)) return "dining";
  if (/grocery|market|supermarket|walmart|tesco|kirana|vegetable|mart\b/.test(normalized)) return "groceries";
  if (/hotel|airlines|flight|airbnb|hostel|resort/.test(normalized)) return "travel";
  if (/pharmacy|chemist|clinic|hospital|medical/.test(normalized)) return "health";
  if (/movie|cinema|streaming|game|theatre/.test(normalized)) return "entertainment";
  if (/electric|water bill|internet|utility|broadband|recharge/.test(normalized)) return "utilities";
  if (/store|mall|shop|retail/.test(normalized)) return "shopping";
  return "other";
}

export function dateFromText(text: string): string {
  const iso = text.match(/\b(20\d{2})[-/.](0?[1-9]|1[0-2])[-/.]([0-2]?\d|3[01])\b/);
  if (iso) return `${iso[1]}-${iso[2]!.padStart(2, "0")}-${iso[3]!.padStart(2, "0")}`;

  const dmy = text.match(/\b(0?[1-9]|[12]\d|3[01])[-/.](0?[1-9]|1[0-2])[-/.](20\d{2})\b/);
  if (dmy) return `${dmy[3]}-${dmy[2]!.padStart(2, "0")}-${dmy[1]!.padStart(2, "0")}`;
  return "";
}

/** Merges the box of every word on a line into one rectangle. */
export function mergeBoxes(boxes: readonly BoundingBox[]): BoundingBox | undefined {
  if (boxes.length === 0) return undefined;
  let left = Infinity;
  let top = Infinity;
  let right = -Infinity;
  let bottom = -Infinity;

  for (const box of boxes) {
    left = Math.min(left, box.x);
    top = Math.min(top, box.y);
    right = Math.max(right, box.x + box.width);
    bottom = Math.max(bottom, box.y + box.height);
  }
  return { x: left, y: top, width: right - left, height: bottom - top };
}

function parseItems(lines: readonly ReceiptLine[]): ReceiptItem[] {
  const items: ReceiptItem[] = [];

  for (const line of lines) {
    const text = line.text.trim();
    if (!text || SUMMARY_LINE.test(text)) continue;

    const parsed = trailingAmount(text);
    if (!parsed || parsed.amount <= 0) continue;

    // A label needs some letters; a bare row of digits is a phone number or
    // a till code, not a purchase.
    if (!/[a-z]{2,}/i.test(parsed.label)) continue;

    // "2 x Latte", "2x Latte" or a trailing "@ 3.50" all describe quantity.
    const quantityMatch = parsed.label.match(/^(\d{1,3})\s*[x×*]\s*(.+)$/i);
    const trailingQuantity = parsed.label.match(/^(.+?)\s+(\d{1,3})\s*[x×*]\s*$/i);

    const name = (quantityMatch?.[2] ?? trailingQuantity?.[1] ?? parsed.label)
      .replace(/\s{2,}/g, " ")
      .replace(/[@#]\s*[\d.]+$/, "")
      .trim();

    if (name.length < 2) continue;

    items.push({
      name,
      quantity: Number(quantityMatch?.[1] ?? trailingQuantity?.[2] ?? 1) || 1,
      price: parsed.amount,
      ...(line.bbox ? { bbox: line.bbox } : {}),
    });

    if (items.length >= 60) break;
  }

  return items;
}

function pickVendor(lines: readonly ReceiptLine[]): string {
  // The trading name is almost always the first substantial line of text.
  for (const line of lines.slice(0, 6)) {
    const text = line.text.trim();
    if (text.length < 3) continue;
    if (/receipt|invoice|order|date|time|tel|phone|gst|vat|www\.|@/i.test(text)) continue;
    if (!/[a-z]{3,}/i.test(text)) continue;
    if (trailingAmount(text)) continue;
    return text.replace(/\s{2,}/g, " ").slice(0, 60);
  }
  return "Scanned receipt";
}

/**
 * Scores how much of the receipt actually corroborates itself. This replaces a
 * constant that used to be reported as though it were a model score: nothing
 * here is guessed, every term is something the parser either found or did not.
 */
function scoreConfidence(input: {
  totalFromLabel: boolean;
  total: number;
  items: ReceiptItem[];
  subtotal?: number;
  tax?: number;
  tip?: number;
}): { confidence: number; warnings: string[] } {
  const warnings: string[] = [];
  let score = 0;

  if (input.total > 0) {
    score += input.totalFromLabel ? 0.4 : 0.15;
    if (!input.totalFromLabel) {
      warnings.push("No total line was found, so the largest amount on the receipt was used.");
    }
  } else {
    warnings.push("No total could be read from this receipt.");
  }

  if (input.items.length > 0) {
    score += 0.2;
  } else {
    warnings.push("No individual items could be read.");
  }

  // The strongest signal available: do the parts add up to the whole?
  if (input.items.length > 0 && input.total > 0) {
    const itemsSum = input.items.reduce((sum, item) => sum + item.price, 0);
    const expected = itemsSum + (input.tax ?? 0) + (input.tip ?? 0);
    const reference = input.subtotal !== undefined ? input.subtotal + (input.tax ?? 0) + (input.tip ?? 0) : expected;
    const drift = Math.abs(reference - input.total) / input.total;

    if (drift <= 0.02) score += 0.4;
    else if (drift <= 0.1) {
      score += 0.15;
      warnings.push("The items do not quite add up to the total; some lines may have been missed.");
    } else {
      warnings.push("The items add up to a very different figure from the total. Check before saving.");
    }
  }

  return { confidence: Math.max(0, Math.min(1, Number(score.toFixed(2)))), warnings };
}

export function parseReceiptLines(lines: readonly ReceiptLine[]): ReceiptData {
  const cleaned = lines.filter((line) => line.text.trim().length > 0);
  const rawText = cleaned.map((line) => line.text).join("\n");

  const totalFromLabel = labelledAmount(
    cleaned,
    /\b(grand\s*total|total\s*due|amount\s*due|balance\s*due|net\s*payable|total)\b/i
  );

  const everyAmount = cleaned
    .map((line) => trailingAmount(line.text)?.amount)
    .filter((amount): amount is number => amount !== undefined && amount > 0);

  const total = totalFromLabel ?? (everyAmount.length > 0 ? Math.max(...everyAmount) : 0);
  const subtotal = labelledAmount(cleaned, /\bsub\s*total\b/i);
  const tax = labelledAmount(cleaned, /\b(tax|gst|vat|cgst|sgst)\b/i);
  const tip = labelledAmount(cleaned, /\b(tip|gratuity)\b/i);

  const items = parseItems(cleaned);
  const vendor = pickVendor(cleaned);

  const { confidence, warnings } = scoreConfidence({
    totalFromLabel: totalFromLabel !== undefined,
    total,
    items,
    subtotal,
    tax,
    tip,
  });

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
    confidence,
    warnings,
    rawText,
  };
}

/** Parses plain OCR text, used when the provider returns no geometry. */
export function parseReceiptText(rawText: string): ReceiptData {
  return parseReceiptLines(rawText.split(/\r?\n/).map((text) => ({ text })));
}
