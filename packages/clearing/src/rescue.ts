import {
  cashOf,
  resolve,
  settingsOf,
  summarise,
  type Cascade,
  type CascadeOptions,
  type Resolution,
  type ResolveSettings,
} from "./cascade.js";
import { maxFlowOver } from "./maxflow.js";
import { networkOf, obligationsOf, type Network } from "./network.js";
import { routeNetDebt } from "./routing.js";
import type { Obligation } from "./types.js";

/**
 * Clearing chosen for who survives it, not for how much it cancels.
 *
 * Cancelling a loop is neutral while everyone in it can pay. Once someone in
 * it cannot, cancelling is a priority jump: the loop's members are settled in
 * full against each other, and the failing party's remaining creditors share a
 * smaller estate. So which loops are cancelled, and by how much, decides which
 * of the parties that were solvent on paper get dragged down.
 *
 * Picking the clearing that leaves the fewest failures is NP-hard — it is
 * NP-hard even to decide whether one given party can be saved (Csáji, Mateiu,
 * Popa and Schlotter, 2026). Their exact method is a mixed-integer program
 * that stopped finishing within an hour past a hundred firms. This is a
 * search instead, with a bound to hold it to account:
 *
 *   - Every failure that is not inevitable is caused by claims on a failed
 *     party being worth less than face. The only thing clearing can do for
 *     such a party is cancel those claims at face value, by routing them
 *     round a loop back to the failed debtor. That is one specific kind of
 *     move, and the search mostly makes that kind.
 *   - Loops among parties that all end up solvent change nothing, so they are
 *     left until last and then cancelled to the maximum.
 *   - Some parties fail under every possible clearing, and that set can be
 *     computed (see `certainFailures`). It is a floor on the answer. Reaching
 *     it proves the result optimal; falling short of it says by how much, at
 *     most, the search could be wrong.
 *
 * Each candidate move is checked by resolving the whole network again, so the
 * search never believes its own estimate of what a move does.
 */

export interface RescueOptions extends CascadeOptions {
  /**
   * How many candidate clearings the search may resolve before settling for
   * the best it has. Defaults to 20,000.
   */
  maxEvaluations?: number;
}

export interface RescuePlan {
  /** What is left outstanding under the plan. */
  remaining: Obligation[];
  /** Obligation value the plan cancels. */
  cleared: number;
  /** Who fails if the plan is carried out. */
  outcome: Cascade;
  /** Who fails if nothing is cleared. */
  asOwed: Cascade;
  /** Who fails if as much as possible is cleared. */
  maximum: Cascade;
  /** Obligation value maximum clearing cancels, for comparison with `cleared`. */
  maximumCleared: number;
  /**
   * Parties proven to fail under any clearing at all. The plan cannot lose
   * fewer than this many.
   */
  unavoidable: string[];
  /**
   * True when nobody fails beyond `unavoidable`. No clearing can do better,
   * so the plan is optimal and this is the proof.
   */
  provablyBest: boolean;
  evaluations: number;
  /** True if the search stopped on `maxEvaluations` rather than running out of moves. */
  exhausted: boolean;
}

export interface RescueSearch {
  /** Amounts left outstanding. */
  amount: Float64Array;
  resolution: Resolution;
  evaluations: number;
  exhausted: boolean;
}

/** Orders two outcomes: fewer failures first, then less left unpaid. */
function better(a: Resolution, b: Resolution): boolean {
  if (a.failures !== b.failures) return a.failures < b.failures;
  return a.shortfall < b.shortfall - 1e-6;
}

