import { describe, expect, it } from "vitest";
import { cascade } from "../cascade.js";
import { makeRandom } from "../generate.js";
import { clear } from "../index.js";
import type { Obligation } from "../types.js";

/**
 * A loop with one creditor standing outside it.
 *
 * Dara owes Asha and Bo 100 each. Asha, Chen and Dara owe one another round a
 * loop. Bo is not part of the loop and has a supplier of his own to pay. Dara
 * holds 20, which is not enough for anyone.
 */
const LOOP_AND_OUTSIDER: Obligation[] = [
  { from: "Dara", to: "Asha", amount: 100 },
  { from: "Asha", to: "Chen", amount: 100 },
  { from: "Chen", to: "Dara", amount: 100 },
  { from: "Dara", to: "Bo", amount: 100 },
  { from: "Bo", to: "Supplier", amount: 50 },
];

function cashOf(entries: Record<string, number>): Map<string, number> {
  return new Map(Object.entries(entries));
}

function partyIn(result: ReturnType<typeof cascade>, name: string) {
  return result.parties.find((party) => party.party === name)!;
}

describe("a single failure", () => {
  it("pays creditors pro rata out of what the failed party has", () => {
    const result = cascade(
      [
        { from: "Dara", to: "Asha", amount: 300 },
        { from: "Dara", to: "Bo", amount: 100 },
      ],
      cashOf({ Dara: 100 })
    );

    expect(result.failed).toEqual(["Dara"]);
    expect(partyIn(result, "Dara").pays).toBe(100);
    expect(partyIn(result, "Asha").collects).toBe(75);
    expect(partyIn(result, "Bo").collects).toBe(25);
    expect(result.shortfall).toBe(300);
  });

  it("treats a party exactly able to pay as solvent", () => {
    const result = cascade([{ from: "Dara", to: "Asha", amount: 100 }], cashOf({ Dara: 100 }));
    expect(result.failed).toEqual([]);
    expect(result.shortfall).toBe(0);
  });

  it("lets a party with nothing pay out of what it collects", () => {
    // Asha holds no cash but is owed enough to cover her own bill.
    const result = cascade(
      [
        { from: "Dara", to: "Asha", amount: 100 },
        { from: "Asha", to: "Chen", amount: 80 },
      ],
      cashOf({ Dara: 100 })
    );
    expect(result.failed).toEqual([]);
  });
});

describe("contagion", () => {
  it("records the wave each party fails in", () => {
    const result = cascade(
      [
        { from: "Dara", to: "Asha", amount: 100 },
        { from: "Asha", to: "Chen", amount: 100 },
        { from: "Chen", to: "Eve", amount: 100 },
      ],
      cashOf({ Dara: 40, Asha: 10, Chen: 60 })
    );

    // Dara pays 40. Asha then has 50 against 100. Chen then has 110, enough.
    expect(result.waves).toEqual([["Dara"], ["Asha"]]);
    expect(partyIn(result, "Dara").wave).toBe(1);
    expect(partyIn(result, "Asha").wave).toBe(2);
    expect(partyIn(result, "Chen").wave).toBe(0);
    expect(partyIn(result, "Asha").pays).toBe(50);
    expect(partyIn(result, "Chen").pays).toBe(100);
  });

  it("separates being unable to pay from being dragged down", () => {
    // Asha is solvent on paper: paid in full she could pay. She fails only
    // because Dara does.
    const result = cascade(
      [
        { from: "Dara", to: "Asha", amount: 100 },
        { from: "Asha", to: "Chen", amount: 100 },
      ],
      cashOf({ Dara: 30 })
    );

    expect(result.waves[0]).toEqual(["Dara"]);
    expect(result.waves[1]).toEqual(["Asha"]);
  });

  it("solves a ring of failed parties that mostly pay each other", () => {
    // Asha and Bo owe each other 100, and Asha owes 10 outside the ring. Each
    // one's payment depends on the other's, and sweeping converges slowly, so
    // this exercises the exact solve. By hand: Asha pays 11, Bo pays 10.
    const result = cascade(
      [
        { from: "Asha", to: "Bo", amount: 100 },
        { from: "Bo", to: "Asha", amount: 100 },
        { from: "Asha", to: "Zed", amount: 10 },
      ],
      cashOf({ Asha: 1 })
    );

    expect(result.failed).toEqual(["Asha", "Bo"]);
    expect(partyIn(result, "Asha").pays).toBeCloseTo(11, 9);
    expect(partyIn(result, "Bo").pays).toBeCloseTo(10, 9);
    expect(partyIn(result, "Zed").collects).toBeCloseTo(1, 9);
    expect(result.converged).toBe(true);
  });
});

