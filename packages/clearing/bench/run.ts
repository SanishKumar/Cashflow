/**
 * Compares cycle-restricted netting against path-enabled compensation on
 * synthetic invoice networks, reporting the two figures that matter: how much
 * obligation each mode removes, and how much new counterparty exposure it
 * creates to get there.
 *
 * Run with: npm run bench --workspace=@cashflow/clearing
 */

import { clear } from "../src/index.js";
import { generateNetwork, type NetworkSpec } from "../src/generate.js";

const SPECS: NetworkSpec[] = [
  // Unstructured networks: everyone trades with everyone, so circular flow is
  // abundant and cycle-restricted netting looks unrealistically strong.
  { name: "friends group", firms: 8, invoices: 30, reciprocity: 0.35, seed: 1 },
  { name: "unstructured cluster", firms: 400, invoices: 3_000, reciprocity: 0.2, seed: 3 },

  // Supply-chain networks: mostly hierarchical, which is what real invoice
  // data looks like and where the two modes genuinely diverge.
  { name: "supply chain (5 tiers)", firms: 400, invoices: 3_000, reciprocity: 0.06, tiers: 5, backflow: 0.1, seed: 11 },
  { name: "supply chain (8 tiers)", firms: 800, invoices: 6_000, reciprocity: 0.05, tiers: 8, backflow: 0.08, seed: 12 },
  { name: "supply chain, thin backflow", firms: 800, invoices: 6_000, reciprocity: 0.03, tiers: 8, backflow: 0.03, seed: 13 },
  { name: "regional supply chain", firms: 2_000, invoices: 15_000, reciprocity: 0.05, tiers: 6, backflow: 0.08, seed: 14 },
];

function money(minorUnits: number): string {
  return (minorUnits / 100).toLocaleString("en-US", { maximumFractionDigits: 0 });
}

function percent(ratio: number): string {
  return `${(ratio * 100).toFixed(2)}%`;
}

interface Row {
  network: string;
  invoices: string;
  gross: string;
  cycles: string;
  paths: string;
  ceiling: string;
  newPairs: string;
  ms: string;
}

const rows: Row[] = [];

for (const spec of SPECS) {
  const obligations = generateNetwork(spec);

  const cycleStart = performance.now();
  const cycles = clear(obligations, { mode: "cycles" });
  const cycleMs = performance.now() - cycleStart;

  const pathStart = performance.now();
  const paths = clear(obligations, { mode: "paths", preferExistingPairs: true });
  const pathMs = performance.now() - pathStart;

  if (!cycles.optimal || !paths.optimal) {
    console.warn(`  ! ${spec.name}: hit the iteration cap, figures are lower bounds`);
  }

  // The most any net-preserving method can remove, cycles or otherwise.
  const ceiling =
    (cycles.metrics.grossBefore - cycles.metrics.grossFloor) / cycles.metrics.grossBefore;

  rows.push({
    network: spec.name,
    invoices: String(cycles.metrics.obligationsBefore),
    gross: money(cycles.metrics.grossBefore),
    cycles: percent(cycles.metrics.clearedRatio),
    paths: percent(paths.metrics.clearedRatio),
    ceiling: percent(ceiling),
    newPairs: `${cycles.metrics.newPairs.length} / ${paths.metrics.newPairs.length}`,
    ms: `${cycleMs.toFixed(0)} / ${pathMs.toFixed(0)}`,
  });
}

const headers: Record<keyof Row, string> = {
  network: "network",
  invoices: "pairs",
  gross: "gross",
  cycles: "cycles",
  paths: "paths",
  ceiling: "ceiling",
  newPairs: "new pairs (cyc/path)",
  ms: "ms (cyc/path)",
};

const keys = Object.keys(headers) as (keyof Row)[];
const widths = keys.map((key) =>
  Math.max(headers[key].length, ...rows.map((row) => row[key].length))
);

const line = (cells: string[]): string =>
  cells.map((cell, i) => cell.padEnd(widths[i]!)).join("  ");

console.log("\nMultilateral clearing — cycle-restricted vs path-enabled\n");
console.log(line(keys.map((key) => headers[key])));
console.log(widths.map((width) => "-".repeat(width)).join("  "));
for (const row of rows) console.log(line(keys.map((key) => row[key])));

console.log(
  [
    "",
    "cycles  = obligation value removed with zero new counterparties",
    "paths   = obligation value removed once chains may be shortened",
    "ceiling = the most any net-preserving method can remove (gross - floor)",
    "",
    "Published reference (arXiv 2606.26126, 133,191 real invoices):",
    "  cycle-restricted netting  20.99%",
    "  path-enabled compensation 53.87%",
    "",
  ].join("\n")
);
