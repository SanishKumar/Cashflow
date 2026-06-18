/**
 * Export Service — CSV, PDF, and Email Generation
 *
 * Generates formatted exports of group ledger and settlement data.
 * CSV uses BOM for Excel compatibility. PDF uses pdfkit with proper
 * table formatting. Email support is placeholder-ready for Resend.
 */

import PDFDocument from "pdfkit";
import prisma from "../lib/prisma.js";
import { NotFoundError } from "../lib/errors.js";
import { transactionService } from "./transactionService.js";

// Removed unused TransactionRow interface

/**
 * Escape a CSV field — handles commas, quotes, and newlines.
 */
function csvEscape(value: string): string {
  if (value.includes(",") || value.includes('"') || value.includes("\n")) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

export class ExportService {
  /**
   * Generate a CSV of all transactions for a group.
   * Includes BOM for Excel compatibility.
   */
  async generateLedgerCSV(groupId: string): Promise<{ filename: string; content: string }> {
    const group = await prisma.group.findUnique({ where: { id: groupId } });
    if (!group) throw new NotFoundError("Group", groupId);

    const transactions = await prisma.transaction.findMany({
      where: { groupId },
      orderBy: { createdAt: "desc" },
      include: {
        paidBy: { select: { name: true } },
        debtShares: {
          include: { owedBy: { select: { name: true } } },
        },
      },
    });

    const headers = ["Date", "Description", "Paid By", "Amount", "Currency", "Status", "Split Between"];
    const rows: string[][] = transactions.map((t) => [
      new Date(t.createdAt).toISOString().split("T")[0],
      t.description,
      t.paidBy.name,
      t.amount.toFixed(2),
      t.originalCurrency || group.currency,
      t.status,
      t.debtShares.map((s) => `${s.owedBy.name}: ${s.amount.toFixed(2)}`).join("; "),
    ]);

    // BOM for Excel UTF-8 compatibility
    const BOM = "\uFEFF";
    const csv =
      BOM +
      headers.map(csvEscape).join(",") +
      "\n" +
      rows.map((row) => row.map(csvEscape).join(",")).join("\n");

    const filename = `${group.name.replace(/[^a-zA-Z0-9]/g, "_")}_ledger_${
      new Date().toISOString().split("T")[0]
    }.csv`;

    return { filename, content: csv };
  }

  /**
   * Generate a PDF of settlement recommendations for a group.
   */
  async generateSettlementPDF(
    groupId: string
  ): Promise<{ filename: string; buffer: Buffer }> {
    const group = await prisma.group.findUnique({
      where: { id: groupId },
      include: {
        members: {
          include: { user: { select: { name: true } } },
        },
        _count: { select: { transactions: true } }
      },
    }) as any;
    if (!group) throw new NotFoundError("Group", groupId);

    // Get settlement data from the transaction service
    const balances = await transactionService.getSettlements(groupId);

    return new Promise((resolve, reject) => {
      try {
        const doc = new PDFDocument({
          size: "A4",
          margin: 50,
          info: {
            Title: `${group.name} — Settlement Report`,
            Author: "CashFlow Platform",
            Subject: "Debt Settlement Recommendations",
          },
        });

        const chunks: Buffer[] = [];
        doc.on("data", (chunk: Buffer) => chunks.push(chunk));
        doc.on("end", () => {
          const buffer = Buffer.concat(chunks);
          const filename = `${group.name.replace(/[^a-zA-Z0-9]/g, "_")}_settlements_${
            new Date().toISOString().split("T")[0]
          }.pdf`;
          resolve({ filename, buffer });
        });
        doc.on("error", reject);

        // Header
        doc
          .fontSize(24)
          .font("Helvetica-Bold")
          .text("Settlement Report", { align: "center" })
          .moveDown(0.5);

        doc
          .fontSize(12)
          .font("Helvetica")
          .fillColor("#666666")
          .text(`Group: ${group.name}`, { align: "center" })
          .text(`Date: ${new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })}`, { align: "center" })
          .text(`Currency: ${group.currency}`, { align: "center" })
          .moveDown(1);

        // Divider
        doc
          .strokeColor("#cccccc")
          .lineWidth(1)
          .moveTo(50, doc.y)
          .lineTo(545, doc.y)
          .stroke()
          .moveDown(1);

        // Summary
        doc
          .fontSize(16)
          .font("Helvetica-Bold")
          .fillColor("#000000")
          .text("Summary")
          .moveDown(0.5);

        doc
          .fontSize(11)
          .font("Helvetica")
          .text(`Total Members: ${group.members.length}`)
          .text(`Total Transactions: ${group?._count?.transactions ?? "N/A"}`)
          .text(`Optimized Settlements: ${balances.settlements.length}`)
          .moveDown(1);

        // Member Balances
        if (balances.balances && balances.balances.length > 0) {
          doc
            .fontSize(16)
            .font("Helvetica-Bold")
            .text("Member Balances")
            .moveDown(0.5);

          for (const balance of balances.balances) {
            const amtStr = balance.netBalance >= 0
              ? `+${balance.netBalance.toFixed(2)}`
              : balance.netBalance.toFixed(2);
            const color = balance.netBalance >= 0 ? "#22c55e" : "#ef4444";

            doc
              .fontSize(11)
              .font("Helvetica")
              .fillColor("#000000")
              .text(`${balance.name}:  `, { continued: true })
              .fillColor(color)
              .text(`${group.currency} ${amtStr}`)
              .fillColor("#000000");
          }
          doc.moveDown(1);
        }

        // Settlement Plan
        doc
          .fontSize(16)
          .font("Helvetica-Bold")
          .fillColor("#000000")
          .text("Settlement Plan")
          .moveDown(0.5);

        if (balances.settlements.length === 0) {
          doc
            .fontSize(11)
            .font("Helvetica")
            .fillColor("#22c55e")
            .text("✓ All debts are settled — no payments needed!")
            .fillColor("#000000");
        } else {
          doc
            .fontSize(10)
            .font("Helvetica")
            .fillColor("#666666")
            .text("The following payments will settle all debts with the minimum number of transactions:")
            .moveDown(0.5)
            .fillColor("#000000");

          // Table header
          const tableTop = doc.y;
          const colWidths = [40, 160, 40, 160, 95];
          const headers = ["#", "From", "→", "To", "Amount"];

          doc.fontSize(10).font("Helvetica-Bold");
          let xPos = 50;
          headers.forEach((header, i) => {
            doc.text(header, xPos, tableTop, { width: colWidths[i] });
            xPos += colWidths[i];
          });

          doc
            .moveDown(0.3)
            .strokeColor("#eeeeee")
            .lineWidth(0.5)
            .moveTo(50, doc.y)
            .lineTo(545, doc.y)
            .stroke()
            .moveDown(0.3);

          // Table rows
          doc.fontSize(10).font("Helvetica");
          balances.settlements.forEach((s: any, i: number) => {
            const y = doc.y;
            xPos = 50;
            const row = [
              `${i + 1}`,
              s.fromName || s.from,
              "→",
              s.toName || s.to,
              `${group.currency} ${s.amount.toFixed(2)}`,
            ];
            row.forEach((cell, j) => {
              doc.text(cell, xPos, y, { width: colWidths[j] });
              xPos += colWidths[j];
            });
            doc.moveDown(0.2);
          });
        }

        // Footer
        doc.moveDown(2);
        doc
          .fontSize(8)
          .font("Helvetica")
          .fillColor("#999999")
          .text(`Generated by CashFlow Platform • ${new Date().toISOString()}`, {
            align: "center",
          });

        doc.end();
      } catch (err) {
        reject(err);
      }
    });
  }
}

export const exportService = new ExportService();
