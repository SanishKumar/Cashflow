/**
 * Networks anyone can open without an account.
 *
 * The friends group is the small case the product is usually explained with.
 * The supply chain is the case the engine is actually for: firms that owe one
 * another along a chain, each with some cash and not much of it, and a few
 * that are short. It is generated, not hand-drawn, so the cascade it shows is
 * whatever the engine finds rather than something arranged to look good — the
 * seed was picked from many because the three clearing modes come out visibly
 * different on it, and that is the only way it was chosen.
 */

import { generateCash, generateNetwork, type Obligation } from "@cashflow/clearing";

/** What to call the things on screen, singular then plural. */
export interface Nouns {
  party: [string, string];
  debt: [string, string];
}

export const PEOPLE: Nouns = { party: ["person", "people"], debt: ["IOU", "IOUs"] };
export const FIRMS: Nouns = { party: ["firm", "firms"], debt: ["debt", "debts"] };

export interface SampleNetwork {
  id: string;
  label: string;
  currency: string;
  nouns: Nouns;
  obligations: Obligation[];
  /** What each party can put toward its debts. Absent when that is unknown. */
  cash?: Map<string, number>;
  /** Where each party belongs across the canvas, 0 to 1. */
  lanes?: Map<string, number>;
  /** Names for the lanes, first to last. */
  laneLabels?: string[];
}

const FRIENDS: Obligation[] = [
  { from: "Priya", to: "Rahul", amount: 120_000 },
  { from: "Rahul", to: "Sam", amount: 90_000 },
  { from: "Sam", to: "Priya", amount: 70_000 },
  { from: "Dev", to: "Priya", amount: 45_000 },
  { from: "Sam", to: "Dev", amount: 30_000 },
  { from: "Rahul", to: "Dev", amount: 60_000 },
  { from: "Nina", to: "Sam", amount: 25_000 },
  { from: "Dev", to: "Nina", amount: 40_000 },
];

/** Retailers buy from wholesalers, who buy from makers, who buy from suppliers. */
const TIERS = ["R", "W", "M", "S"];

function supplyChain(): SampleNetwork {
  const names = new Map<number, string>();
  const tierOf = new Map<string, number>();
  const counters = TIERS.map(() => 0);

  const obligations = generateNetwork({
    name: "supply chain",
    firms: 40,
    invoices: 150,
    reciprocity: 0.08,
    tiers: TIERS.length,
    backflow: 0.14,
    seed: 182,
    label: (firm, tier) => {
      let name = names.get(firm);
      if (!name) {
        counters[tier]! += 1;
        name = `${TIERS[tier]}${counters[tier]}`;
        names.set(firm, name);
        tierOf.set(name, tier);
      }
      return name;
    },
  });

  const lanes = new Map<string, number>();
  for (const [name, tier] of tierOf) lanes.set(name, tier / (TIERS.length - 1));

  return {
    id: "supply-chain",
    label: "Supply chain",
    currency: "EUR",
    nouns: FIRMS,
    laneLabels: ["Retail", "Wholesale", "Makers", "Suppliers"],
    obligations,
    cash: generateCash(obligations, { seed: 1821, cushion: 0.06, distressed: 0.16 }),
    lanes,
  };
}

export const SAMPLES: SampleNetwork[] = [
  {
    id: "friends",
    label: "Friends",
    currency: "INR",
    nouns: PEOPLE,
    obligations: FRIENDS,
  },
  supplyChain(),
];
