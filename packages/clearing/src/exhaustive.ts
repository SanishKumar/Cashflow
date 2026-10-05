import { resolve, type Resolution, type ResolveSettings } from "./cascade.js";
import { componentsOf } from "./components.js";
import type { Network } from "./network.js";

/**
 * The best possible cycle clearing, found by trying all of them.
 *
 * Choosing which loops to cancel so that the fewest parties fail is NP-hard,
 * so there is no clever exact method to check the search in rescue.ts
 * against. On a network of half a dozen parties there does not need to be:
 * every whole-number clearing can simply be enumerated and resolved. That
 * gives ground truth on small cases, which is the only honest way to say how
 * often a heuristic finds the optimum.
 *
 * Clearings are enumerated without ever generating an invalid one. A spanning
 * forest is chosen among the obligations that lie on some cycle; the amounts
 * cancelled on the remaining arcs are free choices, and for each choice the
 * amounts on the forest arcs are forced by the rule that every party's net
 * position stays put. A choice is dropped if a forced amount falls outside
 * what is owed.
 */

export interface ExhaustiveResult {
  /** Fewest failures any clearing achieves. */
  failures: number;
  /** Least unpaid value among clearings achieving that. */
  shortfall: number;
  /** Amounts left outstanding under one such clearing. */
  amount: Float64Array;
  resolution: Resolution;
  /** How many valid clearings were resolved. */
  examined: number;
}

/**
 * Returns null when the network has more candidate clearings than `limit`,
 * rather than running for an unbounded time.
 */
export function bestClearingExhaustively(
  network: Network,
  cash: Float64Array,
  settings: ResolveSettings,
  limit = 2_000_000
): ExhaustiveResult | null {
  const n = network.parties.length;
  const m = network.amount.length;
  const { from, to, amount } = network;

  const { component } = componentsOf(n, to, { start: network.outStart, arcs: network.outArcs });

  // Only obligations inside a component can lie on a cycle.
  const inside: number[] = [];
  for (let e = 0; e < m; e += 1) if (component[from[e]!] === component[to[e]!]) inside.push(e);

  // Spanning forest over those arcs, ignoring direction.
  const parent = new Int32Array(n).fill(-1);
  const parentArc = new Int32Array(n).fill(-1);
  const placed = new Uint8Array(n);
  const order: number[] = [];
  const isTree = new Uint8Array(m);

  const touching: number[][] = Array.from({ length: n }, () => []);
  for (const e of inside) {
    touching[from[e]!]!.push(e);
    touching[to[e]!]!.push(e);
  }

  for (let root = 0; root < n; root += 1) {
    if (placed[root] === 1 || touching[root]!.length === 0) continue;
    placed[root] = 1;
    const queue = [root];
    for (let head = 0; head < queue.length; head += 1) {
      const u = queue[head]!;
      order.push(u);
      for (const e of touching[u]!) {
        const v = from[e] === u ? to[e]! : from[e]!;
        if (placed[v] === 1) continue;
        placed[v] = 1;
        parent[v] = u;
        parentArc[v] = e;
        isTree[e] = 1;
        queue.push(v);
      }
    }
  }

  const free = inside.filter((e) => isTree[e] === 0);

  let combinations = 1;
  for (const e of free) {
    combinations *= amount[e]! + 1;
    if (combinations > limit) return null;
  }

  const cancelled = new Float64Array(m);
  const balance = new Float64Array(n);
  const left = new Float64Array(m);
  const choice = new Float64Array(free.length);

  let best: ExhaustiveResult | null = null;
  let examined = 0;

  for (;;) {
    cancelled.fill(0);
    balance.fill(0);
    for (let i = 0; i < free.length; i += 1) {
      const e = free[i]!;
      cancelled[e] = choice[i]!;
      balance[to[e]!] = balance[to[e]!]! + choice[i]!;
      balance[from[e]!] = balance[from[e]!]! - choice[i]!;
    }

    // Deepest parties first: each one's link to its parent has to absorb
    // whatever imbalance the choices so far leave it with.
    let valid = true;
    for (let i = order.length - 1; i >= 0 && valid; i -= 1) {
      const v = order[i]!;
      const e = parentArc[v]!;
      if (e === -1) continue;

      const forced = from[e] === v ? balance[v]! : -balance[v]!;
      if (forced < 0 || forced > amount[e]!) {
        valid = false;
        break;
      }
      cancelled[e] = forced;
      const up = parent[v]!;
      // v's imbalance moves to its parent along the arc, whichever way it points.
      balance[up] = balance[up]! + balance[v]!;
      balance[v] = 0;
    }

    if (valid) {
      for (let e = 0; e < m; e += 1) left[e] = amount[e]! - cancelled[e]!;
      const resolution = resolve(network, left, cash, settings);
      examined += 1;

      if (
        best === null ||
        resolution.failures < best.failures ||
        (resolution.failures === best.failures && resolution.shortfall < best.shortfall - 1e-9)
      ) {
        best = {
          failures: resolution.failures,
          shortfall: resolution.shortfall,
          amount: left.slice(),
          resolution,
          examined,
        };
      }
    }

    // Next combination, odometer-style.
    let digit = 0;
    while (digit < free.length) {
      if (choice[digit]! < amount[free[digit]!]!) {
        choice[digit] = choice[digit]! + 1;
        break;
      }
      choice[digit] = 0;
      digit += 1;
    }
    if (digit === free.length) break;
  }

  if (best) best.examined = examined;
  return best;
}
