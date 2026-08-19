import { describe, expect, it } from "vitest";
import { clear, buildGraph, grossFloor, netPositions } from "../index.js";
import type { Obligation } from "../types.js";

/** Net position per party name, for asserting the invariant from outside. */
function netsByName(obligations: readonly Obligation[]): Map<string, number> {
  const graph = buildGraph(obligations);
  const nets = netPositions(graph);
  return new Map(graph.nodes.map((name, index) => [name, nets[index]!]));
}

function expectNetsPreserved(before: readonly Obligation[], after: readonly Obligation[]): void {
  const a = netsByName(before);
  const b = netsByName(after);
  for (const [name, net] of a) {
    expect(b.get(name) ?? 0, `net position of ${name}`).toBe(net);
  }
  for (const [name, net] of b) {
    expect(a.get(name) ?? 0, `net position of ${name}`).toBe(net);
  }
}

describe("cycle-restricted clearing", () => {
  it("cancels a simple three-party loop completely", () => {
    const obligations: Obligation[] = [
      { from: "A", to: "B", amount: 10_000 },
      { from: "B", to: "C", amount: 10_000 },
      { from: "C", to: "A", amount: 10_000 },
    ];

    const result = clear(obligations, { mode: "cycles" });

    expect(result.remaining).toEqual([]);
    expect(result.metrics.cleared).toBe(30_000);
    expect(result.metrics.clearedRatio).toBe(1);
    expect(result.metrics.noNewCounterparties).toBe(true);
  });

  it("clears only the loop portion when amounts differ", () => {
    const obligations: Obligation[] = [
      { from: "A", to: "B", amount: 10_000 },
      { from: "B", to: "C", amount: 6_000 },
      { from: "C", to: "A", amount: 4_000 },
    ];

    const result = clear(obligations, { mode: "cycles" });

    // The tightest leg is 4,000, so 4,000 comes off all three edges.
    expect(result.metrics.cleared).toBe(12_000);
    expect(result.remaining).toEqual(
      expect.arrayContaining([
        { from: "A", to: "B", amount: 6_000 },
        { from: "B", to: "C", amount: 2_000 },
      ])
    );
    expectNetsPreserved(obligations, result.remaining);
  });

  it("never invents a counterparty", () => {
    const obligations: Obligation[] = [
      { from: "A", to: "B", amount: 5_000 },
      { from: "B", to: "C", amount: 3_000 },
      { from: "C", to: "D", amount: 7_000 },
      { from: "D", to: "A", amount: 2_000 },
      { from: "B", to: "D", amount: 1_500 },
    ];

    const result = clear(obligations, { mode: "cycles" });

    expect(result.metrics.newPairs).toEqual([]);
    expect(result.metrics.noNewCounterparties).toBe(true);
    expectNetsPreserved(obligations, result.remaining);
  });

  it("leaves an acyclic network untouched", () => {
    const obligations: Obligation[] = [
      { from: "A", to: "B", amount: 4_000 },
      { from: "B", to: "C", amount: 2_500 },
    ];

    const result = clear(obligations, { mode: "cycles" });

    expect(result.metrics.cleared).toBe(0);
    expect(result.remaining).toHaveLength(2);
  });

  it("prefers the longer loop when that clears more value", () => {
    // A short loop (A,B) and a long loop (A,B,C,D) compete for the A->B edge.
    // Taking the short one first clears 2,000 and strands the rest; taking the
    // long one clears 4,000. A greedy pass can pick either, so this pins the
    // maximal answer.
    const obligations: Obligation[] = [
      { from: "A", to: "B", amount: 1_000 },
      { from: "B", to: "A", amount: 1_000 },
      { from: "B", to: "C", amount: 1_000 },
      { from: "C", to: "D", amount: 1_000 },
      { from: "D", to: "A", amount: 1_000 },
    ];

    const result = clear(obligations, { mode: "cycles" });

    expect(result.metrics.cleared).toBe(4_000);
    expect(result.remaining).toEqual([{ from: "B", to: "A", amount: 1_000 }]);
    // Cycles alone reached the floor here, so paths mode can add nothing.
    expect(result.metrics.grossAfter).toBe(result.metrics.grossFloor);
    expect(result.optimal).toBe(true);
  });
});

