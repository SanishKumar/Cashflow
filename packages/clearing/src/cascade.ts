import { networkOf, type Network } from "./network.js";
import type { Obligation } from "./types.js";

/**
 * What happens when someone cannot pay.
 *
 * Clearing is always described with everyone paying in full. This is the
 * other case. Each party has some cash and whatever it manages to collect; if
 * that does not cover what it owes, it fails, pays its creditors pro rata out
 * of what it has, and their collections fall short in turn. The question is
 * where that stops.
 *
 * The answer is a fixed point: a set of payments under which every solvent
 * party pays in full and every failed party pays exactly what it has. This is
 * the Eisenberg–Noe clearing vector, with the Rogers–Veraart extension for
 * value lost in failure. It is found the way the first paper found it:
 * assume everyone pays, see who cannot, solve for what those parties can
 * actually pay, see who that brings down, and repeat until a round adds
 * nobody. Each round is one wave of the cascade, so the order parties fail in
 * falls out for free.
 *
 * A party that fails in the first wave could not have paid even if everyone
 * paid it. No amount of netting changes that, because netting leaves net
 * positions alone. Everyone in a later wave was solvent on paper and was
 * brought down by someone else — and which of them fall depends on which
 * obligations were cancelled first. That dependence is the reason this file
 * exists.
 */

export interface CascadeOptions {
  /**
   * Share of a failed party's own cash that reaches its creditors. Defaults to
   * 1: nothing is lost in failure.
   */
  cashRecovery?: number;
  /**
   * Share of what a failed party collects that reaches its creditors. Defaults
   * to 1. Below 1, money owed to a failed party is partly destroyed on the way
   * through it — collection costs, fire sales, the insolvency process itself.
   */
  receivableRecovery?: number;
  /** Parties that pay nothing at all, whatever they hold or collect. */
  walkedAway?: Iterable<string>;
}

export interface PartyOutcome {
  party: string;
  cash: number;
  /** Total it was due to pay. */
  owes: number;
  /** What it actually pays. */
  pays: number;
  /** Total it was due to collect. */
  owed: number;
  /** What it actually collects. */
  collects: number;
  /**
   * 0 if it pays in full. 1 if it could not have paid even when paid in full
   * itself, or walked away. 2 and up if it was brought down by an earlier wave.
   */
  wave: number;
  failed: boolean;
}

export interface Cascade {
  parties: PartyOutcome[];
  /** Everyone who fails, earliest wave first. */
  failed: string[];
  /** The same parties grouped by the wave they fail in. */
  waves: string[][];
  /** Obligation value that is never paid. */
  shortfall: number;
  /** Total obligation value in the network. */
  owed: number;
  /**
   * False only if the payments of a very large failed group had not settled
   * when the iteration limit was reached. Failures may then be undercounted.
   */
  converged: boolean;
}

/** The inner result, in arrays, for callers that evaluate many variations. */
export interface Resolution {
  owes: Float64Array;
  pays: Float64Array;
  collects: Float64Array;
  /** 0 for solvent parties, otherwise the wave the party failed in. */
  wave: Int32Array;
  failures: number;
  waves: number;
  shortfall: number;
  converged: boolean;
}

export interface ResolveSettings {
  cashRecovery: number;
  receivableRecovery: number;
  /** 1 for parties that pay nothing regardless. */
  walkedAway?: Uint8Array;
}

/** Past this many failed parties the exact linear solve is too slow to be the fallback. */
const DENSE_LIMIT = 400;
const QUICK_SWEEPS = 60;
const SWEEP_LIMIT = 5_000;
const SETTLED = 1e-13;

/**
 * Solves for what a fixed set of failed parties can pay, exactly.
 *
 * With the failed set held fixed the payments are linear in each other: each
 * failed party pays out its recovered cash plus a share of what it collects,
 * and what it collects from other failed parties depends on what they pay.
 * Returns false if the system is singular, which only happens for a closed
 * ring of failed parties with nothing leaving it.
 */