describe("value lost in failure", () => {
  const chain: Obligation[] = [
    { from: "Dara", to: "Asha", amount: 100 },
    { from: "Asha", to: "Chen", amount: 100 },
  ];

  it("passes everything on when nothing is lost", () => {
    const result = cascade(chain, cashOf({ Dara: 40 }));
    expect(partyIn(result, "Asha").pays).toBe(40);
  });

  it("destroys part of what a failed party collects", () => {
    // Asha collects 40 from Dara but only half of it survives her failure.
    const result = cascade(chain, cashOf({ Dara: 40 }), { receivableRecovery: 0.5 });
    expect(partyIn(result, "Asha").collects).toBe(40);
    expect(partyIn(result, "Asha").pays).toBe(20);
    expect(partyIn(result, "Chen").collects).toBe(20);
  });

  it("destroys part of a failed party's own cash", () => {
    const result = cascade(chain, cashOf({ Dara: 40 }), { cashRecovery: 0.25 });
    expect(partyIn(result, "Dara").pays).toBe(10);
  });

  it("rejects recovery rates outside 0..1", () => {
    expect(() => cascade(chain, cashOf({}), { receivableRecovery: 1.2 })).toThrow(/between 0 and 1/);
  });
});

describe("walking away", () => {
  const chain: Obligation[] = [
    { from: "Dara", to: "Asha", amount: 100 },
    { from: "Asha", to: "Chen", amount: 100 },
  ];

  it("pays nothing however much the party holds", () => {
    const result = cascade(chain, cashOf({ Dara: 1_000, Asha: 100 }), { walkedAway: ["Dara"] });
    expect(partyIn(result, "Dara").pays).toBe(0);
    expect(result.failed).toEqual(["Dara"]);
  });

  it("counts the party it sinks as a later wave, not as a first failure", () => {
    const result = cascade(chain, cashOf({ Dara: 1_000 }), { walkedAway: ["Dara"] });
    expect(result.waves).toEqual([["Dara"], ["Asha"]]);
  });

  it("stops at a party that can always pay", () => {
    const result = cascade(chain, cashOf({ Asha: Infinity }), { walkedAway: ["Dara"] });
    expect(result.failed).toEqual(["Dara"]);
    expect(partyIn(result, "Asha").pays).toBe(100);
  });
});

describe("cancelling a loop when someone in it cannot pay", () => {
  // The same five obligations and the same failing party each time. Only one
  // party's cash changes between cases, and it decides whether cancelling the
  // loop is neutral, a rescue, or the thing that sinks somebody.
  const cleared = clear(LOOP_AND_OUTSIDER, { mode: "cycles" }).remaining;

  it("leaves only the debts outside the loop", () => {
    expect(cleared).toEqual(
      expect.arrayContaining([
        { from: "Dara", to: "Bo", amount: 100 },
        { from: "Bo", to: "Supplier", amount: 50 },
      ])
    );
    expect(cleared).toHaveLength(2);
  });

  it("changes who fails without changing how many", () => {
    const cash = cashOf({ Dara: 20, Asha: 30, Chen: 100 });

    // As owed, Dara's estate is 120: his 20 plus the 100 Chen pays him. Asha
    // and Bo get 60 each. Asha cannot cover her 100; Bo can cover his 50.
    const asOwed = cascade(LOOP_AND_OUTSIDER, cash);
    expect(asOwed.failed).toEqual(["Dara", "Asha"]);
    expect(partyIn(asOwed, "Bo").collects).toBe(60);

    // Cancelled, Asha owes nobody. But Dara's estate is now just his 20, and
    // it all goes to Bo, who needed 50.
    const afterClearing = cascade(cleared, cash);
    expect(afterClearing.failed).toEqual(["Dara", "Bo"]);
    expect(partyIn(afterClearing, "Bo").collects).toBe(20);
  });

  it("rescues a party inside the loop", () => {
    const cash = cashOf({ Dara: 20, Asha: 30, Chen: 100, Bo: 30 });
    expect(cascade(LOOP_AND_OUTSIDER, cash).failed).toEqual(["Dara", "Asha"]);
    expect(cascade(cleared, cash).failed).toEqual(["Dara"]);
  });

  it("sinks a party outside the loop", () => {
    const cash = cashOf({ Dara: 20, Asha: 40, Chen: 100 });
    expect(cascade(LOOP_AND_OUTSIDER, cash).failed).toEqual(["Dara"]);
    expect(cascade(cleared, cash).failed).toEqual(["Dara", "Bo"]);
  });

  it("is neutral when everyone in the loop can pay", () => {
    const cash = cashOf({ Dara: 100, Asha: 0, Chen: 0, Bo: 0 });
    expect(cascade(LOOP_AND_OUTSIDER, cash).failed).toEqual([]);
    expect(cascade(cleared, cash).failed).toEqual([]);
  });
});

