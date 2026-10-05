import { buildGraph } from "./graph.js";
import type { Obligation } from "./types.js";

/**
 * An obligation network laid out in flat arrays.
 *
 * The default analysis re-evaluates the same network thousands of times with
 * different amounts on its arcs, and a map of maps is the wrong shape for
 * that. Here the structure is fixed once — who owes whom, and which arcs enter
 * and leave each party — and the amounts live in a separate array that can be
 * swapped without touching it.
 */
export interface Network {
  parties: string[];
  index: Map<string, number>;
  from: Int32Array;
  to: Int32Array;
  /** What is owed on each arc, parallel obligations already merged. */
  amount: Float64Array;
  /** Arcs leaving party u are `outArcs[outStart[u] .. outStart[u+1])`. */
  outStart: Int32Array;
  outArcs: Int32Array;
  /** Arcs entering party u are `inArcs[inStart[u] .. inStart[u+1])`. */
  inStart: Int32Array;
  inArcs: Int32Array;
}

function group(nodeCount: number, key: Int32Array): { start: Int32Array; arcs: Int32Array } {
  const start = new Int32Array(nodeCount + 1);
  for (let e = 0; e < key.length; e += 1) start[key[e]! + 1] = start[key[e]! + 1]! + 1;
  for (let u = 0; u < nodeCount; u += 1) start[u + 1] = start[u + 1]! + start[u]!;

  const arcs = new Int32Array(key.length);
  const fill = start.slice(0, nodeCount);
  for (let e = 0; e < key.length; e += 1) {
    const u = key[e]!;
    arcs[fill[u]!] = e;
    fill[u] = fill[u]! + 1;
  }
  return { start, arcs };
}

export function networkOf(obligations: readonly Obligation[]): Network {
  const graph = buildGraph(obligations);
  const n = graph.nodes.length;

  let count = 0;
  for (const row of graph.out.values()) count += row.size;

  const from = new Int32Array(count);
  const to = new Int32Array(count);
  const amount = new Float64Array(count);

  let next = 0;
  for (const [u, row] of graph.out) {
    for (const [v, owed] of row) {
      from[next] = u;
      to[next] = v;
      amount[next] = owed;
      next += 1;
    }
  }

  const out = group(n, from);
  const into = group(n, to);

  return {
    parties: graph.nodes,
    index: graph.index,
    from,
    to,
    amount,
    outStart: out.start,
    outArcs: out.arcs,
    inStart: into.start,
    inArcs: into.arcs,
  };
}

/** Turns an amounts array back into obligations, dropping anything settled. */
export function obligationsOf(network: Network, amount: Float64Array): Obligation[] {
  const obligations: Obligation[] = [];
  for (let e = 0; e < amount.length; e += 1) {
    if (amount[e]! > 0) {
      obligations.push({
        from: network.parties[network.from[e]!]!,
        to: network.parties[network.to[e]!]!,
        amount: amount[e]!,
      });
    }
  }
  return obligations;
}
