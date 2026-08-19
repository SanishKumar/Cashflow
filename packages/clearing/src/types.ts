/**
 * An outstanding obligation: `from` owes `to` this much.
 *
 * Amounts are integer minor units (paise, cents). Clearing repeatedly adds and
 * subtracts these values, so anything less exact than an integer would let
 * rounding error accumulate into the settlement instructions themselves.
 */
export interface Obligation {
  from: string;
  to: string;
  amount: number;
}

/** How far a clearing run is permitted to go. */
export type ClearingMode =
  /**
   * Cancel obligations only where they form a closed loop. Every party's net
   * position is untouched and no party is ever handed a counterparty they did
   * not already deal with — the set of people you owe can only shrink.
   */
  | "cycles"
  /**
   * Additionally shorten open chains, which lowers the outstanding total much
   * further but can route a debt through to someone you never transacted with.
   */
  | "paths";

export interface ClearingOptions {
  mode: ClearingMode;
  /**
   * In "paths" mode, prefer chain reductions that reuse an existing pair over
   * ones that introduce a new counterparty. Costs nothing in cleared value and
   * keeps new exposure down.
   */
  preferExistingPairs?: boolean;
  /**
   * Pairs that may never be created by path compensation, as `${from}|${to}`.
   * Lets a party refuse exposure to someone specific without opting out of
   * clearing entirely.
   */
  forbiddenPairs?: ReadonlySet<string>;
  /** Safety valve for pathological graphs. Reported back in the result. */
  maxIterations?: number;
}

export interface ClearingMetrics {
  /** Total obligation value before clearing. */
  grossBefore: number;
  /** Total obligation value after clearing. */
  grossAfter: number;
  /** Value removed. `grossBefore - grossAfter`. */
  cleared: number;
  /** Share of the original total removed, 0–1. */
  clearedRatio: number;
  /**
   * The lowest gross total any net-preserving method can reach: the sum of all
   * positive net positions. Cash still has to move for this much.
   */
  grossFloor: number;
  obligationsBefore: number;
  obligationsAfter: number;
  /** Ordered pairs that did not exist before this run created them. */
  newPairs: string[];
  /** True when no party gained a counterparty. Always true in "cycles" mode. */
  noNewCounterparties: boolean;
}

export interface ClearingResult {
  mode: ClearingMode;
  /** What remains to be paid once clearing is applied. */
  remaining: Obligation[];
  metrics: ClearingMetrics;
  /**
   * False when the run stopped on `maxIterations` rather than because no
   * further reduction existed. The result is still valid and net-preserving,
   * just not proven maximal.
   */
  optimal: boolean;
  iterations: number;
}
