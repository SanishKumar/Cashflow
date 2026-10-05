import { describe, expect, it } from "vitest";
import { generateCash } from "../balance.js";
import { cashOf, resolve, settingsOf } from "../cascade.js";
import { bestClearingExhaustively } from "../exhaustive.js";
import { generateNetwork, makeRandom } from "../generate.js";
import { buildGraph, netPositions } from "../graph.js";
import { maxFlowOver } from "../maxflow.js";
import { networkOf } from "../network.js";
import { certainFailures, rescue, searchRescue } from "../rescue.js";
import { routeNetDebt } from "../routing.js";
import type { Obligation } from "../types.js";

/**
 * Dara owes Asha and Bo 100 each and holds 20. Asha, Chen and Dara owe one
 * another 100 round a loop. Bo, outside the loop, owes his own supplier 45.
 *
 * Leave the loop alone and Asha fails. Cancel all of it and Bo fails instead.
 * Cancel between 23 and 54 of it and neither does.
 */
const LOOP_AND_OUTSIDER: Obligation[] = [
  { from: "Dara", to: "Asha", amount: 100 },
  { from: "Asha", to: "Chen", amount: 100 },
  { from: "Chen", to: "Dara", amount: 100 },
  { from: "Dara", to: "Bo", amount: 100 },
  { from: "Bo", to: "Supplier", amount: 45 },
];
const CASH = new Map([
  ["Dara", 20],
  ["Asha", 35],
  ["Chen", 100],
]);

function netsOf(obligations: readonly Obligation[]): Map<string, number> {
  const graph = buildGraph(obligations);
  const nets = netPositions(graph);
  return new Map(graph.nodes.map((name, index) => [name, nets[index]!]));
}

function pairsOf(obligations: readonly Obligation[]): Map<string, number> {
  const pairs = new Map<string, number>();
  for (const { from, to, amount } of obligations) {
    pairs.set(`${from}|${to}`, (pairs.get(`${from}|${to}`) ?? 0) + amount);
  }
  return pairs;
}

/** Small networks with small whole amounts, so every clearing can be enumerated. */
function tinyCase(seed: number): { obligations: Obligation[]; cash: Map<string, number> } {
  const random = makeRandom(seed * 7_919 + 13);
  const parties = 4 + Math.floor(random() * 3);
  const count = parties + 2 + Math.floor(random() * 5);
  const obligations: Obligation[] = [];
  for (let i = 0; i < count; i += 1) {
    const from = Math.floor(random() * parties);
    const to = Math.floor(random() * parties);
    if (from === to) continue;
    obligations.push({ from: `p${from}`, to: `p${to}`, amount: 1 + Math.floor(random() * 6) });
  }
  const cash = new Map<string, number>();
  for (let i = 0; i < parties; i += 1) {
    cash.set(`p${i}`, random() < 0.5 ? 0 : Math.floor(random() * 5));
  }
  return { obligations, cash };
}

describe("the loop and the outsider", () => {
  const plan = rescue(LOOP_AND_OUTSIDER, CASH);

  it("loses a different party each way if the loop is left or fully cancelled", () => {
    expect(plan.asOwed.failed).toEqual(["Dara", "Asha"]);
    expect(plan.maximum.failed).toEqual(["Dara", "Bo"]);
  });

  it("finds the partial cancellation that loses neither", () => {
    expect(plan.outcome.failed).toEqual(["Dara"]);
  });

  it("cancels an amount inside the window that works", () => {
    const left = pairsOf(plan.remaining);
    const cancelled = 100 - (left.get("Dara|Asha") ?? 0);

    expect(cancelled).toBeGreaterThanOrEqual(23);
    expect(cancelled).toBeLessThanOrEqual(54);
    // The same amount comes off every leg of the loop, and nothing else moves.
    expect(left.get("Asha|Chen")).toBe(100 - cancelled);
    expect(left.get("Chen|Dara")).toBe(100 - cancelled);
    expect(left.get("Dara|Bo")).toBe(100);
    expect(left.get("Bo|Supplier")).toBe(45);
  });

  it("knows the result cannot be improved", () => {
    expect(plan.unavoidable).toEqual(["Dara"]);
    expect(plan.provablyBest).toBe(true);
  });

  it("agrees with trying every possible clearing", () => {
    const network = networkOf(LOOP_AND_OUTSIDER);
    const exact = bestClearingExhaustively(network, cashOf(network, CASH), settingsOf(network, {}));

    expect(exact).not.toBeNull();
    expect(exact!.examined).toBe(101);
    expect(exact!.failures).toBe(1);
  });

  it("clears less than the maximum, on purpose", () => {
    expect(plan.maximumCleared).toBe(300);
    expect(plan.cleared).toBeLessThan(plan.maximumCleared);
    expect(plan.cleared).toBeGreaterThan(0);
  });
});

