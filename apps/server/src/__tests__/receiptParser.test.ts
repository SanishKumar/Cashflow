import { describe, expect, it } from "vitest";
import { parseReceiptLines, parseReceiptText } from "../services/receiptParser.js";

const GROCERY = `Corner Market
12/07/2026
Milk 2.50
Sourdough loaf 3.20
2 x Bananas 1.80
Subtotal 7.50
Tax 0.60
TOTAL 8.10
VISA ****4412 8.10
Thank you`;

describe("reading a receipt", () => {
  it("takes the amount from the right-hand column", () => {
    const receipt = parseReceiptText(GROCERY);

    expect(receipt.total).toBe(8.1);
    expect(receipt.subtotal).toBe(7.5);
    expect(receipt.tax).toBe(0.6);
    expect(receipt.vendor).toBe("Corner Market");
    expect(receipt.date).toBe("2026-07-12");
    expect(receipt.category).toBe("groceries");
  });

  it("keeps purchases and drops the summary rows", () => {
    const names = parseReceiptText(GROCERY).items.map((item) => item.name);

    expect(names).toEqual(["Milk", "Sourdough loaf", "Bananas"]);
    expect(names).not.toContain("Subtotal");
    expect(names).not.toContain("TOTAL");
  });

  it("reads a leading quantity", () => {
    const bananas = parseReceiptText(GROCERY).items.find((item) => item.name === "Bananas");
    expect(bananas).toMatchObject({ quantity: 2, price: 1.8 });
  });

  it("prefers a labelled total over the largest number on the page", () => {
    const receipt = parseReceiptText(`Deposit Bar
Bottle service 400.00
TOTAL 120.00`);

    expect(receipt.total).toBe(120);
  });

  it("ignores card digits and phone numbers", () => {
    const names = parseReceiptText(GROCERY).items.map((item) => item.name);
    expect(names.some((name) => name.includes("VISA"))).toBe(false);
  });

  it("handles rupees and the Rs prefix", () => {
    const receipt = parseReceiptText(`Chai Point
Masala chai 40.00
TOTAL Rs 40.00`);

    expect(receipt.currency).toBe("INR");
    expect(receipt.total).toBe(40);
  });
});

describe("confidence", () => {
  it("is high when the parts add up to the total", () => {
    const receipt = parseReceiptText(GROCERY);

    expect(receipt.confidence).toBeGreaterThanOrEqual(0.9);
    expect(receipt.warnings).toEqual([]);
  });

  it("warns instead of scoring high when the arithmetic does not hold", () => {
    const receipt = parseReceiptText(`Cafe
Coffee 3.00
TOTAL 87.00`);

    expect(receipt.confidence).toBeLessThan(0.7);
    expect(receipt.warnings.join(" ")).toMatch(/add up/i);
  });

  it("drops when no total line exists", () => {
    const receipt = parseReceiptText(`Cafe
Coffee 3.00
Cake 4.00`);

    expect(receipt.warnings.join(" ")).toMatch(/no total line/i);
    expect(receipt.confidence).toBeLessThan(0.6);
  });

  it("bottoms out on unreadable input", () => {
    const receipt = parseReceiptText("");

    expect(receipt.confidence).toBe(0);
    expect(receipt.total).toBe(0);
    expect(receipt.warnings.length).toBeGreaterThan(0);
  });
});

describe("geometry", () => {
  it("carries the line box through to the item so it can be pointed at", () => {
    const receipt = parseReceiptLines([
      { text: "Corner Market", bbox: { x: 10, y: 4, width: 120, height: 18 } },
      { text: "Milk 2.50", bbox: { x: 10, y: 40, width: 200, height: 16 } },
      { text: "TOTAL 2.50", bbox: { x: 10, y: 70, width: 200, height: 16 } },
    ]);

    expect(receipt.items).toHaveLength(1);
    expect(receipt.items[0]!.bbox).toEqual({ x: 10, y: 40, width: 200, height: 16 });
  });

  it("still parses when the provider reports no geometry", () => {
    const receipt = parseReceiptLines([{ text: "Milk 2.50" }, { text: "TOTAL 2.50" }]);

    expect(receipt.items[0]!.bbox).toBeUndefined();
    expect(receipt.total).toBe(2.5);
  });
});
