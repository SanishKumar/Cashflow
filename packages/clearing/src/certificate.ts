import { buildGraph, pairKey } from "./graph.js";
import { verifyFlow, type FlowProblem, type FlowVerdict } from "./simplex.js";
import type { ClearingCertificate, Obligation } from "./types.js";

/**
 * Checks a cycle clearing from the outside.
 *
 * Given what was owed, what is left, and the certificate that came with the
 * result, this confirms three things without running a solver: nothing was
 * created or increased, no party's net position moved, and no further loop
 * could have been cancelled. A clearing operator can publish all three inputs
 * and let every participant check the outcome for themselves.
 *
 * The maximality part is linear-programming duality. The certificate assigns
 * each party a number; the clearing is maximal exactly when every obligation
 * that still has value left runs "downhill" by at least one, and every
 * obligation that was only partly cleared runs downhill by exactly one.
 */
export function verifyClearing(
  original: readonly Obligation[],
  remaining: readonly Obligation[],
  certificate: ClearingCertificate
): FlowVerdict {
  const graph = buildGraph(original);
  const left = new Map<string, number>();
  for (const { from, to, amount } of remaining) {
    if (from === to || amount === 0) continue;
    const key = pairKey(from, to);
    left.set(key, (left.get(key) ?? 0) + amount);
  }

  let count = 0;
  for (const row of graph.out.values()) count += row.size;

  const from = new Int32Array(count);
  const to = new Int32Array(count);
  const capacity = new Float64Array(count);
  const flow = new Float64Array(count);

  let next = 0;
  for (const [u, row] of graph.out) {
    for (const [v, amount] of row) {
      const key = pairKey(graph.nodes[u]!, graph.nodes[v]!);
      const still = left.get(key) ?? 0;
      left.delete(key);

      from[next] = u;
      to[next] = v;
      capacity[next] = amount;
      // An obligation that grew shows up as a negative flow and is rejected
      // by the feasibility check below.
      flow[next] = amount - still;
      next += 1;
    }
  }

  if (left.size > 0) {
    const [created] = left.keys();
    return { valid: false, reason: `${created} was not owed before clearing` };
  }

  const values = new Map(certificate.potential);
  const potential = new Float64Array(graph.nodes.length);
  for (let u = 0; u < graph.nodes.length; u += 1) {
    const value = values.get(graph.nodes[u]!);
    if (value === undefined) {
      return { valid: false, reason: `certificate has no entry for ${graph.nodes[u]}` };
    }
    potential[u] = value;
  }

  const problem: FlowProblem = {
    nodeCount: graph.nodes.length,
    from,
    to,
    capacity,
    cost: new Float64Array(count).fill(-1),
  };

  let cost = 0;
  for (let e = 0; e < count; e += 1) cost -= flow[e]!;

  return verifyFlow(problem, { status: "optimal", flow, potential, cost, pivots: 0 });
}
