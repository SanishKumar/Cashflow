import { describe, expect, it } from "vitest";
import { makeRandom } from "../generate.js";
import { solveMinCostFlow, verifyFlow, type FlowProblem } from "../simplex.js";

interface ArcSpec {
  from: number;
  to: number;
  capacity: number;
  cost: number;
}

function problemOf(nodeCount: number, arcs: readonly ArcSpec[], supply?: number[]): FlowProblem {
  return {
    nodeCount,
    from: Int32Array.from(arcs.map((arc) => arc.from)),
    to: Int32Array.from(arcs.map((arc) => arc.to)),
    capacity: Float64Array.from(arcs.map((arc) => arc.capacity)),
    cost: Float64Array.from(arcs.map((arc) => arc.cost)),
    supply: supply ? Float64Array.from(supply) : undefined,
  };
}

describe("minimum-cost flow", () => {
  it("routes supply along the cheaper of two paths", () => {
    // 0 -> 1 -> 3 costs 2 a unit, 0 -> 2 -> 3 costs 5. Ten units fit on the
    // cheap path's 6-unit bottleneck, so four have to take the dear one.
    const problem = problemOf(
      4,
      [
        { from: 0, to: 1, capacity: 6, cost: 1 },
        { from: 1, to: 3, capacity: 8, cost: 1 },
        { from: 0, to: 2, capacity: 9, cost: 2 },
        { from: 2, to: 3, capacity: 9, cost: 3 },
      ],
      [10, 0, 0, -10]
    );

    const solution = solveMinCostFlow(problem);

    expect(solution.status).toBe("optimal");
    expect([...solution.flow]).toEqual([6, 6, 4, 4]);
    expect(solution.cost).toBe(6 * 2 + 4 * 5);
    expect(verifyFlow(problem, solution)).toEqual({ valid: true });
  });

  it("reports infeasible when the network cannot carry the supply", () => {
    const problem = problemOf(2, [{ from: 0, to: 1, capacity: 3, cost: 1 }], [5, -5]);
    expect(solveMinCostFlow(problem).status).toBe("infeasible");
  });

  it("reports infeasible when supply and demand do not balance", () => {
    const problem = problemOf(2, [{ from: 0, to: 1, capacity: 9, cost: 1 }], [5, -4]);
    expect(solveMinCostFlow(problem).status).toBe("infeasible");
  });

  it("reports unbounded for a negative cycle with no capacity limit", () => {
    const problem = problemOf(2, [
      { from: 0, to: 1, capacity: Infinity, cost: -1 },
      { from: 1, to: 0, capacity: Infinity, cost: 0 },
    ]);
    expect(solveMinCostFlow(problem).status).toBe("unbounded");
  });

  it("uses an unbounded arc when the cycle through it is still limited", () => {
    const problem = problemOf(2, [
      { from: 0, to: 1, capacity: 7, cost: -3 },
      { from: 1, to: 0, capacity: Infinity, cost: 1 },
    ]);

    const solution = solveMinCostFlow(problem);

    expect(solution.status).toBe("optimal");
    expect([...solution.flow]).toEqual([7, 7]);
    expect(solution.cost).toBe(-14);
    expect(verifyFlow(problem, solution)).toEqual({ valid: true });
  });

  it("rejects fractional costs rather than losing exactness", () => {
    const problem = problemOf(2, [{ from: 0, to: 1, capacity: 1, cost: 0.5 }]);
    expect(() => solveMinCostFlow(problem)).toThrow(/non-integer cost/);
  });

  it("solves randomised problems with supplies to a verifiable optimum", () => {
    for (let seed = 1; seed <= 200; seed += 1) {
      const random = makeRandom(seed * 7919);
      const nodes = 3 + Math.floor(random() * 14);
      const arcCount = nodes + Math.floor(random() * nodes * 3);

      const arcs: ArcSpec[] = [];
      const supply = new Array<number>(nodes).fill(0);
      let witnessCost = 0;

      // Feasibility is guaranteed by construction: pick a flow first, then
      // set the supplies to whatever that flow happens to need.
      for (let i = 0; i < arcCount; i += 1) {
        const from = Math.floor(random() * nodes);
        let to = Math.floor(random() * nodes);
        if (to === from) to = (to + 1) % nodes;
        const witness = Math.floor(random() * 20);
        const capacity = witness + Math.floor(random() * 20);
        const cost = Math.floor(random() * 21) - 5;
        arcs.push({ from, to, capacity, cost });
        supply[from]! += witness;
        supply[to]! -= witness;
        witnessCost += witness * cost;
      }

      const problem = problemOf(nodes, arcs, supply);
      const solution = solveMinCostFlow(problem);

      expect(solution.status, `seed ${seed}`).toBe("optimal");
      expect(verifyFlow(problem, solution), `seed ${seed}`).toEqual({ valid: true });
      expect(solution.cost, `seed ${seed}`).toBeLessThanOrEqual(witnessCost);
    }
  });
});

describe("optimality certificate", () => {
  const problem = problemOf(3, [
    { from: 0, to: 1, capacity: 5, cost: -1 },
    { from: 1, to: 2, capacity: 5, cost: -1 },
    { from: 2, to: 0, capacity: 3, cost: -1 },
  ]);

  it("accepts the solver's own answer", () => {
    const solution = solveMinCostFlow(problem);
    expect([...solution.flow]).toEqual([3, 3, 3]);
    expect(verifyFlow(problem, solution)).toEqual({ valid: true });
  });

  it("rejects a feasible flow that is not optimal", () => {
    const solution = solveMinCostFlow(problem);
    const worse = { ...solution, flow: Float64Array.from([2, 2, 2]) };
    expect(verifyFlow(problem, worse).valid).toBe(false);
  });

  it("rejects a flow that breaks conservation", () => {
    const solution = solveMinCostFlow(problem);
    const broken = { ...solution, flow: Float64Array.from([3, 3, 2]) };
    expect(verifyFlow(problem, broken).valid).toBe(false);
  });

  it("rejects a flow that exceeds a capacity", () => {
    const solution = solveMinCostFlow(problem);
    const over = { ...solution, flow: Float64Array.from([4, 4, 4]) };
    expect(verifyFlow(problem, over).valid).toBe(false);
  });
});
