/**
 * Minimum-cost flow by the primal network simplex method.
 *
 * Cycle cancelling (see circulation.ts) is exact but pays for a fresh
 * negative-cycle search on every augmentation, which is why it runs out of
 * road somewhere past fifteen thousand obligations. A national clearing round
 * is about fifty thousand. Network simplex keeps a spanning tree of the
 * network as its basis instead: a pivot swaps one arc into the tree and one
 * out, and only the subtree that hangs below the swap has to be touched.
 *
 * It is also a general solver rather than a circulation solver. Supplies,
 * arbitrary integer costs and unbounded arcs are all allowed, which is what
 * lets the same core answer "what clears", "what clears if these parties are
 * shielded first" and "what settles with this much cash".
 *
 * Two details carry the correctness:
 *
 *   - The basis is kept strongly feasible. When several tree arcs tie for
 *     leaving, the one met last walking the cycle from its apex is chosen.
 *     That rule is what rules out cycling through degenerate pivots, and a
 *     pure circulation is almost nothing but degenerate pivots at the start.
 *   - Everything is integral. Flows, capacities, costs and potentials are
 *     whole numbers held in doubles, exact up to 2^53, so the optimum is the
 *     optimum and not something within a tolerance of it.
 *
 * Every solution comes back with its node potentials. Together with the flow
 * they are a certificate: `verifyFlow` checks optimality in one pass over the
 * arcs without trusting anything this file did.
 */

export interface FlowProblem {
  nodeCount: number;
  from: Int32Array;
  to: Int32Array;
  /** Upper bound per arc. `Infinity` is allowed. */
  capacity: Float64Array;
  /** Cost per unit of flow. Must be integers. */
  cost: Float64Array;
  /** Net production per node, positive for a source. Must sum to zero. */
  supply?: Float64Array;
}

export interface FlowOptions {
  /**
   * A tree to start from instead of the trivial one, for problems with no
   * supplies. For each node: the index of one of its own outgoing arcs to hang
   * it by, or -1 to hang it from the root. The choices must not form a cycle.
   *
   * The trivial start hangs every node from an artificial root and lets
   * degenerate pivots discover the network's shape, re-hanging whole subtrees
   * as it goes. A caller that already knows a sensible shape can skip that.
   */
  startTree?: Int32Array;
}

export type FlowStatus = "optimal" | "infeasible" | "unbounded";

export interface FlowSolution {
  status: FlowStatus;
  /** Flow per arc, in the order the arcs were given. */
  flow: Float64Array;
  /** Dual value per node. Only meaningful when `status` is "optimal". */
  potential: Float64Array;
  cost: number;
  pivots: number;
}

const UPPER = -1;
const TREE = 0;
const LOWER = 1;

/** The arc to a node's parent runs parent -> node. */
const DOWN = -1;
/** The arc to a node's parent runs node -> parent. */
const UP = 1;

