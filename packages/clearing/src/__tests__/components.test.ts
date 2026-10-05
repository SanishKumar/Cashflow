import { describe, expect, it } from "vitest";
import { maximiseCirculation } from "../circulation.js";
import {
  maximiseCirculationByRouting,
  maximiseCirculationBySimplex,
  type ExactCirculation,
} from "../components.js";
import { generateNetwork, makeRandom } from "../generate.js";
import { buildGraph, type Graph } from "../graph.js";
import { verifyFlow } from "../simplex.js";
import type { Obligation } from "../types.js";

const SOLVERS: Array<[string, (graph: Graph) => ExactCirculation]> = [
  ["network simplex", maximiseCirculationBySimplex],
  ["routing", maximiseCirculationByRouting],
];

function randomObligations(seed: number, parties: number, count: number, ceiling: number): Obligation[] {
  const random = makeRandom(seed);
  const obligations: Obligation[] = [];
  for (let i = 0; i < count; i += 1) {
    const from = Math.floor(random() * parties);
    const to = Math.floor(random() * parties);
    if (from === to) continue;
    obligations.push({ from: `p${from}`, to: `p${to}`, amount: Math.floor(random() * ceiling) + 1 });
  }
  return obligations;
}

/** Net change per party from a set of cleared flows. Zero everywhere for a circulation. */
function imbalance(result: ExactCirculation, parties: number): number[] {
  const change = new Array<number>(parties).fill(0);
  for (const arc of result.arcs) {
    change[arc.u]! -= arc.flow;
    change[arc.v]! += arc.flow;
  }
  return change;
}

describe.each(SOLVERS)("exact clearing by %s", (_name, solve) => {
  it("clears a three-party loop to its tightest leg", () => {
    const result = solve(
      buildGraph([
        { from: "A", to: "B", amount: 10_000 },
        { from: "B", to: "C", amount: 6_000 },
        { from: "C", to: "A", amount: 4_000 },
      ])
    );

    expect(result.cleared).toBe(12_000);
    expect(result.arcs.map((arc) => arc.flow)).toEqual([4_000, 4_000, 4_000]);
    expect(verifyFlow(result.problem, result.solution)).toEqual({ valid: true });
  });

  it("takes the longer loop when two compete for one obligation", () => {
    const result = solve(
      buildGraph([
        { from: "A", to: "B", amount: 1_000 },
        { from: "B", to: "A", amount: 1_000 },
        { from: "B", to: "C", amount: 1_000 },
        { from: "C", to: "D", amount: 1_000 },
        { from: "D", to: "A", amount: 1_000 },
      ])
    );

    expect(result.cleared).toBe(4_000);
  });

  it("clears nothing from an acyclic network, and can prove it", () => {
    const result = solve(
      buildGraph([
        { from: "A", to: "B", amount: 4_000 },
        { from: "B", to: "C", amount: 2_500 },
        { from: "A", to: "C", amount: 900 },
      ])
    );

    expect(result.cleared).toBe(0);
    expect(verifyFlow(result.problem, result.solution)).toEqual({ valid: true });
  });

  it("leaves an obligation between two loops alone", () => {
    // Two separate loops joined by a one-way obligation. The bridge is on no
    // cycle, so it cannot clear, and the certificate has to say so too.
    const result = solve(
      buildGraph([
        { from: "A", to: "B", amount: 500 },
        { from: "B", to: "A", amount: 300 },
        { from: "B", to: "C", amount: 9_000 },
        { from: "C", to: "D", amount: 700 },
        { from: "D", to: "C", amount: 700 },
      ])
    );

    const bridge = result.arcs.find((arc) => arc.cap === 9_000)!;

    expect(bridge.flow).toBe(0);
    expect(result.cleared).toBe(300 * 2 + 700 * 2);
    expect(verifyFlow(result.problem, result.solution)).toEqual({ valid: true });
  });

  it("never clears more than is owed and never moves a net position", () => {
    const obligations = randomObligations(7, 40, 260, 80_000);
    const graph = buildGraph(obligations);
    const result = solve(graph);

    for (const arc of result.arcs) {
      expect(arc.flow).toBeGreaterThanOrEqual(0);
      expect(arc.flow).toBeLessThanOrEqual(arc.cap);
    }
    expect(imbalance(result, graph.nodes.length).every((change) => change === 0)).toBe(true);
  });

  it("agrees with cycle cancelling on every randomised network", () => {
    // Unrelated algorithms reaching the same optimum is the strongest evidence
    // any of them is right. Dense, sparse, tiny and lopsided amounts are all
    // in the mix.
    for (let seed = 1; seed <= 400; seed += 1) {
      const random = makeRandom(seed * 104_729);
      const parties = 2 + Math.floor(random() * 30);
      const count = 1 + Math.floor(random() * parties * 5);
      const ceiling = random() < 0.3 ? 3 : 50_000;
      const obligations = randomObligations(seed, parties, count, ceiling);

      const cancelling = maximiseCirculation(buildGraph(obligations));
      const result = solve(buildGraph(obligations));

      expect(cancelling.optimal, `seed ${seed}`).toBe(true);
      expect(result.cleared, `seed ${seed}`).toBe(cancelling.cleared);
      expect(verifyFlow(result.problem, result.solution), `seed ${seed}`).toEqual({ valid: true });
    }
  });

  it("agrees with cycle cancelling on a tiered supply chain", () => {
    const obligations = generateNetwork({
      name: "supply chain",
      firms: 300,
      invoices: 2_400,
      reciprocity: 0.05,
      tiers: 6,
      backflow: 0.08,
      seed: 31,
    });

    const cancelling = maximiseCirculation(buildGraph(obligations));
    const result = solve(buildGraph(obligations));

    expect(result.cleared).toBe(cancelling.cleared);
    expect(verifyFlow(result.problem, result.solution)).toEqual({ valid: true });
  });
});

describe("the two large-network solvers", () => {
  it("reach the same optimum on a network cycle cancelling would take minutes over", () => {
    const graph = (): Graph =>
      buildGraph(
        generateNetwork({
          name: "regional",
          firms: 2_000,
          invoices: 15_000,
          reciprocity: 0.05,
          tiers: 6,
          backflow: 0.08,
          seed: 14,
        })
      );

    const simplex = maximiseCirculationBySimplex(graph());
    const routing = maximiseCirculationByRouting(graph());

    expect(routing.cleared).toBe(simplex.cleared);
    expect(verifyFlow(simplex.problem, simplex.solution)).toEqual({ valid: true });
    expect(verifyFlow(routing.problem, routing.solution)).toEqual({ valid: true });
  });
});
