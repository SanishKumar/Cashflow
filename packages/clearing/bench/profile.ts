/** Times each clearing phase separately so the bottleneck is visible. */

import { maximiseCirculation } from "../src/circulation.js";
import { buildGraph, grossTotal } from "../src/graph.js";
import { generateNetwork } from "../src/generate.js";

const SIZES = [
  { firms: 60, invoices: 400 },
  { firms: 150, invoices: 1_000 },
  { firms: 400, invoices: 3_000 },
];

for (const size of SIZES) {
  const obligations = generateNetwork({
    name: "probe",
    firms: size.firms,
    invoices: size.invoices,
    reciprocity: 0.2,
    seed: 7,
  });

  const gross = grossTotal(buildGraph(obligations));
  const pct = (value: number): string => `${((value / gross) * 100).toFixed(2)}%`;

  const fastStart = performance.now();
  const fast = maximiseCirculation(buildGraph(obligations), { exact: false });
  const fastMs = performance.now() - fastStart;

  const exactStart = performance.now();
  const exact = maximiseCirculation(buildGraph(obligations), { maxIterations: 50_000 });
  const exactMs = performance.now() - exactStart;

  console.log(
    `firms=${String(size.firms).padStart(4)} invoices=${String(size.invoices).padStart(5)} | ` +
      `phase1 ${pct(fast.cleared).padStart(7)} in ${fastMs.toFixed(0).padStart(5)}ms (${fast.saturated} cycles) | ` +
      `exact ${pct(exact.cleared).padStart(7)} in ${exactMs.toFixed(0).padStart(6)}ms ` +
      `(+${pct(exact.refinement)} from ${exact.cancelled} cancellations, optimal=${exact.optimal})`
  );
}