/**
 * Parties that fail whatever is cleared, as a 0/1 flag per party.
 *
 * It starts from the obvious cases — a party that could not pay even if paid
 * in full, or a net debtor that walks away — and then asks of everyone else:
 * what is the best this party could possibly do? For each claim on a party
 * already known to fail, the most that could ever be cancelled at face value
 * is the maximum flow from creditor back to debtor; the rest pays at no more
 * than the debtor's best possible rate. If that best case still does not cover
 * what the party owes, it is certain to fail too, and its own creditors are
 * re-examined.
 *
 * Every step is an upper bound on what a party can collect, so the set only
 * ever contains parties that truly cannot be saved. It can miss some: the
 * bound treats each creditor as if it had the network's spare capacity to
 * itself.
 */
export function certainFailures(
  network: Network,
  cash: Float64Array,
  settings: ResolveSettings
): Uint8Array {
  const n = network.parties.length;
  const m = network.amount.length;
  const { from, to, amount, inStart, inArcs } = network;
  const maxFlow = maxFlowOver(network);

  const owes = new Float64Array(n);
  const owed = new Float64Array(n);
  for (let e = 0; e < m; e += 1) {
    owes[from[e]!] = owes[from[e]!]! + amount[e]!;
    owed[to[e]!] = owed[to[e]!]! + amount[e]!;
  }

  const certain = new Uint8Array(n);
  /** Upper bound on the share of its obligations a certain failure pays. */
  const bestRate = new Float64Array(n).fill(1);
  /** Most of each arc that could ever be cancelled. Filled in on demand. */
  const cancellable = new Float64Array(m).fill(-1);

  const walked = (i: number): boolean => settings.walkedAway?.[i] === 1;

  for (let i = 0; i < n; i += 1) {
    if (walked(i) && owed[i]! < owes[i]!) {
      certain[i] = 1;
      bestRate[i] = 0;
    }
  }

  for (let pass = 0; pass <= n; pass += 1) {
    let changed = false;

    for (let i = 0; i < n; i += 1) {
      if (owes[i] === 0) continue;

      let collects = 0;
      for (let p = inStart[i]!; p < inStart[i + 1]!; p += 1) {
        const arc = inArcs[p]!;
        const debtor = from[arc]!;
        if (certain[debtor] === 0) {
          collects += amount[arc]!;
          continue;
        }
        if (cancellable[arc] === -1) cancellable[arc] = maxFlow(i, debtor, amount[arc]!);
        const atFace = cancellable[arc]!;
        collects += atFace + (amount[arc]! - atFace) * bestRate[debtor]!;
      }

      if (certain[i] === 0) {
        if (cash[i]! + collects >= owes[i]! - 1e-9 * (owes[i]! + 1)) continue;
        certain[i] = 1;
        changed = true;
      }
      if (walked(i)) {
        bestRate[i] = 0;
        continue;
      }

      // Netting through a failed party takes the same amount off its estate
      // and its debts. Which way that moves its payout rate depends on the
      // recovery rates, so the bound takes the better of none and as much as
      // could ever pass through it.
      const estate = settings.cashRecovery * cash[i]! + settings.receivableRecovery * collects;
      const through = Math.min(owed[i]!, owes[i]!);
      let rate = estate / owes[i]!;
      if (owes[i]! - through <= 0) rate = 1;
      else {
        rate = Math.max(
          rate,
          (estate - settings.receivableRecovery * through) / (owes[i]! - through)
        );
      }
      rate = Math.max(0, Math.min(1, rate));
      if (rate < bestRate[i]! - 1e-12) {
        bestRate[i] = rate;
        changed = true;
      }
    }

    if (!changed) break;
  }

  return certain;
}

/**
 * Multiples of a party's estimated need to try cancelling, smallest first.
 *
 * The estimate is made at the current payout rates, and cancelling changes
 * those rates, so it is only a starting point. Trying less first matters:
 * everything cancelled for one creditor comes out of the estate the others
 * share, and the smallest amount that works leaves the most behind. The last
 * rung cancels everything that can be found.
 */
const AMOUNTS_TO_TRY = [0.6, 1.05, 1.6, 2.5, 4, 8, Infinity];

/**
 * The search itself, on arrays. Starts from the network as owed.
 *
 * `certain` marks parties not worth trying to save; pass the result of
 * `certainFailures`, or leave it out to try everyone.
 */