function solveFailedExactly(
  network: Network,
  amount: Float64Array,
  cash: Float64Array,
  owes: Float64Array,
  ratio: Float64Array,
  failedList: readonly number[],
  position: Int32Array,
  settings: ResolveSettings
): boolean {
  const k = failedList.length;
  const width = k + 1;
  const matrix = new Float64Array(k * width);

  for (let row = 0; row < k; row += 1) {
    const i = failedList[row]!;
    matrix[row * width + row] = 1;
    let fixed = settings.cashRecovery * cash[i]!;

    for (let p = network.inStart[i]!; p < network.inStart[i + 1]!; p += 1) {
      const e = network.inArcs[p]!;
      const j = network.from[e]!;
      const column = position[j]!;
      if (column === -1) {
        fixed += settings.receivableRecovery * amount[e]! * ratio[j]!;
      } else {
        // Party j pays this arc its share of whatever j pays in total.
        const cell = row * width + column;
        matrix[cell] = matrix[cell]! - (settings.receivableRecovery * amount[e]!) / owes[j]!;
      }
    }
    matrix[row * width + k] = fixed;
  }

  for (let column = 0; column < k; column += 1) {
    let pivot = column;
    let largest = Math.abs(matrix[column * width + column]!);
    for (let row = column + 1; row < k; row += 1) {
      const size = Math.abs(matrix[row * width + column]!);
      if (size > largest) {
        largest = size;
        pivot = row;
      }
    }
    if (largest < 1e-12) return false;

    if (pivot !== column) {
      for (let c = column; c < width; c += 1) {
        const held = matrix[column * width + c]!;
        matrix[column * width + c] = matrix[pivot * width + c]!;
        matrix[pivot * width + c] = held;
      }
    }

    const diagonal = matrix[column * width + column]!;
    for (let row = column + 1; row < k; row += 1) {
      const factor = matrix[row * width + column]! / diagonal;
      if (factor === 0) continue;
      for (let c = column; c < width; c += 1) {
        matrix[row * width + c] = matrix[row * width + c]! - factor * matrix[column * width + c]!;
      }
    }
  }

  const paid = new Float64Array(k);
  for (let row = k - 1; row >= 0; row -= 1) {
    let value = matrix[row * width + k]!;
    for (let c = row + 1; c < k; c += 1) value -= matrix[row * width + c]! * paid[c]!;
    paid[row] = value / matrix[row * width + row]!;
  }

  for (let row = 0; row < k; row += 1) {
    const i = failedList[row]!;
    ratio[i] = Math.max(0, Math.min(1, paid[row]! / owes[i]!));
  }
  return true;
}

/**
 * Resolves a network for a given set of amounts. `amount` is passed separately
 * from the network so the same structure can be re-resolved after clearing.
 */
export function resolve(
  network: Network,
  amount: Float64Array,
  cash: Float64Array,
  settings: ResolveSettings
): Resolution {
  const n = network.parties.length;
  const m = amount.length;
  const { from, to } = network;

  const owes = new Float64Array(n);
  for (let e = 0; e < m; e += 1) owes[from[e]!] = owes[from[e]!]! + amount[e]!;

  // Share of its obligations each party pays. Starts with everyone paying in
  // full and only ever falls, which is what makes the result the largest
  // consistent set of payments rather than merely a consistent one.
  const ratio = new Float64Array(n).fill(1);
  const wave = new Int32Array(n);
  const collects = new Float64Array(n);
  const position = new Int32Array(n).fill(-1);
  const failedList: number[] = [];
  let walkers = 0;
  let converged = true;

  // Walking away belongs to the first wave, but its effect is held back until
  // that wave has been counted. Otherwise a party sunk by the walk-away would
  // be recorded as unable to pay in its own right.
  if (settings.walkedAway) {
    for (let i = 0; i < n; i += 1) {
      if (settings.walkedAway[i] === 1 && owes[i]! > 0) {
        wave[i] = 1;
        walkers += 1;
      }
    }
  }

  let round = 0;
  for (;;) {
    round += 1;
    if (round === 2 && walkers > 0) {
      for (let i = 0; i < n; i += 1) {
        if (settings.walkedAway![i] === 1 && wave[i] === 1) ratio[i] = 0;
      }
    }

    collects.fill(0);
    for (let e = 0; e < m; e += 1) {
      collects[to[e]!] = collects[to[e]!]! + amount[e]! * ratio[from[e]!]!;
    }

    let added = 0;
    for (let i = 0; i < n; i += 1) {
      if (wave[i] !== 0) continue;
      const due = owes[i]!;
      // Amounts are whole numbers, so a party exactly able to pay is solvent.
      // The margin only absorbs rounding in ratios further up the chain.
      if (cash[i]! + collects[i]! < due - 1e-9 * (due + 1)) {
        wave[i] = round;
        position[i] = failedList.length;
        failedList.push(i);
        added += 1;
      }
    }
    if (added === 0 && !(round === 1 && walkers > 0)) break;

    // What the failed parties can pay, given that they are the failed ones.
    // Sweeping in place converges from above; most networks settle in a
    // handful of passes because failed parties mostly owe solvent ones.
    let settledDown = false;
    const sweep = (limit: number): void => {
      for (let pass = 0; pass < limit; pass += 1) {
        let moved = 0;
        for (const i of failedList) {
          let collected = 0;
          for (let p = network.inStart[i]!; p < network.inStart[i + 1]!; p += 1) {
            const e = network.inArcs[p]!;
            collected += amount[e]! * ratio[from[e]!]!;
          }
          const able =
            settings.cashRecovery * cash[i]! + settings.receivableRecovery * collected;
          const share = Math.min(1, able / owes[i]!);
          const change = ratio[i]! - share;
          if (change > moved) moved = change;
          ratio[i] = share;
        }
        if (moved < SETTLED) {
          settledDown = true;
          return;
        }
      }
    };

    sweep(QUICK_SWEEPS);
    if (!settledDown) {
      // A tight ring of failed parties paying mostly each other converges
      // slowly by sweeping. Small enough, it is solved outright instead.
      const exact =
        failedList.length <= DENSE_LIMIT &&
        solveFailedExactly(network, amount, cash, owes, ratio, failedList, position, settings);
      if (!exact) {
        sweep(SWEEP_LIMIT);
        if (!settledDown) converged = false;
      }
    }
  }

  const pays = new Float64Array(n);
  let shortfall = 0;
  let waves = 0;
  for (let i = 0; i < n; i += 1) {
    pays[i] = owes[i]! * ratio[i]!;
    shortfall += owes[i]! - pays[i]!;
    if (wave[i]! > waves) waves = wave[i]!;
  }

  return {
    owes,
    pays,
    collects,
    wave,
    failures: failedList.length + walkers,
    waves,
    shortfall,
    converged,
  };
}

