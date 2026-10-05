import type { Graph } from "./graph.js";
import { routeNetDebt } from "./routing.js";
import { solveMinCostFlow, type FlowProblem, type FlowSolution } from "./simplex.js";

/**
 * Exact cycle clearing for networks too large for cycle cancelling.
 *
 * Most of a real trade network is not circular at all: a retailer owes a
 * wholesaler owes a manufacturer, and nothing comes back. A cycle never leaves
 * its strongly connected component, so the network is cut into components
 * first and obligations that cross between them are set aside. They cannot
 * clear, and neither solver below ever looks at them.
 *
 * What comes back still covers the whole network. Potentials inside a
 * component are only fixed up to a constant, so each component is shifted
 * until every obligation that was set aside has a non-negative reduced cost.
 * The result is a single certificate `verifyFlow` can check against the
 * original problem, with no need to trust that the decomposition was sound.
 */

export interface ExactCirculation {
  arcs: { u: number; v: number; cap: number; flow: number }[];
  cleared: number;
  /** Pivots taken by simplex, or route lengths worked through by routing. */
  work: number;
  /** The whole network as a flow problem, and its solution, for `verifyFlow`. */
  problem: FlowProblem;
  solution: FlowSolution;
}

/** Adjacency in compressed-row form: arcs leaving node u are `arcs[start[u] .. start[u+1])`. */
interface Adjacency {
  start: Int32Array;
  arcs: Int32Array;
}

function adjacencyOf(nodeCount: number, from: Int32Array): Adjacency {
  const start = new Int32Array(nodeCount + 1);
  for (let e = 0; e < from.length; e += 1) start[from[e]! + 1] = start[from[e]! + 1]! + 1;
  for (let u = 0; u < nodeCount; u += 1) start[u + 1] = start[u + 1]! + start[u]!;

  const arcs = new Int32Array(from.length);
  const fill = start.slice(0, nodeCount);
  for (let e = 0; e < from.length; e += 1) {
    const u = from[e]!;
    arcs[fill[u]!] = e;
    fill[u] = fill[u]! + 1;
  }
  return { start, arcs };
}

/**
 * Strongly connected components, numbered so that every arc between two
 * components runs from the higher number to the lower.
 *
 * Tarjan's algorithm, written with an explicit stack: a supply chain can be
 * tens of thousands of firms deep along one path, which is further than the
 * call stack goes.
 */
function componentsOf(
  nodeCount: number,
  to: Int32Array,
  adjacency: Adjacency
): { component: Int32Array; count: number } {
  const order = new Int32Array(nodeCount).fill(-1);
  const low = new Int32Array(nodeCount);
  const component = new Int32Array(nodeCount).fill(-1);
  const cursor = adjacency.start.slice(0, nodeCount);
  const open = new Int32Array(nodeCount);
  const path = new Int32Array(nodeCount);
  let openTop = 0;
  let pathTop = 0;
  let visited = 0;
  let count = 0;

  for (let seed = 0; seed < nodeCount; seed += 1) {
    if (order[seed] !== -1) continue;

    order[seed] = visited;
    low[seed] = visited;
    visited += 1;
    open[openTop] = seed;
    openTop += 1;
    path[pathTop] = seed;
    pathTop += 1;

    while (pathTop > 0) {
      const u = path[pathTop - 1]!;

      if (cursor[u]! < adjacency.start[u + 1]!) {
        const v = to[adjacency.arcs[cursor[u]!]!]!;
        cursor[u] = cursor[u]! + 1;

        if (order[v] === -1) {
          order[v] = visited;
          low[v] = visited;
          visited += 1;
          open[openTop] = v;
          openTop += 1;
          path[pathTop] = v;
          pathTop += 1;
        } else if (component[v] === -1 && order[v]! < low[u]!) {
          // Still open, so it is on a cycle with u.
          low[u] = order[v]!;
        }
        continue;
      }

      pathTop -= 1;
      if (pathTop > 0) {
        const above = path[pathTop - 1]!;
        if (low[u]! < low[above]!) low[above] = low[u]!;
      }
      if (low[u] === order[u]) {
        for (;;) {
          openTop -= 1;
          const w = open[openTop]!;
          component[w] = count;
          if (w === u) break;
        }
        count += 1;
      }
    }
  }

  return { component, count };
}