describe("invariants on randomised networks", () => {
  function randomCase(seed: number) {
    const random = makeRandom(seed * 7_919);
    const parties = 3 + Math.floor(random() * 12);
    const obligations: Obligation[] = [];
    const count = parties + Math.floor(random() * parties * 3);
    for (let i = 0; i < count; i += 1) {
      const from = Math.floor(random() * parties);
      const to = Math.floor(random() * parties);
      if (from === to) continue;
      obligations.push({ from: `p${from}`, to: `p${to}`, amount: 1 + Math.floor(random() * 500) });
    }
    const cash = new Map<string, number>();
    for (let i = 0; i < parties; i += 1) {
      cash.set(`p${i}`, random() < 0.4 ? 0 : Math.floor(random() * 400));
    }
    return { obligations, cash };
  }

  it("has every solvent party pay in full and every failed party pay all it has", () => {
    for (let seed = 1; seed <= 300; seed += 1) {
      const { obligations, cash } = randomCase(seed);
      const result = cascade(obligations, cash);

      for (const party of result.parties) {
        if (party.failed) {
          expect(party.pays, `seed ${seed} ${party.party}`).toBeCloseTo(party.cash + party.collects, 6);
          expect(party.pays).toBeLessThan(party.owes);
        } else {
          expect(party.pays, `seed ${seed} ${party.party}`).toBe(party.owes);
          expect(party.cash + party.collects).toBeGreaterThanOrEqual(party.owes - 1e-6);
        }
      }
      expect(result.converged).toBe(true);
    }
  });

  it("pays out exactly what is collected when nothing is lost in failure", () => {
    for (let seed = 1; seed <= 300; seed += 1) {
      const { obligations, cash } = randomCase(seed);
      const result = cascade(obligations, cash);
      const paid = result.parties.reduce((sum, party) => sum + party.pays, 0);
      const collected = result.parties.reduce((sum, party) => sum + party.collects, 0);
      expect(paid, `seed ${seed}`).toBeCloseTo(collected, 6);
      expect(result.shortfall).toBeCloseTo(result.owed - paid, 6);
    }
  });

  it("never fails more parties when everyone holds more cash", () => {
    for (let seed = 1; seed <= 300; seed += 1) {
      const { obligations, cash } = randomCase(seed);
      const richer = new Map([...cash].map(([party, held]) => [party, held + 50]));
      const before = cascade(obligations, cash);
      const after = cascade(obligations, richer);

      const stillFailed = new Set(before.failed);
      for (const party of after.failed) {
        expect(stillFailed.has(party), `seed ${seed} ${party}`).toBe(true);
      }
    }
  });

  it("never fails fewer parties when value is lost in failure", () => {
    for (let seed = 1; seed <= 300; seed += 1) {
      const { obligations, cash } = randomCase(seed);
      const lossless = cascade(obligations, cash);
      const lossy = cascade(obligations, cash, { receivableRecovery: 0.6, cashRecovery: 0.8 });
      expect(lossy.failed.length, `seed ${seed}`).toBeGreaterThanOrEqual(lossless.failed.length);
    }
  });
});