export function searchRescue(
  network: Network,
  cash: Float64Array,
  settings: ResolveSettings,
  maxEvaluations = 20_000,
  certain?: Uint8Array
): RescueSearch {
  const n = network.parties.length;
  const m = network.amount.length;
  const { from, to, outStart, outArcs, inStart, inArcs } = network;

  const left = network.amount.slice();
  let current = resolve(network, left, cash, settings);
  let evaluations = 1;

  const seenAt = new Int32Array(n);
  const arrivedBy = new Int32Array(n);
  const queue = new Int32Array(n);
  let search = 0;

  // Every change to `left` is logged so a move that does not pay off can be
  // taken back exactly.
  const changedArc: number[] = [];
  const changedBy: number[] = [];

  const cancel = (arc: number, value: number): void => {
    left[arc] = left[arc]! - value;
    changedArc.push(arc);
    changedBy.push(value);
  };

  const takeBack = (): void => {
    while (changedArc.length > 0) {
      const arc = changedArc.pop()!;
      left[arc] = left[arc]! + changedBy.pop()!;
    }
  };

  const keep = (): void => {
    changedArc.length = 0;
    changedBy.length = 0;
  };

  /**
   * Cancels up to `limit` of what `debtor` owes `party` by finding chains of
   * obligations leading from the party back to that debtor and cancelling
   * round the loop each one closes. Returns how much was cancelled.
   */
  const cancelAgainst = (
    party: number,
    debtor: number,
    closing: number,
    limit: number,
    throughFailed: boolean
  ): number => {
    let moved = 0;

    while (moved < limit && left[closing]! > 0) {
      search += 1;
      seenAt[party] = search;
      queue[0] = party;
      let read = 0;
      let write = 1;
      let found = false;

      while (read < write && !found) {
        const u = queue[read]!;
        read += 1;
        for (let p = outStart[u]!; p < outStart[u + 1]!; p += 1) {
          const arc = outArcs[p]!;
          if (left[arc]! <= 0) continue;
          const v = to[arc]!;
          if (seenAt[v] === search) continue;
          // Passing through a party that pays in full costs it nothing.
          // Passing through a failed one shrinks its estate too, so that is
          // only tried when the cleaner route does not exist.
          if (v !== debtor && !throughFailed && current.wave[v] !== 0) continue;

          seenAt[v] = search;
          arrivedBy[v] = arc;
          if (v === debtor) {
            found = true;
            break;
          }
          queue[write] = v;
          write += 1;
        }
      }
      if (!found) break;

      let value = Math.min(limit - moved, left[closing]!);
      for (let v = debtor; v !== party; v = from[arrivedBy[v]!]!) {
        value = Math.min(value, left[arrivedBy[v]!]!);
      }
      for (let v = debtor; v !== party; v = from[arrivedBy[v]!]!) cancel(arrivedBy[v]!, value);
      cancel(closing, value);
      moved += value;
    }

    return moved;
  };

  /**
   * Tries to save one party by cancelling its claims on failed debtors.
   * `scale` is how much of its estimated need to go for: a small multiple
   * leaves more of each estate for everyone else, and `Infinity` cancels
   * everything that can be found.
   */
  const shield = (party: number, scale: number, throughFailed: boolean): boolean => {
    const exposures: Array<{ arc: number; debtor: number; loss: number }> = [];
    for (let p = inStart[party]!; p < inStart[party + 1]!; p += 1) {
      const arc = inArcs[p]!;
      const debtor = from[arc]!;
      if (left[arc]! <= 0 || current.wave[debtor] === 0) continue;
      const share = current.owes[debtor]! > 0 ? current.pays[debtor]! / current.owes[debtor]! : 1;
      if (share < 1) exposures.push({ arc, debtor, loss: 1 - share });
    }
    if (exposures.length === 0) return false;

    // Worst payers first: each unit cancelled there relieves the most.
    exposures.sort((a, b) => b.loss - a.loss);

    const everything = scale === Infinity;
    const gap = current.owes[party]! - cash[party]! - current.collects[party]!;
    let wanted = everything ? Infinity : gap * scale + 1;

    for (const { arc, debtor, loss } of exposures) {
      if (wanted <= 0) break;
      const limit = everything ? left[arc]! : Math.min(left[arc]!, Math.ceil(wanted / loss));
      const moved = cancelAgainst(party, debtor, arc, limit, throughFailed);
      wanted -= moved * loss;
    }

    if (changedArc.length === 0) return false;
    // A measured attempt that could not find enough to cancel is not worth
    // resolving; the attempt that takes everything covers the same ground.
    if (!everything && wanted > 0) {
      takeBack();
      return false;
    }

    const next = resolve(network, left, cash, settings);
    evaluations += 1;

    const fewer = next.failures < current.failures;
    // Saving this party at the cost of another is still worth taking when
    // less goes unpaid overall. Unpaid value strictly falls each time, so
    // trades cannot go round in circles.
    const trade =
      next.failures === current.failures &&
      next.wave[party] === 0 &&
      next.shortfall < current.shortfall - 1e-6;

    if (fewer || trade) {
      current = next;
      keep();
      return true;
    }
    takeBack();
    return false;
  };

  /**
   * Cancels as much as possible of what one failed party owes, round loops
   * that return to it. When value is lost in failure this keeps money from
   * passing through the failed party at all, so more of it survives. Kept
   * only if fewer parties fail or less goes unpaid.
   */
  const absorb = (failedParty: number, throughFailed: boolean): boolean => {
    for (let p = outStart[failedParty]!; p < outStart[failedParty + 1]!; p += 1) {
      const arc = outArcs[p]!;
      if (left[arc]! <= 0) continue;
      cancelAgainst(to[arc]!, failedParty, arc, left[arc]!, throughFailed);
    }
    if (changedArc.length === 0) return false;

    const next = resolve(network, left, cash, settings);
    evaluations += 1;
    if (better(next, current)) {
      current = next;
      keep();
      return true;
    }
    takeBack();
    return false;
  };

  const lossy = settings.cashRecovery < 1 || settings.receivableRecovery < 1;

  let progressing = true;
  while (progressing && evaluations < maxEvaluations) {
    progressing = false;

    // Parties dragged down by someone else, cheapest to save first.
    const dragged: Array<{ party: number; gap: number }> = [];
    for (let i = 0; i < n; i += 1) {
      if (current.wave[i]! >= 2 && certain?.[i] !== 1) {
        dragged.push({ party: i, gap: current.owes[i]! - cash[i]! - current.collects[i]! });
      }
    }
    dragged.sort((a, b) => a.gap - b.gap);

    for (const { party } of dragged) {
      // An earlier move in this pass may already have saved it.
      if (current.wave[party]! < 2) continue;

      let saved = false;
      for (const throughFailed of [false, true]) {
        for (const scale of AMOUNTS_TO_TRY) {
          if (evaluations >= maxEvaluations) break;
          if (shield(party, scale, throughFailed)) {
            saved = true;
            break;
          }
        }
        if (saved) break;
      }
      if (saved) progressing = true;
    }

    // Only once nobody else can be shielded. Done earlier, this uses up the
    // obligations shielding needs to route through and saves fewer parties;
    // done now, it costs nothing and can open the way to another round.
    if (!progressing && lossy) {
      for (let i = 0; i < n; i += 1) {
        if (evaluations >= maxEvaluations) break;
        if (current.wave[i] === 0) continue;
        if (absorb(i, false) || absorb(i, true)) progressing = true;
      }
    }
  }

  const exhausted = evaluations >= maxEvaluations;

  /** Cancels every loop left among the given arcs, keeping it only if nobody is worse off. */
  const cancelLoopsAmong = (arcs: number[]): void => {
    if (arcs.length === 0) return;
    const routed = routeNetDebt(
      n,
      Int32Array.from(arcs, (e) => from[e]!),
      Int32Array.from(arcs, (e) => to[e]!),
      Float64Array.from(arcs, (e) => left[e]!)
    );
    for (let i = 0; i < arcs.length; i += 1) {
      const value = left[arcs[i]!]! - routed.remaining[i]!;
      if (value > 0) cancel(arcs[i]!, value);
    }
    if (changedArc.length === 0) return;

    const next = resolve(network, left, cash, settings);
    evaluations += 1;
    if (next.failures <= current.failures && next.shortfall <= current.shortfall + 1e-6) {
      current = next;
      keep();
    } else {
      takeBack();
    }
  };

  // Loops among parties that all pay in full change nobody's outcome, so
  // cancel as much of them as possible. Done last because the moves above
  // need the same obligations to route through. The outcome is re-checked
  // rather than assumed: the point of this file is not to trust an argument
  // about what a clearing does.
  {
    const arcs: number[] = [];
    for (let e = 0; e < m; e += 1) {
      if (left[e]! > 0 && current.wave[from[e]!] === 0 && current.wave[to[e]!] === 0) arcs.push(e);
    }
    cancelLoopsAmong(arcs);
  }

  // Whatever loops are still open run through a failed party. Cancelling
  // them all clears more debt, and is kept only if it costs nobody anything.
  {
    const arcs: number[] = [];
    for (let e = 0; e < m; e += 1) if (left[e]! > 0) arcs.push(e);
    cancelLoopsAmong(arcs);
  }

  return { amount: left, resolution: current, evaluations, exhausted };
}

