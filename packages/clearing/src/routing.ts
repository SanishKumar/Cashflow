/**
 * Maximum clearing, solved from the other side.
 *
 * Asking "what is the most debt that can cancel?" is the same as asking "what
 * is the least debt that has to stay?". Whatever stays must still carry every
 * party's net position: a net debtor's shortfall has to reach net creditors
 * through obligations that already exist. So the residue of an optimal
 * clearing is the cheapest way to route net debt along existing obligations,
 * where every obligation a unit passes through costs one, because that unit
 * is still outstanding there. Clearing the most is routing nets by the
 * shortest chains.
 *
 * That turns a circulation problem into a transport problem with unit costs,
 * and unit costs are what make it fast. Route lengths are small whole numbers,
 * so instead of improving one cycle at a time the solver works through them in
 * order: find how long the shortest remaining route is, send everything that
 * fits along every route of that length at once, and repeat with the next
 * length up. This is the primal-dual method, with a blocking-flow search doing
 * the "everything at once" step.
 */

export interface RoutedDebt {
  /** What is still outstanding on each obligation once nets are routed. */
  remaining: Float64Array;
  /** Dual value per party, in the routing problem's own sign convention. */
  potential: Float64Array;
  /** Distinct route lengths the solver worked through. */
  phases: number;
}

const UNREACHED = 0x7fffffff;

