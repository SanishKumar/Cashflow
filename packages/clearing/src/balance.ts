import { makeRandom } from "./generate.js";
import { networkOf } from "./network.js";
import type { Obligation } from "./types.js";

/**
 * Synthetic cash positions to go with a synthetic network.
 *
 * Invoice data says who owes whom. It does not say who can pay, and that is
 * what decides whether a late payment stays one firm's problem. So the
 * benchmark has to make balance sheets up, and the shape matters more than
 * the numbers:
 *
 *   - A firm that owes more than it is owed needs working capital to cover
 *     the difference. A healthy one has that, plus a cushion.
 *   - Cushions are thin. A firm with months of spare cash absorbs any shock
 *     and there is nothing to study.
 *   - Trouble starts with a few firms that do not have their working capital:
 *     a retailer whose sales fell away, say. They are the first wave.
 *     Everyone else is solvent on paper.
 */
export interface CashSpec {
  seed: number;
  /** Spare cash a healthy firm holds, as a share of what it owes. */
  cushion: number;
  /** Share of net-debtor firms that are short of working capital. */
  distressed: number;
  /**
   * How short, at worst, as a share of the working capital needed. Each
   * distressed firm is missing between 30% and 100% of this. Defaults to 1.
   */
  severity?: number;
}

export function generateCash(obligations: readonly Obligation[], spec: CashSpec): Map<string, number> {
  const network = networkOf(obligations);
  const n = network.parties.length;
  const random = makeRandom(spec.seed);
  const severity = spec.severity ?? 1;

  const owes = new Float64Array(n);
  const owed = new Float64Array(n);
  for (let e = 0; e < network.amount.length; e += 1) {
    owes[network.from[e]!] = owes[network.from[e]!]! + network.amount[e]!;
    owed[network.to[e]!] = owed[network.to[e]!]! + network.amount[e]!;
  }

  const cash = new Map<string, number>();
  for (let i = 0; i < n; i += 1) {
    // Drawn for every firm, in a fixed order, so changing one setting does
    // not reshuffle which firms the others apply to.
    const pick = random();
    const depth = random();
    const spare = random();

    const need = Math.max(0, owes[i]! - owed[i]!);
    let held: number;
    if (need > 0 && pick < spec.distressed) {
      held = Math.round(need * (1 - severity * (0.3 + 0.7 * depth)));
    } else {
      held = Math.round(need + spec.cushion * owes[i]! * (0.5 + spare));
    }
    cash.set(network.parties[i]!, Math.max(0, held));
  }
  return cash;
}
