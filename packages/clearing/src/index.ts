import { maximiseCirculation } from "./circulation.js";
import { compensatePaths } from "./compensation.js";
import { maximiseCirculationByRouting, maximiseCirculationBySimplex } from "./components.js";
import {
  buildGraph,
  grossFloor,
  grossTotal,
  graphToObligations,
  netPositions,
  obligationCount,
  pairSet,
  type Graph,
} from "./graph.js";
import type { ClearingCertificate, ClearingOptions, ClearingResult, Obligation } from "./types.js";

export type {
  ClearingCertificate,
  ClearingMetrics,
  ClearingMode,
  ClearingOptions,
  ClearingResult,
  ClearingSolver,
  Obligation,
} from "./types.js";
export { buildGraph, graphToObligations, grossFloor, grossTotal, netPositions, pairSet } from "./graph.js";
export { generateNetwork, makeRandom, type NetworkSpec } from "./generate.js";
export { generateCash, type CashSpec } from "./balance.js";
export { cascade, type Cascade, type CascadeOptions, type PartyOutcome } from "./cascade.js";
export { rescue, type RescueOptions, type RescuePlan } from "./rescue.js";
export { verifyClearing } from "./certificate.js";
export {
  maximiseCirculationByRouting,
  maximiseCirculationBySimplex,
  type ExactCirculation,
} from "./components.js";
export {
  solveMinCostFlow,
  verifyFlow,
  type FlowOptions,
  type FlowProblem,
  type FlowSolution,
  type FlowStatus,
  type FlowVerdict,
} from "./simplex.js";

const DEFAULT_MAX_ITERATIONS = 100_000;

/** Writes a circulation's flows back onto the graph as reduced obligations. */
function applyCirculation(graph: Graph, arcs: readonly { u: number; v: number; cap: number; flow: number }[]): void {
  for (const row of graph.out.values()) row.clear();
  for (const arc of arcs) {
    const remaining = arc.cap - arc.flow;
    if (remaining > 0) graph.out.get(arc.u)!.set(arc.v, remaining);
  }
}

/**
 * Clears an obligation network.
 *
 * Both modes preserve every party's net position exactly; they differ only in
 * whether a party may be handed a counterparty they did not already have.
 * That difference is the whole point, so it is measured and returned rather
 * than buried.
 */
export function clear(
  obligations: readonly Obligation[],
  options: ClearingOptions
): ClearingResult {
  const graph = buildGraph(obligations);

  const grossBefore = grossTotal(graph);
  const obligationsBefore = obligationCount(graph);
  const originalPairs = pairSet(graph);
  const floor = grossFloor(graph);
  const netsBefore = netPositions(graph);

  // Path compensation takes a step or two per obligation, so the default
  // ceiling has to grow with the network or large ones stop short of the floor.
  const maxIterations =
    options.maxIterations ?? Math.max(DEFAULT_MAX_ITERATIONS, obligationsBefore * 20);
  const solver = options.solver ?? "cancelling";

  let optimal: boolean;
  let iterations: number;
  let certificate: ClearingCertificate | undefined;

  if (solver === "cancelling") {
    const circulation = maximiseCirculation(graph, maxIterations);
    applyCirculation(graph, circulation.arcs);
    optimal = circulation.optimal;
    iterations = circulation.iterations;
  } else {
    const exact =
      solver === "routing"
        ? maximiseCirculationByRouting(graph)
        : maximiseCirculationBySimplex(graph);
    applyCirculation(graph, exact.arcs);
    optimal = true;
    iterations = exact.work;
    if (options.mode === "cycles") {
      certificate = {
        potential: graph.nodes.map((party, index) => [party, exact.solution.potential[index]!]),
      };
    }
  }

  if (options.mode === "paths") {
    const compensation = compensatePaths(graph, {
      preferExistingPairs: options.preferExistingPairs ?? true,
      forbiddenPairs: options.forbiddenPairs,
      maxIterations: Math.max(0, maxIterations - iterations),
    });
    optimal = optimal && compensation.optimal;
    iterations += compensation.iterations;
  }

  const netsAfter = netPositions(graph);
  for (let node = 0; node < netsBefore.length; node += 1) {
    if (netsBefore[node] !== netsAfter[node]) {
      throw new Error(
        `Clearing changed the net position of ${graph.nodes[node]}: ` +
          `${netsBefore[node]} became ${netsAfter[node]}`
      );
    }
  }

  const grossAfter = grossTotal(graph);
  const finalPairs = pairSet(graph);
  const newPairs = [...finalPairs].filter((pair) => !originalPairs.has(pair)).sort();

  return {
    mode: options.mode,
    remaining: graphToObligations(graph),
    metrics: {
      grossBefore,
      grossAfter,
      cleared: grossBefore - grossAfter,
      clearedRatio: grossBefore === 0 ? 0 : (grossBefore - grossAfter) / grossBefore,
      grossFloor: floor,
      obligationsBefore,
      obligationsAfter: obligationCount(graph),
      newPairs,
      noNewCounterparties: newPairs.length === 0,
    },
    optimal,
    iterations,
    ...(certificate ? { certificate } : {}),
  };
}
