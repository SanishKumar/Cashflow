/**
 * How far exact clearing goes.
 *
 * Times the two large-network solvers against the sizes real clearing systems
 * run at, and re-verifies every answer from its certificate so the figures
 * are checked rather than just fast.
 *
 * Run with: npm run bench:scale
 * Add a word from a network's name to run only that one. The national
 * invoice register takes several minutes and only runs that way:
 *   npm run bench:scale register
 */

import { maximiseCirculation } from "../src/circulation.js";
import {
  maximiseCirculationByRouting,
  maximiseCirculationBySimplex,
  type ExactCirculation,
} from "../src/components.js";
import { generateNetwork, type NetworkSpec } from "../src/generate.js";
import { buildGraph, grossTotal, obligationCount, type Graph } from "../src/graph.js";
import { verifyFlow } from "../src/simplex.js";

interface Scale extends NetworkSpec {
  /** Where the size comes from. */
  basis: string;
  /** Cycle cancelling is only run where it finishes in reasonable time. */
  cancelling: boolean;
  /** Simplex is skipped where it would take minutes. */
  simplex: boolean;
  /** Takes minutes, so it only runs when asked for by name. */
  onRequest?: boolean;
}

const SCALES: Scale[] = [
  {
    name: "regional supply chain",
    basis: "the largest network in bench/run.ts",
    firms: 2_000,
    invoices: 15_000,
    reciprocity: 0.05,
    tiers: 6,
    backflow: 0.08,
    seed: 14,
    cancelling: true,
    simplex: true,
  },
  {
    name: "national monthly round",
    basis: "AJPES, Slovenia: 5,880,447 obligations over 111 rounds",
    firms: 24_000,
    invoices: 53_000,
    reciprocity: 0.05,
    tiers: 6,
    backflow: 0.08,
    seed: 21,
    cancelling: false,
    simplex: true,
  },
  {
    name: "published invoice corpus",
    basis: "arXiv 2606.26126: 133,191 invoices",
    firms: 40_000,
    invoices: 133_191,
    reciprocity: 0.05,
    tiers: 8,
    backflow: 0.08,
    seed: 22,
    cancelling: false,
    simplex: true,
  },
  {
    name: "national invoice register",
    basis: "Italy, December 2020: 1.28M invoices, 760k firms",
    firms: 760_000,
    invoices: 1_280_000,
    reciprocity: 0.05,
    tiers: 8,
    backflow: 0.08,
    seed: 23,
    cancelling: false,
    simplex: false,
    onRequest: true,
  },
];

const only = process.argv[2];

function duration(ms: number): string {
  return ms < 1_000 ? `${ms.toFixed(0)} ms` : `${(ms / 1_000).toFixed(2)} s`;
}

function time(
  label: string,
  graph: Graph,
  solve: (graph: Graph) => ExactCirculation
): { cleared: number; ms: number } {
  const start = performance.now();
  const result = solve(graph);
  const ms = performance.now() - start;

  const verifyStart = performance.now();
  const verdict = verifyFlow(result.problem, result.solution);
  const verifyMs = performance.now() - verifyStart;

  console.log(
    `  ${label.padEnd(16)} ${duration(ms).padStart(9)}   ` +
      (verdict.valid
        ? `certificate verified in ${duration(verifyMs)}`
        : `CERTIFICATE REJECTED: ${verdict.reason}`)
  );
  return { cleared: result.cleared, ms };
}

console.log("\nExact cycle clearing at scale\n");

for (const scale of SCALES) {
  if (only ? !scale.name.includes(only) : scale.onRequest) continue;

  const obligations = generateNetwork(scale);
  const graph = buildGraph(obligations);
  const gross = grossTotal(graph);

  console.log(`${scale.name}  —  ${scale.basis}`);
  console.log(
    `  ${graph.nodes.length.toLocaleString("en-US")} firms, ` +
      `${obligationCount(graph).toLocaleString("en-US")} obligations`
  );

  const routing = time("routing", graph, maximiseCirculationByRouting);
  const optima = [routing.cleared];

  if (scale.simplex) optima.push(time("network simplex", graph, maximiseCirculationBySimplex).cleared);

  if (scale.cancelling) {
    const start = performance.now();
    const cancelling = maximiseCirculation(buildGraph(obligations));
    const ms = performance.now() - start;
    optima.push(cancelling.cleared);
    console.log(
      `  ${"cycle cancelling".padEnd(16)} ${duration(ms).padStart(9)}   ` +
        `${(ms / routing.ms).toFixed(0)}x the routing time`
    );
  }

  const agree = optima.every((value) => value === optima[0]);
  console.log(
    `  cleared ${((routing.cleared / gross) * 100).toFixed(2)}% of gross` +
      (optima.length > 1 ? (agree ? ", every solver agreeing" : " — SOLVERS DISAGREE") : "")
  );
  console.log();
}
