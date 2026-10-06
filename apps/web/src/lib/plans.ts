/**
 * Every way of clearing a network, side by side, and what each does when
 * someone cannot pay.
 *
 * The graph shows one plan at a time, but the point of the product is the
 * comparison, so all of them are worked out together. That is affordable
 * because the engine runs here in the browser and a group or a sample supply
 * chain resolves in a few milliseconds.
 */

import {
  buildGraph,
  cascade,
  clear,
  graphToObligations,
  grossFloor,
  grossTotal,
  netPositions,
  rescue,
  type Cascade,
  type Obligation,
} from "@cashflow/clearing";

export type ViewMode = "original" | "cycles" | "paths" | "solvent";

export interface Plan {
  mode: ViewMode;
  remaining: Obligation[];
  grossAfter: number;
  cleared: number;
  payments: number;
  /** Ordered pairs this plan created, as `from|to`. */
  newPairs: string[];
  /** Who cannot pay under this plan. Only present while a stress applies. */
  outcome?: Cascade;
  /** Keep-solvent only: parties no clearing could have saved. */
  unavoidable?: string[];
  /** Keep-solvent only: nobody fails beyond `unavoidable`. */
  provablyBest?: boolean;
}

export interface Analysis {
  parties: Array<{ id: string; net: number }>;
  gross: number;
  floor: number;
  payments: number;
  plans: Partial<Record<ViewMode, Plan>>;
  /** True when the plans carry outcomes. */
  stressed: boolean;
}

/** What one plan means for one party, measured against leaving things as owed. */
export interface Fate {
  failed: boolean;
  /** 1 if it could not pay in its own right, 2 and up if dragged down. 0 if fine. */
  wave: number;
  /** Fails as owed, survives under this plan. */
  saved: boolean;
  /** Survives as owed, fails under this plan. */
  sunk: boolean;
  /** What it is owed and will not collect. */
  loss: number;
  /** Share of what it owes that goes unpaid. */
  unpaid: number;
}

function total(obligations: readonly Obligation[]): number {
  let sum = 0;
  for (const item of obligations) sum += item.amount;
  return sum;
}

export function analyse(
  obligations: readonly Obligation[],
  cash: ReadonlyMap<string, number> | undefined,
  shocked: ReadonlySet<string>
): Analysis {
  const graph = buildGraph(obligations);
  const nets = netPositions(graph);
  const merged = graphToObligations(graph);
  const gross = grossTotal(graph);

  const cycles = clear(obligations, { mode: "cycles" });
  const paths = clear(obligations, { mode: "paths", preferExistingPairs: true });

  const plans: Partial<Record<ViewMode, Plan>> = {
    original: {
      mode: "original",
      remaining: merged,
      grossAfter: gross,
      cleared: 0,
      payments: merged.length,
      newPairs: [],
    },
    cycles: {
      mode: "cycles",
      remaining: cycles.remaining,
      grossAfter: cycles.metrics.grossAfter,
      cleared: cycles.metrics.cleared,
      payments: cycles.metrics.obligationsAfter,
      newPairs: [],
    },
    paths: {
      mode: "paths",
      remaining: paths.remaining,
      grossAfter: paths.metrics.grossAfter,
      cleared: paths.metrics.cleared,
      payments: paths.metrics.obligationsAfter,
      newPairs: paths.metrics.newPairs,
    },
  };

  const stressed = cash !== undefined || shocked.size > 0;

  if (stressed) {
    // With no balance sheets, everyone but the party in question is taken to
    // be good for what they owe. The question then is simply who was relying
    // on that party, which is all a group of friends needs answered.
    const held = cash ?? new Map(graph.nodes.map((party) => [party, Infinity]));
    const options = { walkedAway: shocked };

    for (const plan of [plans.original!, plans.cycles!, plans.paths!]) {
      plan.outcome = cascade(plan.remaining, held, options);
    }

    if (cash) {
      const found = rescue(obligations, cash, options);
      const viaLoops = plans.cycles!;

      // The engine checks its plan against its own maximum clearing. The one
      // on screen came from a different solver and may cancel different
      // loops, so if that happens to do better, it is the better plan.
      if (viaLoops.outcome!.failed.length < found.outcome.failed.length) {
        plans.solvent = {
          ...viaLoops,
          mode: "solvent",
          unavoidable: found.unavoidable,
          provablyBest: viaLoops.outcome!.failed.length === found.unavoidable.length,
        };
      } else {
        plans.solvent = {
          mode: "solvent",
          remaining: found.remaining,
          grossAfter: total(found.remaining),
          cleared: found.cleared,
          payments: found.remaining.length,
          newPairs: [],
          outcome: found.outcome,
          unavoidable: found.unavoidable,
          provablyBest: found.provablyBest,
        };
      }
    }
  }

  return {
    parties: graph.nodes.map((id, index) => ({ id, net: nets[index] ?? 0 })),
    gross,
    floor: grossFloor(graph),
    payments: merged.length,
    plans,
    stressed,
  };
}

const FINE: Fate = { failed: false, wave: 0, saved: false, sunk: false, loss: 0, unpaid: 0 };

/** Fate of every party under one plan. Empty when no stress applies. */
export function fatesUnder(analysis: Analysis, mode: ViewMode): Map<string, Fate> {
  const fates = new Map<string, Fate>();
  const outcome = analysis.plans[mode]?.outcome;
  const asOwed = analysis.plans.original?.outcome;
  if (!outcome || !asOwed) return fates;

  const failedAsOwed = new Set(asOwed.failed);
  const seen = new Set<string>();

  for (const party of outcome.parties) {
    seen.add(party.party);
    fates.set(party.party, {
      failed: party.failed,
      wave: party.wave,
      saved: !party.failed && failedAsOwed.has(party.party),
      sunk: party.failed && !failedAsOwed.has(party.party),
      loss: Math.max(0, party.owed - party.collects),
      unpaid: party.owes > 0 ? 1 - party.pays / party.owes : 0,
    });
  }

  // A party whose obligations were all cancelled drops out of the cleared
  // network entirely. It owes nothing and is owed nothing, so it is fine —
  // and if it was failing before, that is a rescue.
  for (const { id } of analysis.parties) {
    if (!seen.has(id)) fates.set(id, { ...FINE, saved: failedAsOwed.has(id) });
  }

  return fates;
}
