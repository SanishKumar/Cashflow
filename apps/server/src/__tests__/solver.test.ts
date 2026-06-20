/**
 * Solver Tests — Debt Minimization Algorithm
 *
 * Tests the core minimizeDebts function in isolation.
 * No database or network required.
 */

import { describe, it, expect } from "vitest";
import { minimizeDebts } from "../services/solver.js";
import type { DebtEdge } from "../types/api.js";

describe("minimizeDebts", () => {
  it("returns empty array for empty input", () => {
    const result = minimizeDebts([], new Map());
    expect(result).toEqual([]);
  });

  it("handles single debtor to single creditor", () => {
    const edges: DebtEdge[] = [{ from: "A", to: "B", amount: 100 }];
    const names = new Map([
      ["A", "Alice"],
      ["B", "Bob"],
    ]);

    const result = minimizeDebts(edges, names);

    expect(result).toHaveLength(1);
    expect(result[0].from).toBe("A");
    expect(result[0].to).toBe("B");
    expect(result[0].amount).toBe(100);
    expect(result[0].fromName).toBe("Alice");
    expect(result[0].toName).toBe("Bob");
  });

  it("minimizes three-way circular debt to 2 settlements", () => {
    // A owes B $30, B owes C $20, C owes A $10
    // Net: A = -20, B = +10, C = +10
    const edges: DebtEdge[] = [
      { from: "A", to: "B", amount: 30 },
      { from: "B", to: "C", amount: 20 },
      { from: "C", to: "A", amount: 10 },
    ];
    const names = new Map([
      ["A", "Alice"],
      ["B", "Bob"],
      ["C", "Charlie"],
    ]);

    const result = minimizeDebts(edges, names);

    // Should produce at most 2 settlements (N-1 where N=3 unique users with non-zero balances)
    expect(result.length).toBeLessThanOrEqual(2);

    // Total settlement amount should equal 20 (the net flow)
    const totalSettled = result.reduce((sum, s) => sum + s.amount, 0);
    expect(totalSettled).toBe(20);
  });

  it("returns zero settlements when all debts cancel out", () => {
    // A owes B $50, B owes A $50 — net zero
    const edges: DebtEdge[] = [
      { from: "A", to: "B", amount: 50 },
      { from: "B", to: "A", amount: 50 },
    ];
    const names = new Map([
      ["A", "Alice"],
      ["B", "Bob"],
    ]);

    const result = minimizeDebts(edges, names);
    expect(result).toHaveLength(0);
  });

  it("ensures all settlement amounts are positive", () => {
    const edges: DebtEdge[] = [
      { from: "A", to: "B", amount: 100 },
      { from: "C", to: "B", amount: 50 },
      { from: "D", to: "A", amount: 30 },
    ];
    const names = new Map([
      ["A", "Alice"],
      ["B", "Bob"],
      ["C", "Charlie"],
      ["D", "Dave"],
    ]);

    const result = minimizeDebts(edges, names);

    for (const settlement of result) {
      expect(settlement.amount).toBeGreaterThan(0);
    }
  });

  it("ensures net balances sum to zero after solving", () => {
    const edges: DebtEdge[] = [
      { from: "A", to: "B", amount: 100 },
      { from: "B", to: "C", amount: 70 },
      { from: "C", to: "D", amount: 40 },
      { from: "D", to: "A", amount: 20 },
    ];
    const names = new Map([
      ["A", "Alice"],
      ["B", "Bob"],
      ["C", "Charlie"],
      ["D", "Dave"],
    ]);

    const result = minimizeDebts(edges, names);

    // Compute net from settlements
    const balances = new Map<string, number>();
    for (const s of result) {
      balances.set(s.from, (balances.get(s.from) ?? 0) - s.amount);
      balances.set(s.to, (balances.get(s.to) ?? 0) + s.amount);
    }

    // Compute net from original edges
    const originalBalances = new Map<string, number>();
    for (const e of edges) {
      originalBalances.set(e.from, (originalBalances.get(e.from) ?? 0) - e.amount);
      originalBalances.set(e.to, (originalBalances.get(e.to) ?? 0) + e.amount);
    }

    // They should be equivalent
    for (const [userId, bal] of originalBalances) {
      expect(Math.abs((balances.get(userId) ?? 0) - bal)).toBeLessThan(0.01);
    }
  });

  it("is idempotent: solving twice gives same result", () => {
    const edges: DebtEdge[] = [
      { from: "A", to: "B", amount: 100 },
      { from: "C", to: "D", amount: 50 },
      { from: "B", to: "C", amount: 30 },
    ];
    const names = new Map([
      ["A", "Alice"],
      ["B", "Bob"],
      ["C", "Charlie"],
      ["D", "Dave"],
    ]);

    const result1 = minimizeDebts(edges, names);
    const result2 = minimizeDebts(edges, names);

    expect(result1).toEqual(result2);
  });

  it("handles large groups (50 users) correctly", () => {
    const edges: DebtEdge[] = [];
    const names = new Map<string, string>();

    // Create a chain of debts: user0 -> user1 -> user2 -> ... -> user49
    for (let i = 0; i < 50; i++) {
      names.set(`user${i}`, `User ${i}`);
      if (i < 49) {
        edges.push({ from: `user${i}`, to: `user${i + 1}`, amount: 10 + i });
      }
    }

    const result = minimizeDebts(edges, names);

    // Should produce at most 49 settlements (N-1)
    expect(result.length).toBeLessThanOrEqual(49);

    // All amounts should be positive
    for (const s of result) {
      expect(s.amount).toBeGreaterThan(0);
    }
  });

  it("rounds amounts to cents (2 decimal places)", () => {
    // Create a scenario that would produce fractional cents
    const edges: DebtEdge[] = [
      { from: "A", to: "B", amount: 33.33 },
      { from: "A", to: "C", amount: 33.33 },
      { from: "A", to: "D", amount: 33.34 },
    ];
    const names = new Map([
      ["A", "Alice"],
      ["B", "Bob"],
      ["C", "Charlie"],
      ["D", "Dave"],
    ]);

    const result = minimizeDebts(edges, names);

    for (const s of result) {
      const rounded = Math.round(s.amount * 100) / 100;
      expect(s.amount).toBe(rounded);
    }
  });

  it("handles single user with no edges", () => {
    const edges: DebtEdge[] = [];
    const names = new Map([["A", "Alice"]]);

    const result = minimizeDebts(edges, names);
    expect(result).toEqual([]);
  });

  it("handles two users with a single transaction", () => {
    const edges: DebtEdge[] = [{ from: "A", to: "B", amount: 42.5 }];
    const names = new Map([
      ["A", "Alice"],
      ["B", "Bob"],
    ]);

    const result = minimizeDebts(edges, names);

    expect(result).toHaveLength(1);
    expect(result[0].amount).toBe(42.5);
  });

  it("uses userId as fallback when name is not in map", () => {
    const edges: DebtEdge[] = [{ from: "A", to: "B", amount: 10 }];
    const names = new Map<string, string>(); // empty map

    const result = minimizeDebts(edges, names);

    expect(result[0].fromName).toBe("A");
    expect(result[0].toName).toBe("B");
  });

  it("minimizes a complex 5-person network", () => {
    // 5-person group with multiple cross debts
    const edges: DebtEdge[] = [
      { from: "A", to: "B", amount: 50 },
      { from: "A", to: "C", amount: 30 },
      { from: "B", to: "D", amount: 40 },
      { from: "C", to: "E", amount: 20 },
      { from: "D", to: "A", amount: 15 },
      { from: "E", to: "B", amount: 25 },
    ];
    const names = new Map([
      ["A", "Alice"],
      ["B", "Bob"],
      ["C", "Charlie"],
      ["D", "Dave"],
      ["E", "Eve"],
    ]);

    const result = minimizeDebts(edges, names);

    // Should produce at most 4 settlements (N-1 where N=5)
    expect(result.length).toBeLessThanOrEqual(4);

    // Verify conservation: total paid out == total received
    const outflow = new Map<string, number>();
    const inflow = new Map<string, number>();
    for (const s of result) {
      outflow.set(s.from, (outflow.get(s.from) ?? 0) + s.amount);
      inflow.set(s.to, (inflow.get(s.to) ?? 0) + s.amount);
    }

    const totalOut = [...outflow.values()].reduce((a, b) => a + b, 0);
    const totalIn = [...inflow.values()].reduce((a, b) => a + b, 0);
    expect(Math.abs(totalOut - totalIn)).toBeLessThan(0.01);
  });
});