/** Reads recovery rates out of options, rejecting anything outside 0..1. */
export function settingsOf(network: Network, options: CascadeOptions): ResolveSettings {
  const cashRecovery = options.cashRecovery ?? 1;
  const receivableRecovery = options.receivableRecovery ?? 1;
  for (const [name, value] of [
    ["cashRecovery", cashRecovery],
    ["receivableRecovery", receivableRecovery],
  ] as const) {
    if (!(value >= 0 && value <= 1)) {
      throw new RangeError(`${name} must be between 0 and 1, received ${value}`);
    }
  }

  let walkedAway: Uint8Array | undefined;
  if (options.walkedAway) {
    walkedAway = new Uint8Array(network.parties.length);
    for (const party of options.walkedAway) {
      const at = network.index.get(party);
      if (at !== undefined) walkedAway[at] = 1;
    }
  }

  return { cashRecovery, receivableRecovery, walkedAway };
}

/** Cash per party as an array. A party with no entry holds nothing. */
export function cashOf(network: Network, cash: ReadonlyMap<string, number>): Float64Array {
  const held = new Float64Array(network.parties.length);
  for (let i = 0; i < held.length; i += 1) {
    const value = cash.get(network.parties[i]!) ?? 0;
    if (!(value >= 0)) {
      throw new RangeError(`Cash for ${network.parties[i]} must not be negative, received ${value}`);
    }
    held[i] = value;
  }
  return held;
}

/** Names the parties in a resolution. `amount` must be the amounts that were resolved. */
export function summarise(
  network: Network,
  amount: Float64Array,
  cash: Float64Array,
  resolution: Resolution
): Cascade {
  const n = network.parties.length;
  const owed = new Float64Array(n);
  for (let e = 0; e < amount.length; e += 1) {
    owed[network.to[e]!] = owed[network.to[e]!]! + amount[e]!;
  }

  const parties: PartyOutcome[] = [];
  const waves: string[][] = [];
  let total = 0;

  for (let i = 0; i < n; i += 1) {
    const wave = resolution.wave[i]!;
    parties.push({
      party: network.parties[i]!,
      cash: cash[i]!,
      owes: resolution.owes[i]!,
      pays: resolution.pays[i]!,
      owed: owed[i]!,
      collects: resolution.collects[i]!,
      wave,
      failed: wave !== 0,
    });
    total += resolution.owes[i]!;
    if (wave !== 0) (waves[wave - 1] ??= []).push(network.parties[i]!);
  }

  // A wave number can be skipped only if nobody failed in it, which the
  // fixed-point loop never produces, but a hole would break callers that
  // index into this.
  for (let w = 0; w < waves.length; w += 1) waves[w] ??= [];

  return {
    parties,
    failed: waves.flat(),
    waves,
    shortfall: resolution.shortfall,
    owed: total,
    converged: resolution.converged,
  };
}

/**
 * Who fails, in what order, and who ends up paid what.
 *
 * `cash` is what each party can put toward its obligations besides what it
 * collects. A party with no entry holds nothing; `Infinity` marks one that can
 * always pay.
 */
export function cascade(
  obligations: readonly Obligation[],
  cash: ReadonlyMap<string, number>,
  options: CascadeOptions = {}
): Cascade {
  const network = networkOf(obligations);
  const held = cashOf(network, cash);
  const resolution = resolve(network, network.amount, held, settingsOf(network, options));

  return summarise(network, network.amount, held, resolution);
}
