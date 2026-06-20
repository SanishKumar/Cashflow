/**
 * Export Service Tests — CSV and PDF Generation
 *
 * Tests the exportService: CSV format, BOM, escaping,
 * and PDF buffer generation.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockPrisma } = vi.hoisted(() => ({
  mockPrisma: {
    group: {
      findUnique: vi.fn(),
    },
    transaction: {
      findMany: vi.fn(),
    },
  } as any,
}));

vi.mock("../lib/prisma.js", () => ({ default: mockPrisma }));

vi.mock("../services/transactionService.js", () => ({
  transactionService: {
    getSettlements: vi.fn().mockResolvedValue({
      groupId: "group-1",
      balances: [
        { userId: "user-1", name: "Alice", netBalance: 50 },
        { userId: "user-2", name: "Bob", netBalance: -50 },
      ],
      settlements: [
        { from: "user-2", fromName: "Bob", to: "user-1", toName: "Alice", amount: 50 },
      ],
    }),
  },
}));

import { exportService } from "../services/exportService.js";

describe("ExportService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("generateLedgerCSV", () => {
    it("generates valid CSV with BOM for Excel compatibility", async () => {
      mockPrisma.group.findUnique.mockResolvedValue({
        id: "group-1", name: "Test Group", currency: "USD",
      });
      mockPrisma.transaction.findMany.mockResolvedValue([{
        id: "tx-1", description: "Lunch", amount: 25.5,
        createdAt: new Date("2026-06-15"), status: "COMPLETED",
        originalCurrency: "USD",
        paidBy: { name: "Alice" },
        debtShares: [
          { amount: 12.75, owedBy: { name: "Bob" } },
          { amount: 12.75, owedBy: { name: "Charlie" } },
        ],
      }]);

      const result = await exportService.generateLedgerCSV("group-1");

      expect(result.content.charCodeAt(0)).toBe(0xfeff);
      expect(result.content).toContain("Date,Description,Paid By,Amount,Currency,Status,Split Between");
      expect(result.content).toContain("Lunch");
      expect(result.content).toContain("Alice");
      expect(result.content).toContain("25.50");
      expect(result.filename).toMatch(/^Test_Group_ledger_\d{4}-\d{2}-\d{2}\.csv$/);
    });

    it("escapes CSV fields with commas and quotes", async () => {
      mockPrisma.group.findUnique.mockResolvedValue({
        id: "group-1", name: "Test Group", currency: "USD",
      });
      mockPrisma.transaction.findMany.mockResolvedValue([{
        id: "tx-1", description: 'Dinner at "Joe\'s, Place"',
        amount: 42.0, createdAt: new Date("2026-06-15"),
        status: "COMPLETED", originalCurrency: "USD",
        paidBy: { name: "Alice" }, debtShares: [],
      }]);

      const result = await exportService.generateLedgerCSV("group-1");
      expect(result.content).toContain('"Dinner at ""Joe\'s, Place"""');
    });

    it("throws NotFoundError for non-existent group", async () => {
      mockPrisma.group.findUnique.mockResolvedValue(null);
      await expect(exportService.generateLedgerCSV("nonexistent")).rejects.toThrow("not found");
    });

    it("generates valid CSV for group with no transactions", async () => {
      mockPrisma.group.findUnique.mockResolvedValue({
        id: "group-1", name: "Empty Group", currency: "USD",
      });
      mockPrisma.transaction.findMany.mockResolvedValue([]);

      const result = await exportService.generateLedgerCSV("group-1");
      expect(result.content).toContain("Date,Description");
      const lines = result.content.split("\n").filter(Boolean);
      expect(lines).toHaveLength(1);
    });
  });

  describe("generateSettlementPDF", () => {
    it("generates a valid PDF buffer", async () => {
      mockPrisma.group.findUnique.mockResolvedValue({
        id: "group-1", name: "Test Group", currency: "USD",
        members: [{ user: { name: "Alice" } }, { user: { name: "Bob" } }],
        _count: { transactions: 5 },
      });

      const result = await exportService.generateSettlementPDF("group-1");

      expect(result.buffer.slice(0, 5).toString()).toBe("%PDF-");
      expect(result.filename).toMatch(/^Test_Group_settlements_\d{4}-\d{2}-\d{2}\.pdf$/);
      expect(result.buffer.length).toBeGreaterThan(0);
    });

    it("throws NotFoundError for non-existent group", async () => {
      mockPrisma.group.findUnique.mockResolvedValue(null);
      await expect(exportService.generateSettlementPDF("nonexistent")).rejects.toThrow("not found");
    });
  });
});