export function solveMinCostFlow(problem: FlowProblem, options: FlowOptions = {}): FlowSolution {
  const n = problem.nodeCount;
  const m = problem.from.length;
  const { startTree } = options;

  if (problem.to.length !== m || problem.capacity.length !== m || problem.cost.length !== m) {
    throw new RangeError("Flow problem arrays must all have one entry per arc");
  }
  if (problem.supply && problem.supply.length !== n) {
    throw new RangeError("Flow problem needs one supply entry per node");
  }
  if (startTree && startTree.length !== n) {
    throw new RangeError("A starting tree needs one entry per node");
  }

  // Arcs m .. m+n-1 are artificial: one per node, joining it to a root that
  // exists only so the solver has a spanning tree to start from.
  const total = m + n;
  const source = new Int32Array(total);
  const target = new Int32Array(total);
  const cap = new Float64Array(total);
  const cost = new Float64Array(total);
  const flow = new Float64Array(total);
  const state = new Int8Array(total);

  let largestCost = 0;
  for (let e = 0; e < m; e += 1) {
    const u = problem.from[e]!;
    const v = problem.to[e]!;
    const c = problem.cost[e]!;
    const capacity = problem.capacity[e]!;

    if (u < 0 || u >= n || v < 0 || v >= n) {
      throw new RangeError(`Arc ${e} references a node outside 0..${n - 1}`);
    }
    if (!Number.isInteger(c)) {
      throw new TypeError(`Arc ${e} has a non-integer cost ${c}; scale costs to integers first`);
    }
    if (!(capacity >= 0)) {
      throw new RangeError(`Arc ${e} has an invalid capacity ${capacity}`);
    }

    source[e] = u;
    target[e] = v;
    cap[e] = capacity;
    cost[e] = c;
    state[e] = LOWER;
    if (Math.abs(c) > largestCost) largestCost = Math.abs(c);
  }

  let supplySum = 0;
  let anySupply = false;
  if (problem.supply) {
    for (let u = 0; u < n; u += 1) {
      supplySum += problem.supply[u]!;
      if (problem.supply[u] !== 0) anySupply = true;
    }
  }
  if (startTree && anySupply) {
    throw new RangeError("A starting tree can only be given for a problem with no supplies");
  }

  const emptyResult = (status: FlowStatus): FlowSolution => ({
    status,
    flow: new Float64Array(m),
    potential: new Float64Array(n),
    cost: 0,
    pivots: 0,
  });

  if (supplySum !== 0) return emptyResult("infeasible");
  if (n === 0) return emptyResult("optimal");

  // Expensive enough that no optimal solution leaves flow on an artificial
  // arc if the real network can carry it instead.
  const artificialCost = (largestCost + 1) * n;

  const root = n;
  const parent = new Int32Array(n + 1);
  const pred = new Int32Array(n + 1);
  const predDir = new Int8Array(n + 1);
  const depth = new Int32Array(n + 1);
  const pi = new Float64Array(n + 1);

  // The tree is stored as child lists so a subtree can be walked, and a node
  // moved between parents, without rebuilding anything.
  const firstChild = new Int32Array(n + 1).fill(-1);
  const nextSibling = new Int32Array(n + 1).fill(-1);
  const prevSibling = new Int32Array(n + 1).fill(-1);

  const detach = (u: number): void => {
    const before = prevSibling[u]!;
    const after = nextSibling[u]!;
    if (before === -1) firstChild[parent[u]!] = after;
    else nextSibling[before] = after;
    if (after !== -1) prevSibling[after] = before;
  };

  const attach = (u: number, under: number): void => {
    const head = firstChild[under]!;
    prevSibling[u] = -1;
    nextSibling[u] = head;
    if (head !== -1) prevSibling[head] = u;
    firstChild[under] = u;
    parent[u] = under;
  };

  parent[root] = -1;
  pred[root] = -1;

  for (let u = n - 1; u >= 0; u -= 1) {
    const e = m + u;
    const supplied = problem.supply ? problem.supply[u]! : 0;
    const hungBy = startTree ? startTree[u]! : -1;

    cap[e] = Infinity;

    if (hungBy !== -1) {
      if (hungBy < 0 || hungBy >= m || source[hungBy] !== u) {
        throw new RangeError(`Starting tree hangs node ${u} by an arc that does not leave it`);
      }
      // Hung by a real arc at zero flow. The artificial arc still exists but
      // sits outside the tree, and outside pricing, so it never comes back.
      source[e] = u;
      target[e] = root;
      state[e] = LOWER;
      pred[u] = hungBy;
      predDir[u] = UP;
      state[hungBy] = TREE;
      attach(u, target[hungBy]!);
      continue;
    }

    state[e] = TREE;
    pred[u] = e;
    if (supplied >= 0) {
      predDir[u] = UP;
      source[e] = u;
      target[e] = root;
      flow[e] = supplied;
      cost[e] = 0;
    } else {
      predDir[u] = DOWN;
      source[e] = root;
      target[e] = u;
      flow[e] = -supplied;
      cost[e] = artificialCost;
    }
    attach(u, root);
  }

  const stack = new Int32Array(n + 1);

  // Depths and potentials follow from the tree: every tree arc has zero
  // reduced cost, so each node's potential is fixed by its parent's.
  {
    let reached = 1;
    stack[0] = root;
    let top = 1;
    while (top > 0) {
      top -= 1;
      const at = stack[top]!;
      for (let child = firstChild[at]!; child !== -1; child = nextSibling[child]!) {
        depth[child] = depth[at]! + 1;
        pi[child] = pi[at]! - predDir[child]! * cost[pred[child]!]!;
        stack[top] = child;
        top += 1;
        reached += 1;
      }
    }
    if (reached !== n + 1) throw new RangeError("Starting tree contains a cycle");
  }

  // Pricing looks at one block of arcs at a time and takes the best candidate
  // in it. Scanning every arc on every pivot would be the textbook rule and
  // costs far more than the better choices it finds are worth.
  const blockSize = Math.max(10, Math.floor(Math.sqrt(m)));
  let nextArc = 0;
  let pivots = 0;

  for (;;) {
    let entering = -1;
    let best = 0;
    let countdown = blockSize;
    let e = nextArc;

    for (let scanned = 0; scanned < m; scanned += 1) {
      const reduced = state[e]! * (cost[e]! + pi[source[e]!]! - pi[target[e]!]!);
      if (reduced < best) {
        best = reduced;
        entering = e;
      }
      e += 1;
      if (e === m) e = 0;
      countdown -= 1;
      if (countdown === 0) {
        if (best < 0) break;
        countdown = blockSize;
      }
    }

    // No arc can lower the cost: the current tree is optimal.
    if (entering === -1) break;
    nextArc = e;
    pivots += 1;

    // The entering arc closes exactly one cycle with the tree; its apex is
    // where the two endpoints' paths to the root meet.
    let a = source[entering]!;
    let b = target[entering]!;
    while (a !== b) {
      const depthA = depth[a]!;
      const depthB = depth[b]!;
      if (depthA >= depthB) a = parent[a]!;
      if (depthB >= depthA) b = parent[b]!;
    }
    const join = a;

    // Flow is pushed round the cycle in the direction that lowers cost:
    // forward along an arc sitting at zero, backward along a saturated one.
    const fromLower = state[entering] === LOWER;
    const first = fromLower ? source[entering]! : target[entering]!;
    const second = fromLower ? target[entering]! : source[entering]!;

    let delta = cap[entering]!;
    let blocking = 0;
    let leavingNode = -1;

    for (let w = first; w !== join; w = parent[w]!) {
      const arc = pred[w]!;
      const room = predDir[w] === DOWN ? cap[arc]! - flow[arc]! : flow[arc]!;
      if (room < delta) {
        delta = room;
        leavingNode = w;
        blocking = 1;
      }
    }
    // `<=` here against `<` above is the strong-feasibility tie-break.
    for (let w = second; w !== join; w = parent[w]!) {
      const arc = pred[w]!;
      const room = predDir[w] === UP ? cap[arc]! - flow[arc]! : flow[arc]!;
      if (room <= delta) {
        delta = room;
        leavingNode = w;
        blocking = 2;
      }
    }

    if (delta === Infinity) {
      return { ...emptyResult("unbounded"), pivots };
    }

    if (delta > 0) {
      const amount = state[entering]! * delta;
      flow[entering] = flow[entering]! + amount;
      for (let w = source[entering]!; w !== join; w = parent[w]!) {
        const arc = pred[w]!;
        flow[arc] = flow[arc]! - predDir[w]! * amount;
      }
      for (let w = target[entering]!; w !== join; w = parent[w]!) {
        const arc = pred[w]!;
        flow[arc] = flow[arc]! + predDir[w]! * amount;
      }
    }

    if (blocking === 0) {
      // The entering arc filled (or emptied) before any tree arc did, so the
      // tree is unchanged and the arc simply moves to its other bound.
      state[entering] = -state[entering]!;
      continue;
    }

    const leaving = pred[leavingNode]!;
    state[entering] = TREE;
    state[leaving] = flow[leaving] === 0 ? LOWER : UPPER;

    // Dropping the leaving arc cuts off the subtree under `leavingNode`. The
    // entering arc reconnects it, but from a different node, so the subtree
    // is re-hung from that node: every link on the path between the two is
    // turned around.
    const hangFrom = blocking === 1 ? first : second;
    const hangOn = blocking === 1 ? second : first;

    const shift =
      hangFrom === source[entering]
        ? pi[hangOn]! - pi[hangFrom]! - cost[entering]!
        : pi[hangOn]! - pi[hangFrom]! + cost[entering]!;

    let node = hangFrom;
    let newParent = hangOn;
    let newPred = entering;
    let newDir = hangFrom === source[entering] ? UP : DOWN;

    for (;;) {
      const oldParent = parent[node]!;
      const oldPred = pred[node]!;
      const oldDir = predDir[node]!;

      detach(node);
      attach(node, newParent);
      pred[node] = newPred;
      predDir[node] = newDir;

      if (node === leavingNode) break;

      newParent = node;
      newPred = oldPred;
      newDir = -oldDir;
      node = oldParent;
    }

    // Potentials move by a constant across the re-hung subtree, which is
    // what restores zero reduced cost on the entering arc.
    depth[hangFrom] = depth[hangOn]! + 1;
    pi[hangFrom] = pi[hangFrom]! + shift;
    stack[0] = hangFrom;
    let top = 1;
    while (top > 0) {
      top -= 1;
      const at = stack[top]!;
      const below = depth[at]! + 1;
      for (let child = firstChild[at]!; child !== -1; child = nextSibling[child]!) {
        pi[child] = pi[child]! + shift;
        depth[child] = below;
        stack[top] = child;
        top += 1;
      }
    }
  }

  // Flow still on an artificial arc means the real network could not carry
  // the supplies it was given.
  for (let e = m; e < total; e += 1) {
    if (flow[e] !== 0) return { ...emptyResult("infeasible"), pivots };
  }

  let totalCost = 0;
  for (let e = 0; e < m; e += 1) totalCost += flow[e]! * cost[e]!;

  return {
    status: "optimal",
    flow: flow.slice(0, m),
    potential: pi.slice(0, n),
    cost: totalCost,
    pivots,
  };
}