/** What a solver hands back for the obligations inside components. */
interface Inside {
  /** Value cleared on each obligation it was given. */
  cleared: Float64Array;
  /** Potential per party, in the circulation problem's convention. */
  potential: Float64Array;
  work: number;
}

type InsideSolver = (
  parties: number,
  from: Int32Array,
  to: Int32Array,
  capacity: Float64Array
) => Inside;

function solveInsideComponents(graph: Graph, solve: InsideSolver): ExactCirculation {
  const n = graph.nodes.length;

  let count = 0;
  for (const row of graph.out.values()) {
    for (const amount of row.values()) if (amount > 0) count += 1;
  }

  const from = new Int32Array(count);
  const to = new Int32Array(count);
  const capacity = new Float64Array(count);

  let next = 0;
  for (const [u, row] of graph.out) {
    for (const [v, amount] of row) {
      if (amount <= 0) continue;
      from[next] = u;
      to[next] = v;
      capacity[next] = amount;
      next += 1;
    }
  }

  const adjacency = adjacencyOf(n, from);
  const { component, count: componentCount } = componentsOf(n, to, adjacency);

  // The obligations that can lie on a cycle, and where each sits in the
  // reduced problem.
  const reducedIndex = new Int32Array(count).fill(-1);
  let reducedCount = 0;
  for (let e = 0; e < count; e += 1) {
    if (component[from[e]!] === component[to[e]!]) {
      reducedIndex[e] = reducedCount;
      reducedCount += 1;
    }
  }

  const reducedFrom = new Int32Array(reducedCount);
  const reducedTo = new Int32Array(reducedCount);
  const reducedCapacity = new Float64Array(reducedCount);
  for (let e = 0; e < count; e += 1) {
    const at = reducedIndex[e]!;
    if (at === -1) continue;
    reducedFrom[at] = from[e]!;
    reducedTo[at] = to[e]!;
    reducedCapacity[at] = capacity[e]!;
  }

  const inside = solve(n, reducedFrom, reducedTo, reducedCapacity);

  // Components are numbered sinks-first, so by the time one is reached every
  // component it points to has already been given its shift.
  const members = new Int32Array(n);
  const memberStart = new Int32Array(componentCount + 1);
  for (let u = 0; u < n; u += 1) {
    memberStart[component[u]! + 1] = memberStart[component[u]! + 1]! + 1;
  }
  for (let c = 0; c < componentCount; c += 1) {
    memberStart[c + 1] = memberStart[c + 1]! + memberStart[c]!;
  }
  {
    const fill = memberStart.slice(0, componentCount);
    for (let u = 0; u < n; u += 1) {
      const c = component[u]!;
      members[fill[c]!] = u;
      fill[c] = fill[c]! + 1;
    }
  }

  const lift = new Float64Array(componentCount);
  for (let c = 0; c < componentCount; c += 1) {
    let needed = 0;
    for (let i = memberStart[c]!; i < memberStart[c + 1]!; i += 1) {
      const u = members[i]!;
      for (let k = adjacency.start[u]!; k < adjacency.start[u + 1]!; k += 1) {
        const v = to[adjacency.arcs[k]!]!;
        const other = component[v]!;
        if (other === c) continue;
        const gap = 1 + inside.potential[v]! + lift[other]! - inside.potential[u]!;
        if (gap > needed) needed = gap;
      }
    }
    lift[c] = needed;
  }

  const potential = new Float64Array(n);
  for (let u = 0; u < n; u += 1) potential[u] = inside.potential[u]! + lift[component[u]!]!;

  const flow = new Float64Array(count);
  const arcs: ExactCirculation["arcs"] = [];
  let cleared = 0;
  for (let e = 0; e < count; e += 1) {
    const at = reducedIndex[e]!;
    const carried = at === -1 ? 0 : inside.cleared[at]!;
    flow[e] = carried;
    cleared += carried;
    arcs.push({ u: from[e]!, v: to[e]!, cap: capacity[e]!, flow: carried });
  }

  const problem: FlowProblem = {
    nodeCount: n,
    from,
    to,
    capacity,
    cost: new Float64Array(count).fill(-1),
  };
  const solution: FlowSolution = {
    status: "optimal",
    flow,
    potential,
    cost: cleared === 0 ? 0 : -cleared,
    pivots: inside.work,
  };

  return { arcs, cleared, work: inside.work, problem, solution };
}

