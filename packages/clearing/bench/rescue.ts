/**
 * Does choosing what to cancel actually save anyone?
 *
 * Two questions, answered separately because they need different evidence.
 *
 * First, how good is the search? Picking the clearing with the fewest
 * failures is NP-hard, so on networks small enough to enumerate, every
 * possible clearing is tried and the search is scored against the true
 * optimum.
 *
 * Second, what does it buy at a realistic size? There the optimum is out of
 * reach, so the search is compared with doing nothing and with clearing as
 * much as possible, and against a proven floor: parties that fail under any
 * clearing whatsoever. The true optimum lies between the floor and what the
 * search found, so the distance between those two is the most the search
 * could be wrong by.
 *
 * Run with: npm run bench:rescue --workspace=@cashflow/clearing
 */

import { generateCash } from "../src/balance.js";
import { cashOf, resolve, settingsOf, type CascadeOptions } from "../src/cascade.js";
import { bestClearingExhaustively } from "../src/exhaustive.js";
import { generateNetwork, makeRandom } from "../src/generate.js";
import { networkOf } from "../src/network.js";
import { certainFailures, searchRescue } from "../src/rescue.js";
import { routeNetDebt } from "../src/routing.js";
import type { Obligation } from "../src/types.js";

const REGIMES: Array<{ name: string; options: CascadeOptions }> = [
  { name: "nothing lost in failure", options: {} },
  {
    name: "failure destroys value (60% of cash, 80% of receivables recovered)",
    options: { cashRecovery: 0.6, receivableRecovery: 0.8 },
  },
];

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

function count(flags: Uint8Array): number {
  let total = 0;
  for (let i = 0; i < flags.length; i += 1) total += flags[i]!;
  return total;
}

console.log("\nSolvency-aware clearing\n");
console.log("1. Against ground truth — 4 to 6 parties, every clearing enumerated\n");

for (const regime of REGIMES) {
  let cases = 0;
  let optimal = 0;
  let missedBy = 0;
  let maximumOptimal = 0;
  let asOwedOptimal = 0;
  let floorTight = 0;
  let enumerated = 0;

  for (let seed = 1; seed <= 3_000; seed += 1) {
    const { obligations, cash } = tinyCase(seed);
    const network = networkOf(obligations);
    if (network.parties.length < 3) continue;

    const held = cashOf(network, cash);
    const settings = settingsOf(network, regime.options);
    const exact = bestClearingExhaustively(network, held, settings, 300_000);
    if (!exact) continue;

    const asOwed = resolve(network, network.amount, held, settings);
    const maximumLeft = routeNetDebt(
      network.parties.length,
      network.from,
      network.to,
      network.amount
    ).remaining;
    const maximum = resolve(network, maximumLeft, held, settings);
    const certain = certainFailures(network, held, settings);
    const search = searchRescue(network, held, settings, 20_000, certain);
    const found = Math.min(search.resolution.failures, maximum.failures);

    cases += 1;
    enumerated += exact.examined;
    if (found === exact.failures) optimal += 1;
    else missedBy += found - exact.failures;
    if (maximum.failures === exact.failures) maximumOptimal += 1;
    if (asOwed.failures === exact.failures) asOwedOptimal += 1;
    if (count(certain) === exact.failures) floorTight += 1;
  }

  const share = (value: number): string => `${((value / cases) * 100).toFixed(2)}%`;

  console.log(`  ${regime.name}`);
  console.log(
    `    ${cases.toLocaleString("en-US")} networks, ` +
      `${enumerated.toLocaleString("en-US")} clearings resolved to find the optima`
  );
  console.log(`    search finds the optimum          ${share(optimal)}`);
  console.log(
    `    when it misses, it is off by      ${cases === optimal ? "—" : (missedBy / (cases - optimal)).toFixed(2)} ` +
      `(${cases - optimal} networks)`
  );
  console.log(`    maximum clearing is the optimum   ${share(maximumOptimal)}`);
  console.log(`    doing nothing is the optimum      ${share(asOwedOptimal)}`);
  console.log(`    the floor alone proves the optimum ${share(floorTight)}`);
  console.log();
}

console.log("2. At a size the published exact method does not reach\n");