export function routeNetDebt(
  parties: number,
  from: Int32Array,
  to: Int32Array,
  capacity: Float64Array
): RoutedDebt {
  const obligations = from.length;

  const net = new Float64Array(parties);
  for (let e = 0; e < obligations; e += 1) {
    net[from[e]!] = net[from[e]!]! - capacity[e]!;
    net[to[e]!] = net[to[e]!]! + capacity[e]!;
  }

  let terminals = 0;
  for (let u = 0; u < parties; u += 1) if (net[u] !== 0) terminals += 1;

  // Parties, then one node that hands net debtors their shortfall and one
  // that collects what net creditors are owed.
  const origin = parties;
  const sink = parties + 1;
  const nodeCount = parties + 2;
  const arcCount = obligations + terminals;

  const tail = new Int32Array(arcCount);
  const head = new Int32Array(arcCount);
  const cap = new Float64Array(arcCount);
  const price = new Int8Array(arcCount);
  const sent = new Float64Array(arcCount);

  tail.set(from);
  head.set(to);
  cap.set(capacity);
  price.fill(1, 0, obligations);

  let next = obligations;
  for (let u = 0; u < parties; u += 1) {
    const position = net[u]!;
    if (position === 0) continue;
    // Free to enter and leave: only obligations cost anything.
    if (position < 0) {
      tail[next] = origin;
      head[next] = u;
      cap[next] = -position;
    } else {
      tail[next] = u;
      head[next] = sink;
      cap[next] = position;
    }
    next += 1;
  }

  // Each arc is usable in two directions: forward while it has room, and
  // backward to take back what was sent. Direction 2e is forward along arc e,
  // 2e+1 is backward.
  const start = new Int32Array(nodeCount + 1);
  for (let e = 0; e < arcCount; e += 1) {
    start[tail[e]! + 1] = start[tail[e]! + 1]! + 1;
    start[head[e]! + 1] = start[head[e]! + 1]! + 1;
  }
  for (let u = 0; u < nodeCount; u += 1) start[u + 1] = start[u + 1]! + start[u]!;

  const leaving = new Int32Array(arcCount * 2);
  {
    const fill = start.slice(0, nodeCount);
    for (let e = 0; e < arcCount; e += 1) {
      const u = tail[e]!;
      const v = head[e]!;
      leaving[fill[u]!] = 2 * e;
      fill[u] = fill[u]! + 1;
      leaving[fill[v]!] = 2 * e + 1;
      fill[v] = fill[v]! + 1;
    }
  }

  const potential = new Float64Array(nodeCount);
  const distance = new Int32Array(nodeCount).fill(UNREACHED);
  const settled = new Uint8Array(nodeCount);
  const touched = new Int32Array(nodeCount);

  /**
   * Shortest route from the origin to the sink, measured in reduced cost.
   * Reduced costs are never negative, so this is Dijkstra, and they are small
   * whole numbers, so a bucket per distance replaces the heap.
   */
  const shortestRoute = (): number => {
    const buckets: number[][] = [[origin]];
    distance[origin] = 0;
    touched[0] = origin;
    let touchedCount = 1;
    let found = -1;

    for (let d = 0; d < buckets.length && found === -1; d += 1) {
      const bucket = buckets[d];
      if (!bucket) continue;

      for (let i = 0; i < bucket.length; i += 1) {
        const u = bucket[i]!;
        if (settled[u] === 1 || distance[u] !== d) continue;
        settled[u] = 1;
        if (u === sink) {
          found = d;
          break;
        }

        const from = potential[u]!;
        for (let k = start[u]!; k < start[u + 1]!; k += 1) {
          const direction = leaving[k]!;
          const arc = direction >> 1;
          let v: number;
          let step: number;
          if ((direction & 1) === 0) {
            if (cap[arc]! - sent[arc]! <= 0) continue;
            v = head[arc]!;
            step = price[arc]! + from - potential[v]!;
          } else {
            if (sent[arc]! <= 0) continue;
            v = tail[arc]!;
            step = -price[arc]! + from - potential[v]!;
          }
          if (settled[v] === 1) continue;

          const reached = d + step;
          if (reached < distance[v]!) {
            if (distance[v] === UNREACHED) {
              touched[touchedCount] = v;
              touchedCount += 1;
            }
            distance[v] = reached;
            (buckets[reached] ??= []).push(v);
          }
        }
      }
    }

    // Lower the potential of everything strictly nearer than the sink by how
    // much nearer it is. Every arc on a shortest route ends up with zero
    // reduced cost, and no usable arc anywhere goes negative.
    for (let i = 0; i < touchedCount; i += 1) {
      const u = touched[i]!;
      if (found !== -1 && settled[u] === 1 && distance[u]! < found) {
        potential[u] = potential[u]! + distance[u]! - found;
      }
      distance[u] = UNREACHED;
      settled[u] = 0;
    }

    return found;
  };

  // Between two shortest-route searches the potentials do not move, so the
  // set of zero-reduced-cost directions is fixed. Collecting it once means
  // the flow search below never looks at an arc it could not use.
  const tightStart = new Int32Array(nodeCount + 1);
  const tight = new Int32Array(arcCount * 2);

  const collectTight = (): void => {
    let write = 0;
    for (let u = 0; u < nodeCount; u += 1) {
      tightStart[u] = write;
      const from = potential[u]!;
      for (let k = start[u]!; k < start[u + 1]!; k += 1) {
        const direction = leaving[k]!;
        const arc = direction >> 1;
        const step =
          (direction & 1) === 0
            ? price[arc]! + from - potential[head[arc]!]!
            : -price[arc]! + from - potential[tail[arc]!]!;
        if (step === 0) {
          tight[write] = direction;
          write += 1;
        }
      }
    }
    tightStart[nodeCount] = write;
  };

  const level = new Int32Array(nodeCount).fill(-1);
  const cursor = new Int32Array(nodeCount);
  const queue = new Int32Array(nodeCount);
  const route = new Int32Array(nodeCount);
  let layered = 0;

  /** Layers the tight network outward from the origin, no further than the sink. */
  const layer = (): boolean => {
    for (let i = 0; i < layered; i += 1) level[queue[i]!] = -1;

    level[origin] = 0;
    queue[0] = origin;
    let read = 0;
    let write = 1;
    let limit = UNREACHED;

    while (read < write) {
      const u = queue[read]!;
      read += 1;
      const below = level[u]! + 1;
      if (below > limit) break;

      for (let k = tightStart[u]!; k < tightStart[u + 1]!; k += 1) {
        const direction = tight[k]!;
        const arc = direction >> 1;
        let v: number;
        if ((direction & 1) === 0) {
          if (cap[arc]! - sent[arc]! <= 0) continue;
          v = head[arc]!;
        } else {
          if (sent[arc]! <= 0) continue;
          v = tail[arc]!;
        }
        if (level[v] !== -1) continue;
        level[v] = below;
        queue[write] = v;
        write += 1;
        if (v === sink) limit = below;
      }
    }

    layered = write;
    return level[sink] !== -1;
  };

  /**
   * Sends as much as fits along routes that step down one layer at a time.
   * Iterative, because a route can be as long as the supply chain is deep.
   */
  const saturate = (): void => {
    for (let i = 0; i < layered; i += 1) cursor[queue[i]!] = tightStart[queue[i]!]!;

    let depth = 0;
    let at = origin;

    for (;;) {
      if (at === sink) {
        let amount = Infinity;
        for (let i = 0; i < depth; i += 1) {
          const direction = route[i]!;
          const arc = direction >> 1;
          const room = (direction & 1) === 0 ? cap[arc]! - sent[arc]! : sent[arc]!;
          if (room < amount) amount = room;
        }

        let firstFull = depth;
        for (let i = depth - 1; i >= 0; i -= 1) {
          const direction = route[i]!;
          const arc = direction >> 1;
          if ((direction & 1) === 0) {
            sent[arc] = sent[arc]! + amount;
            if (sent[arc] === cap[arc]) firstFull = i;
          } else {
            sent[arc] = sent[arc]! - amount;
            if (sent[arc] === 0) firstFull = i;
          }
        }

        // Step back to just before the first arc that filled up.
        depth = firstFull;
        const direction = route[depth]!;
        at = (direction & 1) === 0 ? tail[direction >> 1]! : head[direction >> 1]!;
        continue;
      }

      let advanced = false;
      const below = level[at]! + 1;
      while (cursor[at]! < tightStart[at + 1]!) {
        const direction = tight[cursor[at]!]!;
        const arc = direction >> 1;
        let v = -1;
        if ((direction & 1) === 0) {
          if (cap[arc]! - sent[arc]! > 0) v = head[arc]!;
        } else if (sent[arc]! > 0) {
          v = tail[arc]!;
        }
        if (v !== -1 && level[v] === below) {
          route[depth] = direction;
          depth += 1;
          at = v;
          advanced = true;
          break;
        }
        cursor[at] = cursor[at]! + 1;
      }
      if (advanced) continue;

      if (at === origin) return;

      // Dead end. Nothing more leaves this party at this layer.
      level[at] = -1;
      depth -= 1;
      const direction = route[depth]!;
      at = (direction & 1) === 0 ? tail[direction >> 1]! : head[direction >> 1]!;
      cursor[at] = cursor[at]! + 1;
    }
  };

  let phases = 0;
  while (shortestRoute() !== -1) {
    phases += 1;
    collectTight();
    while (layer()) saturate();
  }

  return {
    remaining: sent.slice(0, obligations),
    potential: potential.slice(0, parties),
    phases,
  };
}