/**
 * Cycle clearing as one minimum-cost flow: capacity is what is owed, cost is
 * -1 per unit cleared, and with no supplies anywhere the cheapest flow is the
 * largest circulation.
 *
 * The solver is given a head start. Parties are ranked by the longest chain
 * of obligations below them, ignoring the arcs a depth-first search finds
 * closing a loop, and each is hung from the creditor ranked just beneath it.
 * In that tree only the loop-closing arcs can improve anything, so the solver
 * starts with the network's shape already found instead of discovering it one
 * degenerate pivot at a time.
 */
export function maximiseCirculationBySimplex(graph: Graph): ExactCirculation {
  return solveInsideComponents(graph, (parties, from, to, capacity) => {
    const adjacency = adjacencyOf(parties, from);
    const rank = new Int32Array(parties);
    const startTree = new Int32Array(parties).fill(-1);
    const seen = new Uint8Array(parties); // 0 unseen, 1 being explored, 2 ranked
    const cursor = adjacency.start.slice(0, parties);
    const path = new Int32Array(parties);
    const arrivedBy = new Int32Array(parties).fill(-1);

    const consider = (u: number, v: number, arc: number): void => {
      if (rank[v]! + 1 > rank[u]!) {
        rank[u] = rank[v]! + 1;
        startTree[u] = arc;
      }
    };

    // An arc to a party still being explored closes a loop and is skipped.
    // Every other arc leads to a party already ranked, so ranks only ever
    // step down along the tree and it cannot contain a cycle.
    for (let seed = 0; seed < parties; seed += 1) {
      if (seen[seed] !== 0) continue;
      seen[seed] = 1;
      path[0] = seed;
      let top = 1;

      while (top > 0) {
        const u = path[top - 1]!;

        if (cursor[u]! < adjacency.start[u + 1]!) {
          const arc = adjacency.arcs[cursor[u]!]!;
          cursor[u] = cursor[u]! + 1;
          const v = to[arc]!;

          if (seen[v] === 0) {
            seen[v] = 1;
            arrivedBy[v] = arc;
            path[top] = v;
            top += 1;
          } else if (seen[v] === 2) {
            consider(u, v, arc);
          }
          continue;
        }

        seen[u] = 2;
        top -= 1;
        if (top > 0) consider(path[top - 1]!, u, arrivedBy[u]!);
      }
    }

    const solution = solveMinCostFlow(
      {
        nodeCount: parties,
        from,
        to,
        capacity,
        cost: new Float64Array(from.length).fill(-1),
      },
      { startTree }
    );

    return { cleared: solution.flow, potential: solution.potential, work: solution.pivots };
  });
}

/**
 * Cycle clearing by routing net debt along the shortest chains (routing.ts).
 * What is routed is what stays outstanding, so what cleared is the rest of
 * each obligation, and the potentials are the routing potentials with the
 * sign turned round.
 */
export function maximiseCirculationByRouting(graph: Graph): ExactCirculation {
  return solveInsideComponents(graph, (parties, from, to, capacity) => {
    const routed = routeNetDebt(parties, from, to, capacity);

    const cleared = new Float64Array(from.length);
    for (let e = 0; e < from.length; e += 1) cleared[e] = capacity[e]! - routed.remaining[e]!;

    const potential = new Float64Array(parties);
    for (let u = 0; u < parties; u += 1) {
      potential[u] = routed.potential[u] === 0 ? 0 : -routed.potential[u]!;
    }

    return { cleared, potential, work: routed.phases };
  });
}