const SIZES = [
  { firms: 300, invoices: 2_000, tiers: 5 },
  { firms: 1_000, invoices: 7_000, tiers: 5 },
  { firms: 1_000, invoices: 3_000, tiers: 6 },
  { firms: 3_000, invoices: 20_000, tiers: 6 },
];
const SEEDS = 10;

interface Row {
  network: string;
  asOwed: string;
  maximum: string;
  rescue: string;
  floor: string;
  gap: string;
  saved: string;
  time: string;
}

for (const regime of REGIMES) {
  const rows: Row[] = [];

  for (const size of SIZES) {
    let asOwedTotal = 0;
    let maximumTotal = 0;
    let rescueTotal = 0;
    let floorTotal = 0;
    let ms = 0;
    let firms = 0;
    let pairs = 0;

    for (let seed = 1; seed <= SEEDS; seed += 1) {
      const obligations = generateNetwork({
        name: "supply chain",
        firms: size.firms,
        invoices: size.invoices,
        reciprocity: 0.06,
        tiers: size.tiers,
        backflow: 0.1,
        seed,
      });
      const cash = generateCash(obligations, { seed: seed + 100, cushion: 0.05, distressed: 0.12 });
      const network = networkOf(obligations);
      const held = cashOf(network, cash);
      const settings = settingsOf(network, regime.options);

      const asOwed = resolve(network, network.amount, held, settings);
      const maximumLeft = routeNetDebt(
        network.parties.length,
        network.from,
        network.to,
        network.amount
      ).remaining;
      const maximum = resolve(network, maximumLeft, held, settings);

      const start = performance.now();
      const certain = certainFailures(network, held, settings);
      const search = searchRescue(network, held, settings, 20_000, certain);
      ms += performance.now() - start;

      firms += network.parties.length;
      pairs += network.amount.length;
      asOwedTotal += asOwed.failures;
      maximumTotal += maximum.failures;
      rescueTotal += Math.min(search.resolution.failures, maximum.failures);
      floorTotal += count(certain);
    }

    const mean = (value: number): string => (value / SEEDS).toFixed(1);
    rows.push({
      network: `${Math.round(firms / SEEDS).toLocaleString("en-US")} firms, ${Math.round(
        pairs / SEEDS
      ).toLocaleString("en-US")} obligations`,
      asOwed: mean(asOwedTotal),
      maximum: mean(maximumTotal),
      rescue: mean(rescueTotal),
      floor: mean(floorTotal),
      gap: `${(((rescueTotal - floorTotal) / rescueTotal) * 100).toFixed(1)}%`,
      saved: `${(((maximumTotal - rescueTotal) / maximumTotal) * 100).toFixed(1)}%`,
      time: `${(ms / SEEDS).toFixed(0)} ms`,
    });
  }

  const headers: Record<keyof Row, string> = {
    network: "network (mean of 10 seeds)",
    asOwed: "as owed",
    maximum: "maximum",
    rescue: "rescue",
    floor: "floor",
    gap: "gap to floor",
    saved: "fewer than max",
    time: "time",
  };
  const keys = Object.keys(headers) as (keyof Row)[];
  const widths = keys.map((key) =>
    Math.max(headers[key].length, ...rows.map((row) => row[key].length))
  );
  const line = (cells: string[]): string =>
    cells.map((cell, i) => cell.padEnd(widths[i]!)).join("  ");

  console.log(`  ${regime.name}\n`);
  console.log(`  ${line(keys.map((key) => headers[key]))}`);
  console.log(`  ${widths.map((width) => "-".repeat(width)).join("  ")}`);
  for (const row of rows) console.log(`  ${line(keys.map((key) => row[key]))}`);
  console.log();
}

console.log(
  [
    "  Figures are parties that fail, lower is better.",
    "  as owed  = nothing cleared",
    "  maximum  = as much cleared as possible, which is what clearing systems do",
    "  rescue   = cleared to keep the most parties solvent",
    "  floor    = parties proven to fail under any clearing; the optimum is between floor and rescue",
    "",
    "  5% of what a firm owes held as spare cash; 12% of net-debtor firms short of working capital.",
    "",
    "  Reference: Csáji, Mateiu, Popa, Schlotter (arXiv 2603.27155) prove the problem NP-hard",
    "  and report their exact MILP reaching a one-hour limit beyond 100 firms.",
    "",
  ].join("\n")
);
