import type { Network } from "./network.js";

/**
 * Maximum flow between two parties along existing obligations.
 *
 * The question it answers here is narrow: how much of what a debtor owes one
 * particular creditor could ever be cancelled? Cancelling it means closing a
 * loop, so the answer is however much can be routed from the creditor back to
 * the debtor through the rest of the network. Nothing a clearing does can
 * beat that figure, which is what makes it usable as a bound.
 *
 * Dinic's algorithm, iterative. The returned function reuses its working
 * arrays between calls, since the bound asks this question once per exposure.
 */
export type MaxFlow = (source: number, sink: number, limit: number) => number;

export function maxFlowOver(network: Network): MaxFlow {
  const n = network.parties.length;
  const m = network.amount.length;
  const { from, to, amount } = network;

  // Direction 2e runs forward along arc e while it has room; 2e+1 runs
  // backward to take back what was sent.
  const start = new Int32Array(n + 1);
  for (let e = 0; e < m; e += 1) {
    start[from[e]! + 1] = start[from[e]! + 1]! + 1;
    start[to[e]! + 1] = start[to[e]! + 1]! + 1;
  }
  for (let u = 0; u < n; u += 1) start[u + 1] = start[u + 1]! + start[u]!;

  const leaving = new Int32Array(m * 2);
  {
    const fill = start.slice(0, n);
    for (let e = 0; e < m; e += 1) {
      leaving[fill[from[e]!]!] = 2 * e;
      fill[from[e]!] = fill[from[e]!]! + 1;
      leaving[fill[to[e]!]!] = 2 * e + 1;
      fill[to[e]!] = fill[to[e]!]! + 1;
    }
  }

  const sent = new Float64Array(m);
  const level = new Int32Array(n);
  const cursor = new Int32Array(n);
  const queue = new Int32Array(n);
  const route = new Int32Array(n + 1);
  const used: number[] = [];

  const room = (direction: number): number => {
    const arc = direction >> 1;
    return (direction & 1) === 0 ? amount[arc]! - sent[arc]! : sent[arc]!;
  };
  const headOf = (direction: number): number =>
    (direction & 1) === 0 ? to[direction >> 1]! : from[direction >> 1]!;
  const tailOf = (direction: number): number =>
    (direction & 1) === 0 ? from[direction >> 1]! : to[direction >> 1]!;

  return (source, sink, limit) => {
    if (source === sink) return limit;

    for (const arc of used) sent[arc] = 0;
    used.length = 0;
    let total = 0;

    while (total < limit) {
      level.fill(-1);
      level[source] = 0;
      queue[0] = source;
      let read = 0;
      let write = 1;
      while (read < write && level[sink] === -1) {
        const u = queue[read]!;
        read += 1;
        for (let k = start[u]!; k < start[u + 1]!; k += 1) {
          const direction = leaving[k]!;
          if (room(direction) <= 0) continue;
          const v = headOf(direction);
          if (level[v] !== -1) continue;
          level[v] = level[u]! + 1;
          queue[write] = v;
          write += 1;
        }
      }
      if (level[sink] === -1) break;

      for (let i = 0; i < write; i += 1) cursor[queue[i]!] = start[queue[i]!]!;

      let depth = 0;
      let at = source;
      for (;;) {
        if (at === sink) {
          let value = limit - total;
          for (let i = 0; i < depth; i += 1) value = Math.min(value, room(route[i]!));

          let firstFull = depth;
          for (let i = depth - 1; i >= 0; i -= 1) {
            const direction = route[i]!;
            const arc = direction >> 1;
            if (sent[arc] === 0) used.push(arc);
            sent[arc] = sent[arc]! + ((direction & 1) === 0 ? value : -value);
            if (room(direction) === 0) firstFull = i;
          }

          total += value;
          if (total >= limit) return total;
          depth = firstFull;
          at = tailOf(route[depth]!);
          continue;
        }

        let advanced = false;
        while (cursor[at]! < start[at + 1]!) {
          const direction = leaving[cursor[at]!]!;
          const v = headOf(direction);
          if (room(direction) > 0 && level[v] === level[at]! + 1) {
            route[depth] = direction;
            depth += 1;
            at = v;
            advanced = true;
            break;
          }
          cursor[at] = cursor[at]! + 1;
        }
        if (advanced) continue;
        if (at === source) break;

        level[at] = -1;
        depth -= 1;
        at = tailOf(route[depth]!);
        cursor[at] = cursor[at]! + 1;
      }
    }

    return total;
  };
}
