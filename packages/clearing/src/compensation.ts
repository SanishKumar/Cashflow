import { pairKey, type Graph } from "./graph.js";

/**
 * Path-enabled compensation.
 *
 * Where cycle clearing only cancels closed loops, this shortens open chains:
 * if u owes v and v owes w, then m = min(u→v, v→w) can be lifted out of the
 * middle and rebooked as u owes w. Gross obligation falls by m and every net
 * position is preserved — but u has just acquired w as a counterparty, which
 * is precisely the step that hands you a debtor you never agreed to.
 *
 * Repeating this until no party sits between an inflow and an outflow drives
 * the total down to the floor: the sum of all positive net positions. That is
 * what "simplify debts" does in every mainstream app, without asking.
 *
 * The reduction order is a genuine choice, so it is exposed: reductions that
 * reuse a pair which already exists cost nothing extra in cleared value and
 * create no new exposure, so they can be taken first.
 */

interface Working {
  out: Map<number, Map<number, number>>;
  incoming: Map<number, Map<number, number>>;
}

function toWorking(graph: Graph): Working {
  const out = new Map<number, Map<number, number>>();
  const incoming = new Map<number, Map<number, number>>();

  for (let node = 0; node < graph.nodes.length; node += 1) {
    out.set(node, new Map());
    incoming.set(node, new Map());
  }
  for (const [u, row] of graph.out) {
    for (const [v, amount] of row) {
      if (amount <= 0) continue;
      out.get(u)!.set(v, amount);
      incoming.get(v)!.set(u, amount);
    }
  }
  return { out, incoming };
}

function shift(working: Working, u: number, v: number, delta: number): void {
  const next = (working.out.get(u)!.get(v) ?? 0) + delta;
  if (next < 0) throw new RangeError("compensation drove an obligation negative");

  if (next === 0) {
    working.out.get(u)!.delete(v);
    working.incoming.get(v)!.delete(u);
  } else {
    working.out.get(u)!.set(v, next);
    working.incoming.get(v)!.set(u, next);
  }
}

export interface CompensationOptions {
  preferExistingPairs: boolean;
  forbiddenPairs?: ReadonlySet<string>;
  maxIterations: number;
}

export interface CompensationResult {
  reduced: number;
  iterations: number;
  optimal: boolean;
}

/**
 * Reduces `graph` in place. Returns how much gross obligation was removed.
 */
export function compensatePaths(
  graph: Graph,
  options: CompensationOptions
): CompensationResult {
  const working = toWorking(graph);
  const { preferExistingPairs, forbiddenPairs, maxIterations } = options;

  const allowed = (u: number, w: number): boolean => {
    if (!forbiddenPairs || forbiddenPairs.size === 0) return true;
    // An existing pair is not a new exposure, so a ban cannot apply to it.
    if ((working.out.get(u)!.get(w) ?? 0) > 0) return true;
    return !forbiddenPairs.has(pairKey(graph.nodes[u]!, graph.nodes[w]!));
  };

  const queue: number[] = [];
  const queued = new Uint8Array(graph.nodes.length);
  const enqueue = (node: number): void => {
    if (queued[node] === 1) return;
    if (working.incoming.get(node)!.size === 0 || working.out.get(node)!.size === 0) return;
    queued[node] = 1;
    queue.push(node);
  };

  for (let node = 0; node < graph.nodes.length; node += 1) enqueue(node);

  let reduced = 0;
  let iterations = 0;

  while (queue.length > 0) {
    if (iterations >= maxIterations) {
      applyBack(graph, working);
      return { reduced, iterations, optimal: false };
    }

    const middle = queue.shift()!;
    queued[middle] = 0;

    for (;;) {
      const inRow = working.incoming.get(middle)!;
      const outRow = working.out.get(middle)!;
      if (inRow.size === 0 || outRow.size === 0) break;
      if (iterations >= maxIterations) break;

      let chosenU = -1;
      let chosenW = -1;
      let reusesPair = false;

      // A closed two-party loop cancels outright and is always preferable:
      // it removes twice the value and touches nobody new.
      outer: for (const u of inRow.keys()) {
        for (const w of outRow.keys()) {
          if (u === w) {
            chosenU = u;
            chosenW = w;
            reusesPair = true;
            break outer;
          }
        }
      }

      if (chosenU === -1 && preferExistingPairs) {
        outer2: for (const u of inRow.keys()) {
          for (const w of outRow.keys()) {
            if ((working.out.get(u)!.get(w) ?? 0) > 0) {
              chosenU = u;
              chosenW = w;
              reusesPair = true;
              break outer2;
            }
          }
        }
      }

      if (chosenU === -1) {
        outer3: for (const u of inRow.keys()) {
          for (const w of outRow.keys()) {
            if (u !== w && allowed(u, w)) {
              chosenU = u;
              chosenW = w;
              break outer3;
            }
          }
        }
      }

      // Every remaining combination is forbidden; this party stays in the middle.
      if (chosenU === -1) break;

      const inflow = inRow.get(chosenU)!;
      const outflow = outRow.get(chosenW)!;
      const amount = Math.min(inflow, outflow);

      shift(working, chosenU, middle, -amount);
      shift(working, middle, chosenW, -amount);

      if (chosenU === chosenW) {
        // u -> middle -> u: both legs vanish entirely.
        reduced += 2 * amount;
      } else {
        shift(working, chosenU, chosenW, amount);
        reduced += amount;
      }

      iterations += 1;
      if (!reusesPair || chosenU !== chosenW) {
        enqueue(chosenU);
        enqueue(chosenW);
      }
    }
  }

  applyBack(graph, working);
  return { reduced, iterations, optimal: true };
}

function applyBack(graph: Graph, working: Working): void {
  for (const [u, row] of working.out) {
    graph.out.set(u, new Map(row));
  }
}