describe("path-enabled compensation", () => {
  it("drives an open chain down to the floor", () => {
    const obligations: Obligation[] = [
      { from: "A", to: "B", amount: 10_000 },
      { from: "B", to: "C", amount: 10_000 },
    ];

    const result = clear(obligations, { mode: "paths" });

    // B drops out of the middle: A pays C directly.
    expect(result.remaining).toEqual([{ from: "A", to: "C", amount: 10_000 }]);
    expect(result.metrics.cleared).toBe(10_000);
    expect(result.metrics.grossAfter).toBe(result.metrics.grossFloor);
    expectNetsPreserved(obligations, result.remaining);
  });

  it("reports the counterparty it created", () => {
    const obligations: Obligation[] = [
      { from: "A", to: "B", amount: 10_000 },
      { from: "B", to: "C", amount: 10_000 },
    ];

    const result = clear(obligations, { mode: "paths" });

    expect(result.metrics.newPairs).toEqual(["A|C"]);
    expect(result.metrics.noNewCounterparties).toBe(false);
  });

  it("clears at least as much as cycle mode, and usually more", () => {
    const obligations: Obligation[] = [
      { from: "A", to: "B", amount: 8_000 },
      { from: "B", to: "C", amount: 5_000 },
      { from: "C", to: "D", amount: 9_000 },
      { from: "D", to: "E", amount: 3_000 },
      { from: "E", to: "A", amount: 2_000 },
    ];

    const cycles = clear(obligations, { mode: "cycles" });
    const paths = clear(obligations, { mode: "paths" });

    expect(paths.metrics.cleared).toBeGreaterThan(cycles.metrics.cleared);
    expect(paths.metrics.grossAfter).toBe(paths.metrics.grossFloor);
    expect(cycles.metrics.noNewCounterparties).toBe(true);
    expect(paths.metrics.noNewCounterparties).toBe(false);
    expectNetsPreserved(obligations, paths.remaining);
  });

  it("honours a refusal to be exposed to a specific party", () => {
    const obligations: Obligation[] = [
      { from: "A", to: "B", amount: 10_000 },
      { from: "B", to: "C", amount: 10_000 },
    ];

    const result = clear(obligations, {
      mode: "paths",
      forbiddenPairs: new Set(["A|C"]),
    });

    // With the shortcut banned, B has to stay in the middle.
    expect(result.metrics.newPairs).toEqual([]);
    expect(result.remaining).toHaveLength(2);
    expectNetsPreserved(obligations, result.remaining);
  });

  it("reuses an existing pair rather than creating a new one", () => {
    // B sits between A and C, and A already owes C. Routing through the
    // existing A->C edge adds no new exposure.
    const obligations: Obligation[] = [
      { from: "A", to: "B", amount: 5_000 },
      { from: "B", to: "C", amount: 5_000 },
      { from: "A", to: "C", amount: 1_000 },
    ];

    const result = clear(obligations, { mode: "paths", preferExistingPairs: true });

    expect(result.metrics.newPairs).toEqual([]);
    expect(result.remaining).toEqual([{ from: "A", to: "C", amount: 6_000 }]);
  });
});

describe("invariants", () => {
  it("rejects fractional amounts rather than rounding them", () => {
    expect(() => clear([{ from: "A", to: "B", amount: 10.5 }], { mode: "cycles" })).toThrow(
      /integer amount/i
    );
  });

  it("merges parallel obligations between the same pair", () => {
    const result = clear(
      [
        { from: "A", to: "B", amount: 1_000 },
        { from: "A", to: "B", amount: 2_500 },
      ],
      { mode: "cycles" }
    );

    expect(result.remaining).toEqual([{ from: "A", to: "B", amount: 3_500 }]);
    expect(result.metrics.obligationsBefore).toBe(1);
  });

  it("ignores self-obligations", () => {
    const result = clear([{ from: "A", to: "A", amount: 900 }], { mode: "cycles" });
    expect(result.remaining).toEqual([]);
    expect(result.metrics.grossBefore).toBe(0);
  });

  it("keeps the gross floor equal to total positive net position", () => {
    const obligations: Obligation[] = [
      { from: "A", to: "B", amount: 7_000 },
      { from: "B", to: "C", amount: 2_000 },
      { from: "C", to: "A", amount: 1_000 },
      { from: "D", to: "B", amount: 4_000 },
    ];

    const graph = buildGraph(obligations);
    const nets = netPositions(graph);
    const positive = nets.filter((net) => net > 0).reduce((sum, net) => sum + net, 0);

    expect(grossFloor(graph)).toBe(positive);
    expect(clear(obligations, { mode: "paths" }).metrics.grossAfter).toBe(positive);
  });

  it("holds net positions across a randomised network", () => {
    // Deterministic pseudo-random graph, so a failure is reproducible.
    let seed = 987_654_321;
    const random = (): number => {
      seed = (seed * 1_103_515_245 + 12_345) % 2_147_483_648;
      return seed / 2_147_483_648;
    };

    const names = Array.from({ length: 24 }, (_, i) => `p${i}`);
    const obligations: Obligation[] = [];
    for (let i = 0; i < 140; i += 1) {
      const from = names[Math.floor(random() * names.length)]!;
      const to = names[Math.floor(random() * names.length)]!;
      if (from === to) continue;
      obligations.push({ from, to, amount: Math.floor(random() * 50_000) + 1 });
    }

    for (const mode of ["cycles", "paths"] as const) {
      const result = clear(obligations, { mode });
      expectNetsPreserved(obligations, result.remaining);
      expect(result.metrics.grossAfter).toBeLessThanOrEqual(result.metrics.grossBefore);
      expect(result.metrics.grossAfter).toBeGreaterThanOrEqual(result.metrics.grossFloor);
      expect(result.optimal).toBe(true);
    }
  });
});
