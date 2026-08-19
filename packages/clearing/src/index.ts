import { maximiseCirculation } from "./circulation.js";
import { compensatePaths } from "./compensation.js";
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
import type { ClearingOptions, ClearingResult, Obligation } from "./types.js";

export type {
  ClearingMetrics,
  ClearingMode,
  ClearingOptions,
  ClearingResult,
  Obligation,
} from "./types.js";
export { buildGraph, graphToObligations, grossFloor, grossTotal, netPositions, pairSet } from "./graph.js";
export { generateNetwork, makeRandom, type NetworkSpec } from "./generate.js";

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

  const maxIterations = options.maxIterations ?? DEFAULT_MAX_ITERATIONS;

  const circulation = maximiseCirculation(graph, maxIterations);
  applyCirculation(graph, circulation.arcs);

  let optimal = circulation.optimal;
  let iterations = circulation.iterations;

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
  };
}
