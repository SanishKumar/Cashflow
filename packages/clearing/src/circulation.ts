import type { Graph } from "./graph.js";

/**
 * Cycle-restricted netting, as a maximum-circulation problem.
 *
 * We look for a flow that respects every obligation as a capacity and
 * conserves value at every party. Conservation is exactly the safety property:
 * whatever flows into a party also flows out, so nobody's net position moves
 * and no new counterparty appears. Maximising the total flow maximises the
 * obligation value that simply cancels out.
 *
 * That is a minimum-cost circulation with a cost of -1 per unit on every
 * obligation, and it is solved here in two phases:
 *
 *   1. Saturate plain directed cycles by depth-first search. Cheap, and it
 *      recovers most of the value on realistic graphs.
 *   2. Cancel negative-cost cycles in the residual network until none remain.
 *      This is the phase that makes the answer provably maximal: a circulation
 *      is optimal exactly when its residual network has no negative cycle.
 *
 * Phase 2 alone would be correct; phase 1 exists to keep it fast.
 */

interface Arc {
  u: number;
  v: number;
  cap: number;
  flow: number;
}

export interface CirculationResult {
  /** Cleared value per arc, aligned with the arc list order. */
  arcs: Arc[];
  cleared: number;
  optimal: boolean;
  iterations: number;
  /** Cycles saturated in phase 1, and negative cycles cancelled in phase 2. */
  saturated: number;
  cancelled: number;
  /** Value phase 2 added on top of phase 1. */
  refinement: number;
}

export interface CirculationOptions {
  maxIterations?: number;
  /**
   * Run phase 2. Leaving it on is what makes the result provably maximal;
   * turning it off trades that proof for speed on very large networks.
   */
  exact?: boolean;
}

function buildArcs(graph: Graph): Arc[] {
  const arcs: Arc[] = [];
  for (const [u, row] of graph.out) {
    for (const [v, amount] of row) {
      if (amount > 0) arcs.push({ u, v, cap: amount, flow: 0 });
    }
  }
  return arcs;
}

/**
 * Phase 1 — repeatedly find one directed cycle of unsaturated arcs and push as
 * much as its tightest arc allows.
 */
function saturateDirectedCycles(arcs: Arc[], nodeCount: number, budget: number): number {
  let iterations = 0;

  for (;;) {
    if (iterations >= budget) return iterations;

    // Adjacency over arcs that still have room.
    const adjacency: number[][] = Array.from({ length: nodeCount }, () => []);
    for (let i = 0; i < arcs.length; i += 1) {
      const arc = arcs[i]!;
      if (arc.cap - arc.flow > 0) adjacency[arc.u]!.push(i);
    }

    const state = new Uint8Array(nodeCount); // 0 unseen, 1 on stack, 2 done
    const arcInto = new Int32Array(nodeCount).fill(-1);
    let cycleStart = -1;
    let cycleEnd = -1;

    for (let root = 0; root < nodeCount && cycleStart === -1; root += 1) {
      if (state[root] !== 0) continue;

      // Iterative DFS; `cursor` tracks how far each node's arc list is explored.
      const stack: number[] = [root];
      const cursor: number[] = [0];
      state[root] = 1;

      while (stack.length > 0 && cycleStart === -1) {
        const node = stack[stack.length - 1]!;
        const list = adjacency[node]!;
        const at = cursor[cursor.length - 1]!;

        if (at >= list.length) {
          state[node] = 2;
          stack.pop();
          cursor.pop();
          continue;
        }

        cursor[cursor.length - 1] = at + 1;
        const arcIndex = list[at]!;
        const next = arcs[arcIndex]!.v;

        if (state[next] === 1) {
          // Back edge onto the current stack closes a cycle.
          arcInto[next] = arcIndex;
          cycleStart = next;
          cycleEnd = node;
          break;
        }
        if (state[next] === 0) {
          arcInto[next] = arcIndex;
          state[next] = 1;
          stack.push(next);
          cursor.push(0);
        }
      }
    }

    if (cycleStart === -1) return iterations;

    // Walk the cycle back from the closing edge.
    const cycle: number[] = [arcInto[cycleStart]!];
    let node = cycleEnd;
    while (node !== cycleStart) {
      const arcIndex = arcInto[node]!;
      cycle.push(arcIndex);
      node = arcs[arcIndex]!.u;
    }

    let bottleneck = Infinity;
    for (const arcIndex of cycle) {
      const arc = arcs[arcIndex]!;
      bottleneck = Math.min(bottleneck, arc.cap - arc.flow);
    }
    if (!Number.isFinite(bottleneck) || bottleneck <= 0) return iterations;

    for (const arcIndex of cycle) arcs[arcIndex]!.flow += bottleneck;
    iterations += 1;
  }
}

interface ResidualArc {
  from: number;
  to: number;
  cost: number;
  arcIndex: number;
  forward: boolean;
  residual: number;
}