export interface FlowVerdict {
  valid: boolean;
  /** Present when `valid` is false: the first condition found broken. */
  reason?: string;
}

/**
 * Checks that a flow is feasible and optimal, using only the flow and the
 * potentials that came back with it.
 *
 * This is linear-programming duality doing the work. A feasible flow is
 * optimal exactly when potentials exist under which every arc with spare
 * capacity in some direction has no incentive to use it: an arc whose reduced
 * cost is positive must be empty, and one whose reduced cost is negative must
 * be full. Checking that is one pass over the arcs, and it does not depend on
 * how the flow was found.
 */
export function verifyFlow(problem: FlowProblem, solution: FlowSolution): FlowVerdict {
  const n = problem.nodeCount;
  const m = problem.from.length;
  const { flow, potential } = solution;

  if (solution.status !== "optimal") {
    return { valid: false, reason: `solver reported ${solution.status}` };
  }
  if (flow.length !== m || potential.length !== n) {
    return { valid: false, reason: "solution does not match the problem's dimensions" };
  }

  const balance = new Float64Array(n);
  for (let e = 0; e < m; e += 1) {
    const f = flow[e]!;
    const u = problem.from[e]!;
    const v = problem.to[e]!;

    if (f < 0 || f > problem.capacity[e]!) {
      return { valid: false, reason: `arc ${e} carries ${f} outside 0..${problem.capacity[e]}` };
    }

    const reduced = problem.cost[e]! + potential[u]! - potential[v]!;
    if (reduced > 0 && f !== 0) {
      return { valid: false, reason: `arc ${e} carries flow at a positive reduced cost` };
    }
    if (reduced < 0 && f !== problem.capacity[e]!) {
      return { valid: false, reason: `arc ${e} has spare capacity at a negative reduced cost` };
    }

    balance[u] = balance[u]! + f;
    balance[v] = balance[v]! - f;
  }

  for (let u = 0; u < n; u += 1) {
    const supplied = problem.supply ? problem.supply[u]! : 0;
    if (balance[u] !== supplied) {
      return { valid: false, reason: `node ${u} is out of balance by ${balance[u]! - supplied}` };
    }
  }

  return { valid: true };
}