describe("what a rescue plan may and may not do", () => {
  const obligations = generateNetwork({
    name: "supply chain",
    firms: 120,
    invoices: 700,
    reciprocity: 0.06,
    tiers: 5,
    backflow: 0.1,
    seed: 4,
  });
  const cash = generateCash(obligations, { seed: 104, cushion: 0.05, distressed: 0.12 });
  const plan = rescue(obligations, cash);

  it("leaves every net position where it was", () => {
    const before = netsOf(obligations);
    const after = netsOf(plan.remaining);
    for (const [party, net] of before) expect(after.get(party) ?? 0, party).toBe(net);
  });

  it("only ever reduces what is owed, and never invents a counterparty", () => {
    const before = pairsOf(obligations);
    for (const [pair, amount] of pairsOf(plan.remaining)) {
      expect(before.has(pair), pair).toBe(true);
      expect(amount).toBeLessThanOrEqual(before.get(pair)!);
      expect(Number.isInteger(amount)).toBe(true);
    }
  });

  it("never loses more parties than leaving things alone or clearing everything", () => {
    expect(plan.outcome.failed.length).toBeLessThanOrEqual(plan.asOwed.failed.length);
    expect(plan.outcome.failed.length).toBeLessThanOrEqual(plan.maximum.failed.length);
  });

  it("loses everyone it says is unavoidable", () => {
    const failed = new Set(plan.outcome.failed);
    for (const party of plan.unavoidable) expect(failed.has(party), party).toBe(true);
    expect(plan.provablyBest).toBe(plan.outcome.failed.length === plan.unavoidable.length);
  });

  it("still returns a valid plan when the search budget is one evaluation", () => {
    const rushed = rescue(obligations, cash, { maxEvaluations: 1 });
    expect(rushed.exhausted).toBe(true);
    expect(rushed.outcome.failed.length).toBeLessThanOrEqual(rushed.maximum.failed.length);
    const before = netsOf(obligations);
    const after = netsOf(rushed.remaining);
    for (const [party, net] of before) expect(after.get(party) ?? 0, party).toBe(net);
  });

  it("is deterministic", () => {
    const again = rescue(obligations, cash);
    expect(again.remaining).toEqual(plan.remaining);
    expect(again.evaluations).toBe(plan.evaluations);
  });
});

describe("the search against ground truth", () => {
  // Small enough that every whole-number clearing can be tried. The search is
  // a heuristic for an NP-hard problem, so it is allowed to miss; what it is
  // not allowed to do is beat the optimum, or miss often.
  const settingsList = [{}, { cashRecovery: 0.7, receivableRecovery: 0.7 }];

  it("never reports fewer failures than the true optimum, and rarely more", () => {
    let cases = 0;
    let optimal = 0;

    for (let seed = 1; seed <= 400; seed += 1) {
      const { obligations, cash } = tinyCase(seed);
      const network = networkOf(obligations);
      if (network.parties.length < 3) continue;

      for (const options of settingsList) {
        const held = cashOf(network, cash);
        const settings = settingsOf(network, options);
        const exact = bestClearingExhaustively(network, held, settings, 60_000);
        if (!exact) continue;

        const plan = rescue(obligations, cash, options);
        cases += 1;

        expect(plan.outcome.failed.length, `seed ${seed}`).toBeGreaterThanOrEqual(exact.failures);
        if (plan.outcome.failed.length === exact.failures) optimal += 1;
      }
    }

    expect(cases).toBeGreaterThan(600);
    expect(optimal / cases).toBeGreaterThan(0.99);
  });

  it("never marks a party unavoidable that some clearing would have saved", () => {
    for (let seed = 1; seed <= 400; seed += 1) {
      const { obligations, cash } = tinyCase(seed);
      const network = networkOf(obligations);
      if (network.parties.length < 3) continue;

      for (const options of [...settingsList, { cashRecovery: 1, receivableRecovery: 0.4 }]) {
        const held = cashOf(network, cash);
        const settings = settingsOf(network, options);
        const exact = bestClearingExhaustively(network, held, settings, 60_000);
        if (!exact) continue;

        const certain = certainFailures(network, held, settings);
        let floor = 0;
        for (let i = 0; i < certain.length; i += 1) {
          if (certain[i] !== 1) continue;
          floor += 1;
          // Certain means certain: it has to fail in the best clearing too.
          expect(exact.resolution.wave[i], `seed ${seed} ${network.parties[i]}`).not.toBe(0);
        }
        expect(floor, `seed ${seed}`).toBeLessThanOrEqual(exact.failures);
      }
    }
  });

  it("declines to enumerate a network that is too large to finish", () => {
    const obligations = generateNetwork({
      name: "cluster",
      firms: 30,
      invoices: 200,
      reciprocity: 0.2,
      seed: 2,
    });
    const network = networkOf(obligations);
    const held = new Float64Array(network.parties.length);
    expect(bestClearingExhaustively(network, held, settingsOf(network, {}), 10_000)).toBeNull();
  });
});

