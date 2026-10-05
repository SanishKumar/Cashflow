import { describe, expect, it } from "vitest";
import { clear, generateNetwork, verifyClearing } from "../index.js";
import type { ClearingSolver, Obligation } from "../types.js";

const SOLVERS: ClearingSolver[] = ["cancelling", "routing", "simplex"];

const TANGLE: Obligation[] = [
  { from: "Priya", to: "Rahul", amount: 120_000 },
  { from: "Rahul", to: "Sam", amount: 90_000 },
  { from: "Sam", to: "Priya", amount: 70_000 },
  { from: "Dev", to: "Priya", amount: 45_000 },
  { from: "Sam", to: "Dev", amount: 30_000 },
  { from: "Rahul", to: "Dev", amount: 60_000 },
  { from: "Nina", to: "Sam", amount: 25_000 },
  { from: "Dev", to: "Nina", amount: 40_000 },
];

describe("solver choice", () => {
  it("clears the same value whichever solver is asked", () => {
    const supplyChain = generateNetwork({
      name: "supply chain",
      firms: 200,
      invoices: 1_500,
      reciprocity: 0.06,
      tiers: 5,
      backflow: 0.1,
      seed: 5,
    });

    for (const obligations of [TANGLE, supplyChain]) {
      const cleared = SOLVERS.map(
        (solver) => clear(obligations, { mode: "cycles", solver }).metrics.cleared
      );
      expect(cleared[1]).toBe(cleared[0]);
      expect(cleared[2]).toBe(cleared[0]);
    }
  });

  it("still reaches the floor in paths mode from any starting solver", () => {
    for (const solver of SOLVERS) {
      const result = clear(TANGLE, { mode: "paths", solver });
      expect(result.metrics.grossAfter, solver).toBe(result.metrics.grossFloor);
      expect(result.optimal, solver).toBe(true);
    }
  });

  it("issues a certificate only where one means something", () => {
    expect(clear(TANGLE, { mode: "cycles" }).certificate).toBeUndefined();
    expect(clear(TANGLE, { mode: "cycles", solver: "routing" }).certificate).toBeDefined();
    expect(clear(TANGLE, { mode: "cycles", solver: "simplex" }).certificate).toBeDefined();
    expect(clear(TANGLE, { mode: "paths", solver: "routing" }).certificate).toBeUndefined();
  });
});

describe.each(["routing", "simplex"] as const)("certificate from %s", (solver) => {
  const result = clear(TANGLE, { mode: "cycles", solver });
  const certificate = result.certificate!;

  it("verifies against the original obligations", () => {
    expect(verifyClearing(TANGLE, result.remaining, certificate)).toEqual({ valid: true });
  });

  it("survives a round trip through JSON", () => {
    const published = JSON.parse(JSON.stringify({ remaining: result.remaining, certificate }));
    expect(verifyClearing(TANGLE, published.remaining, published.certificate)).toEqual({
      valid: true,
    });
  });

  it("rejects a result that left a loop uncancelled", () => {
    // Doing nothing preserves every net position and creates nothing new. It
    // is a perfectly valid clearing — just not a maximal one.
    expect(verifyClearing(TANGLE, TANGLE, certificate).valid).toBe(false);
  });

  it("rejects a result that moved a net position", () => {
    const tampered = result.remaining.map((item, index) =>
      index === 0 ? { ...item, amount: item.amount - 1 } : item
    );
    expect(verifyClearing(TANGLE, tampered, certificate).valid).toBe(false);
  });

  it("rejects a result that increased an obligation", () => {
    const tampered = [...result.remaining, { from: "Priya", to: "Rahul", amount: 500_000 }];
    expect(verifyClearing(TANGLE, tampered, certificate).valid).toBe(false);
  });

  it("rejects a result that invented a counterparty", () => {
    const tampered = [...result.remaining, { from: "Nina", to: "Priya", amount: 100 }];
    const verdict = verifyClearing(TANGLE, tampered, certificate);
    expect(verdict.valid).toBe(false);
    expect(verdict.reason).toMatch(/Nina\|Priya was not owed/);
  });

  it("rejects a certificate that is missing a party", () => {
    const partial = { potential: certificate.potential.slice(1) };
    expect(verifyClearing(TANGLE, result.remaining, partial).valid).toBe(false);
  });
});

describe("certificates at scale", () => {
  it("verifies a few-thousand-obligation clearing in one pass", () => {
    const obligations = generateNetwork({
      name: "regional",
      firms: 1_000,
      invoices: 7_000,
      reciprocity: 0.05,
      tiers: 6,
      backflow: 0.08,
      seed: 9,
    });

    const result = clear(obligations, { mode: "cycles", solver: "routing" });

    expect(result.optimal).toBe(true);
    expect(result.metrics.noNewCounterparties).toBe(true);
    expect(verifyClearing(obligations, result.remaining, result.certificate!)).toEqual({
      valid: true,
    });
  });
});
