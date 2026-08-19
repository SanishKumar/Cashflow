import type { Obligation } from "./types.js";

/**
 * An obligation graph with parallel edges merged and parties interned to
 * integer ids. Clearing touches the adjacency structure constantly, so the
 * inner representation is a sparse `from -> to -> amount` map.
 */
export interface Graph {
  nodes: string[];
  index: Map<string, number>;
  out: Map<number, Map<number, number>>;
}

export function buildGraph(obligations: readonly Obligation[]): Graph {
  const nodes: string[] = [];
  const index = new Map<string, number>();
  const out = new Map<number, Map<number, number>>();

  const idOf = (name: string): number => {
    const existing = index.get(name);
    if (existing !== undefined) return existing;
    const id = nodes.length;
    nodes.push(name);
    index.set(name, id);
    out.set(id, new Map());
    return id;
  };

  for (const obligation of obligations) {
    const { from, to, amount } = obligation;

    if (!Number.isInteger(amount)) {
      throw new TypeError(
        `Obligation ${from} -> ${to} must be an integer amount in minor units, received ${amount}`
      );
    }
    if (amount < 0) {
      throw new RangeError(
        `Obligation ${from} -> ${to} must not be negative; reverse the direction instead`
      );
    }
    // A zero obligation carries no information, and a party owing itself is
    // already settled by definition.
    if (amount === 0 || from === to) continue;

    const u = idOf(from);
    const v = idOf(to);
    const row = out.get(u)!;
    row.set(v, (row.get(v) ?? 0) + amount);
  }

  return { nodes, index, out };
}

export function graphToObligations(graph: Graph): Obligation[] {
  const obligations: Obligation[] = [];
  for (const [u, row] of graph.out) {
    for (const [v, amount] of row) {
      if (amount > 0) {
        obligations.push({ from: graph.nodes[u]!, to: graph.nodes[v]!, amount });
      }
    }
  }
  return obligations;
}

export function cloneGraph(graph: Graph): Graph {
  const out = new Map<number, Map<number, number>>();
  for (const [u, row] of graph.out) out.set(u, new Map(row));
  return { nodes: [...graph.nodes], index: new Map(graph.index), out };
}

/** Total value outstanding across every edge. */
export function grossTotal(graph: Graph): number {
  let total = 0;
  for (const row of graph.out.values()) {
    for (const amount of row.values()) total += amount;
  }
  return total;
}

export function obligationCount(graph: Graph): number {
  let count = 0;
  for (const row of graph.out.values()) {
    for (const amount of row.values()) if (amount > 0) count += 1;
  }
  return count;
}

/**
 * Net position per party: what they are owed minus what they owe. Positive is
 * a net creditor. Clearing must never change these — that is the whole safety
 * guarantee, so every mode is checked against it.
 */
export function netPositions(graph: Graph): number[] {
  const nets = new Array<number>(graph.nodes.length).fill(0);
  for (const [u, row] of graph.out) {
    for (const [v, amount] of row) {
      nets[u]! -= amount;
      nets[v]! += amount;
    }
  }
  return nets;
}

/**
 * The lowest gross total reachable without changing anyone's net position.
 * Cycles can be cancelled for free; this much genuinely has to be paid.
 */
export function grossFloor(graph: Graph): number {
  let floor = 0;
  for (const net of netPositions(graph)) if (net > 0) floor += net;
  return floor;
}

export function pairKey(from: string, to: string): string {
  return `${from}|${to}`;
}

/** Every ordered pair that currently carries an obligation. */
export function pairSet(graph: Graph): Set<string> {
  const pairs = new Set<string>();
  for (const [u, row] of graph.out) {
    for (const [v, amount] of row) {
      if (amount > 0) pairs.add(pairKey(graph.nodes[u]!, graph.nodes[v]!));
    }
  }
  return pairs;
}

export function edgeAmount(graph: Graph, u: number, v: number): number {
  return graph.out.get(u)?.get(v) ?? 0;
}

/** Adds `delta` to an edge, dropping it once it reaches zero. */
export function addToEdge(graph: Graph, u: number, v: number, delta: number): void {
  const row = graph.out.get(u) ?? new Map<number, number>();
  if (!graph.out.has(u)) graph.out.set(u, row);

  const next = (row.get(v) ?? 0) + delta;
  if (next < 0) {
    throw new RangeError(`Clearing drove ${graph.nodes[u]} -> ${graph.nodes[v]} negative`);
  }
  if (next === 0) row.delete(v);
  else row.set(v, next);
}