describe("at a size the published exact method does not reach", () => {
  it("beats maximum clearing on a thousand-firm supply chain", () => {
    const obligations = generateNetwork({
      name: "supply chain",
      firms: 1_000,
      invoices: 7_000,
      reciprocity: 0.06,
      tiers: 5,
      backflow: 0.1,
      seed: 1,
    });
    const cash = generateCash(obligations, { seed: 101, cushion: 0.05, distressed: 0.12 });

    const plan = rescue(obligations, cash);

    expect(plan.outcome.failed.length).toBeLessThan(plan.maximum.failed.length);
    expect(plan.outcome.failed.length).toBeGreaterThanOrEqual(plan.unavoidable.length);
    expect(plan.exhausted).toBe(false);
  });
});

describe("walking away", () => {
  it("can net a walker's debts off so that nobody is left exposed to it", () => {
    // Dara walks away from 100 owed to Asha, but Asha owes Chen and Chen owes
    // Dara. Cancel the loop and there is nothing left for Dara to walk from.
    const loop: Obligation[] = [
      { from: "Dara", to: "Asha", amount: 100 },
      { from: "Asha", to: "Chen", amount: 100 },
      { from: "Chen", to: "Dara", amount: 100 },
    ];
    const plan = rescue(loop, new Map(), { walkedAway: ["Dara"] });

    expect(plan.asOwed.failed).toContain("Asha");
    expect(plan.outcome.failed).toEqual([]);
    expect(plan.remaining).toEqual([]);
  });
});

describe("maximum flow", () => {
  const network = networkOf([
    { from: "A", to: "B", amount: 5 },
    { from: "A", to: "C", amount: 4 },
    { from: "B", to: "D", amount: 3 },
    { from: "C", to: "D", amount: 6 },
    { from: "B", to: "C", amount: 2 },
  ]);
  const at = (name: string): number => network.index.get(name)!;
  const maxFlow = maxFlowOver(network);

  it("finds the bottleneck across parallel routes", () => {
    // B can pass on 3 directly and 2 via C; C can pass on 6 in all.
    expect(maxFlow(at("A"), at("D"), Infinity)).toBe(9);
  });

  it("stops at the limit it is given", () => {
    expect(maxFlow(at("A"), at("D"), 4)).toBe(4);
  });

  it("returns zero when nothing leads there", () => {
    expect(maxFlow(at("D"), at("A"), Infinity)).toBe(0);
  });

  it("gives the same answer when asked again", () => {
    expect(maxFlow(at("A"), at("D"), Infinity)).toBe(9);
    expect(maxFlow(at("B"), at("D"), Infinity)).toBe(5);
  });
});

describe("synthetic cash positions", () => {
  const obligations = generateNetwork({
    name: "supply chain",
    firms: 200,
    invoices: 1_200,
    reciprocity: 0.06,
    tiers: 5,
    backflow: 0.1,
    seed: 8,
  });

  it("is reproducible from its seed", () => {
    const spec = { seed: 3, cushion: 0.05, distressed: 0.1 };
    expect([...generateCash(obligations, spec)]).toEqual([...generateCash(obligations, spec)]);
  });

  it("leaves nobody short when no firm is distressed", () => {
    const network = networkOf(obligations);
    const cash = generateCash(obligations, { seed: 3, cushion: 0.05, distressed: 0 });
    const outcome = resolve(network, network.amount, cashOf(network, cash), settingsOf(network, {}));
    expect(outcome.failures).toBe(0);
  });

  it("makes the distressed firms the first wave", () => {
    const network = networkOf(obligations);
    const cash = generateCash(obligations, { seed: 3, cushion: 0.05, distressed: 0.15 });
    const outcome = resolve(network, network.amount, cashOf(network, cash), settingsOf(network, {}));
    const firstWave = [...outcome.wave].filter((wave) => wave === 1).length;

    expect(firstWave).toBeGreaterThan(0);
    expect(outcome.failures).toBeGreaterThanOrEqual(firstWave);
  });
});

describe("rescue and maximum clearing compared directly", () => {
  it("matches the search's own account of what it found", () => {
    const { obligations, cash } = tinyCase(11);
    const network = networkOf(obligations);
    const held = cashOf(network, cash);
    const settings = settingsOf(network, {});

    const search = searchRescue(network, held, settings);
    const maximumLeft = routeNetDebt(
      network.parties.length,
      network.from,
      network.to,
      network.amount
    ).remaining;
    const maximum = resolve(network, maximumLeft, held, settings);
    const plan = rescue(obligations, cash);

    expect(plan.outcome.failed.length).toBe(Math.min(search.resolution.failures, maximum.failures));
  });
});