function residualAdjacency(arcs: Arc[], nodeCount: number): ResidualArc[][] {
  const adjacency: ResidualArc[][] = Array.from({ length: nodeCount }, () => []);
  for (let i = 0; i < arcs.length; i += 1) {
    const arc = arcs[i]!;
    const room = arc.cap - arc.flow;
    // Clearing another unit removes a unit of obligation: cost -1.
    if (room > 0) {
      adjacency[arc.u]!.push({ from: arc.u, to: arc.v, cost: -1, arcIndex: i, forward: true, residual: room });
    }
    // Undoing a unit puts obligation back: cost +1.
    if (arc.flow > 0) {
      adjacency[arc.v]!.push({ from: arc.v, to: arc.u, cost: 1, arcIndex: i, forward: false, residual: arc.flow });
    }
  }
  return adjacency;
}

/**
 * Negative-cycle detection by queue-driven Bellman-Ford.
 *
 * Every node starts at distance zero, which is equivalent to a virtual source
 * reaching the whole graph for free, so one run finds a negative cycle
 * anywhere in the residual network.
 *
 * The cycle is caught the instant it forms: before relaxing `u -> v`, we walk
 * `u` up the predecessor tree, and if `v` is already an ancestor then the two
 * together close a negative cycle. Waiting for a relaxation counter to exceed
 * the node count instead — the textbook SPFA test — measured slower here,
 * because it lets the queue churn long after the cycle exists.
 */
function findNegativeCycle(arcs: Arc[], nodeCount: number): ResidualArc[] | null {
  const adjacency = residualAdjacency(arcs, nodeCount);

  const dist = new Float64Array(nodeCount);
  const predecessor = new Array<ResidualArc | null>(nodeCount).fill(null);
  const queued = new Uint8Array(nodeCount);

  const queue: number[] = [];
  for (let node = 0; node < nodeCount; node += 1) {
    if (adjacency[node]!.length > 0) {
      queue.push(node);
      queued[node] = 1;
    }
  }

  let head = 0;
  while (head < queue.length) {
    const node = queue[head]!;
    head += 1;
    queued[node] = 0;

    // Reclaim the consumed prefix so the queue does not grow without bound.
    if (head > 1_024 && head * 2 > queue.length) {
      queue.copyWithin(0, head);
      queue.length -= head;
      head = 0;
    }

    for (const arc of adjacency[node]!) {
      const candidate = dist[node]! + arc.cost;
      if (candidate >= dist[arc.to]! - 1e-9) continue;

      // Would this relaxation close a loop in the predecessor tree?
      let ancestor: number = node;
      for (let steps = 0; steps <= nodeCount; steps += 1) {
        if (ancestor === arc.to) {
          const cycle: ResidualArc[] = [arc];
          let walk = node;
          while (walk !== arc.to) {
            const previous = predecessor[walk];
            if (!previous) return null;
            cycle.push(previous);
            walk = previous.from;
          }
          return cycle;
        }
        const previous = predecessor[ancestor];
        if (!previous) break;
        ancestor = previous.from;
      }

      dist[arc.to] = candidate;
      predecessor[arc.to] = arc;
      if (queued[arc.to] === 0) {
        queued[arc.to] = 1;
        queue.push(arc.to);
      }
    }
  }

  return null;
}

function totalFlow(arcs: readonly Arc[]): number {
  let total = 0;
  for (const arc of arcs) total += arc.flow;
  return total;
}

export function maximiseCirculation(
  graph: Graph,
  options: CirculationOptions | number = {}
): CirculationResult {
  const settings: CirculationOptions =
    typeof options === "number" ? { maxIterations: options } : options;
  const maxIterations = settings.maxIterations ?? 100_000;
  const exact = settings.exact ?? true;

  const arcs = buildArcs(graph);
  const nodeCount = graph.nodes.length;

  const saturated = saturateDirectedCycles(arcs, nodeCount, maxIterations);
  const afterPhaseOne = totalFlow(arcs);

  let iterations = saturated;
  let cancelled = 0;
  let optimal = true;

  if (exact) {
    while (iterations < maxIterations) {
      const cycle = findNegativeCycle(arcs, nodeCount);
      if (!cycle) break;

      let bottleneck = Infinity;
      for (const arc of cycle) bottleneck = Math.min(bottleneck, arc.residual);
      if (!Number.isFinite(bottleneck) || bottleneck <= 0) break;

      for (const arc of cycle) {
        const target = arcs[arc.arcIndex]!;
        target.flow += arc.forward ? bottleneck : -bottleneck;
      }
      iterations += 1;
      cancelled += 1;
    }
    if (iterations >= maxIterations) optimal = false;
  } else {
    optimal = false;
  }

  const cleared = totalFlow(arcs);

  return {
    arcs,
    cleared,
    optimal,
    iterations,
    saturated,
    cancelled,
    refinement: cleared - afterPhaseOne,
  };
}
