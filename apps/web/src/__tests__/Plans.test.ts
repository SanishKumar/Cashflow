import { describe, expect, it } from "vitest";
import { analyse, fatesUnder } from "../lib/plans";
import { SAMPLES } from "../lib/samples";

const friends = SAMPLES.find((sample) => sample.id === "friends")!;
const supplyChain = SAMPLES.find((sample) => sample.id === "supply-chain")!;
const NOBODY: ReadonlySet<string> = new Set();

describe("the friends sample", () => {
  it("clears the figures the front page quotes", () => {
    const analysis = analyse(friends.obligations, friends.cash, NOBODY);

    expect(analysis.gross).toBe(480_000);
    expect(analysis.payments).toBe(8);
    expect(analysis.plans.cycles!.cleared).toBe(425_000);
    expect(analysis.plans.cycles!.payments).toBe(4);
    expect(analysis.plans.cycles!.newPairs).toEqual([]);
    expect(analysis.plans.paths!.newPairs.length).toBeGreaterThan(0);
  });

  it("works out nothing about defaults until somebody is picked", () => {
    const analysis = analyse(friends.obligations, friends.cash, NOBODY);

    expect(analysis.stressed).toBe(false);
    expect(analysis.plans.original!.outcome).toBeUndefined();
    expect(analysis.plans.solvent).toBeUndefined();
    expect(fatesUnder(analysis, "cycles").size).toBe(0);
  });

  it("shows cancelling loops taking the sting out of a creditor who cannot pay", () => {
    // Sam is owed more than he owes. As things stand he still owes Priya and
    // Dev a thousand between them. Cancel the loops and he owes nobody, so
    // there is nothing left for him to default on.
    const analysis = analyse(friends.obligations, friends.cash, new Set(["Sam"]));

    expect(analysis.stressed).toBe(true);
    expect(analysis.plans.original!.outcome!.shortfall).toBe(100_000);
    expect(analysis.plans.cycles!.outcome!.shortfall).toBe(0);
    // Balance sheets are unknown, so the mode that needs them is not offered.
    expect(analysis.plans.solvent).toBeUndefined();
  });

  it("names the person simplifying hands a debtor's risk to", () => {
    // Rahul owes Sam and Dev. Simplify everything and somebody who never
    // lent Rahul anything is left holding part of what he owes.
    const analysis = analyse(friends.obligations, friends.cash, new Set(["Rahul"]));
    const asOwed = fatesUnder(analysis, "original");
    const simplified = fatesUnder(analysis, "paths");

    const newlyExposed = [...simplified].filter(
      ([name, fate]) => name !== "Rahul" && fate.loss > 0 && (asOwed.get(name)?.loss ?? 0) === 0
    );
    expect(newlyExposed.length).toBeGreaterThan(0);

    // Cancelling loops, by contrast, cannot expose anyone who was not already.
    const viaLoops = fatesUnder(analysis, "cycles");
    for (const [name, fate] of viaLoops) {
      if (name === "Rahul" || fate.loss === 0) continue;
      expect(asOwed.get(name)!.loss, name).toBeGreaterThan(0);
    }
  });
});

describe("the supply chain sample", () => {
  const analysis = analyse(supplyChain.obligations, supplyChain.cash, NOBODY);
  const failing = (mode: "original" | "cycles" | "paths" | "solvent"): number =>
    analysis.plans[mode]!.outcome!.failed.length;

  it("comes with balance sheets, so every plan has an outcome", () => {
    expect(analysis.stressed).toBe(true);
    expect(analysis.parties).toHaveLength(31);
    expect(analysis.payments).toBe(88);
  });

  it("loses fewer firms the more carefully the debt is cancelled", () => {
    // These are the counts shown on the mode switch. The sample was chosen
    // because they differ; this pins them so an engine change that moves
    // them cannot go unnoticed.
    expect(failing("original")).toBe(6);
    expect(failing("cycles")).toBe(5);
    expect(failing("solvent")).toBe(3);
  });

  it("proves the keep-solvent plan cannot be beaten by any other cancellation", () => {
    const plan = analysis.plans.solvent!;
    expect(plan.provablyBest).toBe(true);
    expect(plan.unavoidable).toHaveLength(3);
  });

  it("keeps solvent without handing anyone a new counterparty", () => {
    expect(analysis.plans.solvent!.newPairs).toEqual([]);
    expect(analysis.plans.paths!.newPairs.length).toBeGreaterThan(0);
  });

  it("gives up only a little clearing to do it", () => {
    const solvent = analysis.plans.solvent!.cleared;
    const maximum = analysis.plans.cycles!.cleared;
    expect(solvent).toBeLessThan(maximum);
    expect(solvent / maximum).toBeGreaterThan(0.9);
  });

  it("marks three firms saved and none sunk under the keep-solvent plan", () => {
    const fates = [...fatesUnder(analysis, "solvent").values()];
    expect(fates.filter((fate) => fate.saved)).toHaveLength(3);
    expect(fates.filter((fate) => fate.sunk)).toHaveLength(0);
  });

  it("re-plans when a firm is knocked over", () => {
    const shocked = analyse(supplyChain.obligations, supplyChain.cash, new Set(["W1"]));
    const before = analysis.plans.original!.outcome!.failed.length;
    const after = shocked.plans.original!.outcome!.failed.length;

    expect(after).toBeGreaterThan(before);
    expect(shocked.plans.solvent!.outcome!.failed.length).toBeLessThanOrEqual(after);
    expect(shocked.plans.solvent!.outcome!.failed).toContain("W1");
  });
});