/**
 * Finds a cycle clearing that keeps as many parties solvent as it can.
 *
 * Like any cycle clearing, the plan only ever reduces obligations: no net
 * position moves and nobody is handed a counterparty they did not have.
 */
export function rescue(
  obligations: readonly Obligation[],
  cash: ReadonlyMap<string, number>,
  options: RescueOptions = {}
): RescuePlan {
  const network = networkOf(obligations);
  const held = cashOf(network, cash);
  const settings = settingsOf(network, options);
  const n = network.parties.length;

  let gross = 0;
  for (let e = 0; e < network.amount.length; e += 1) gross += network.amount[e]!;

  const asOwed = resolve(network, network.amount, held, settings);

  const maximumLeft = routeNetDebt(n, network.from, network.to, network.amount).remaining;
  const maximum = resolve(network, maximumLeft, held, settings);
  let maximumGross = 0;
  for (let e = 0; e < maximumLeft.length; e += 1) maximumGross += maximumLeft[e]!;

  const certain = certainFailures(network, held, settings);
  const search = searchRescue(network, held, settings, options.maxEvaluations, certain);

  // Maximum clearing is itself a candidate. The search starts from the other
  // end and normally beats it, but nothing guarantees that, so the better of
  // the two is what gets returned.
  const useMaximum = better(maximum, search.resolution);
  const amount = useMaximum ? maximumLeft : search.amount;
  const resolution = useMaximum ? maximum : search.resolution;

  let left = 0;
  for (let e = 0; e < amount.length; e += 1) left += amount[e]!;

  const unavoidable: string[] = [];
  for (let i = 0; i < n; i += 1) if (certain[i] === 1) unavoidable.push(network.parties[i]!);

  return {
    remaining: obligationsOf(network, amount),
    cleared: gross - left,
    outcome: summarise(network, amount, held, resolution),
    asOwed: summarise(network, network.amount, held, asOwed),
    maximum: summarise(network, maximumLeft, held, maximum),
    maximumCleared: gross - maximumGross,
    unavoidable,
    provablyBest: resolution.failures === unavoidable.length,
    evaluations: search.evaluations,
    exhausted: search.exhausted,
  };
}
