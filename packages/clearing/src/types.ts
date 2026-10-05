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

/**
 * Which exact method finds the loops. All three reach the same optimum; they
 * differ in how far they scale and in what they hand back.
 */
export type ClearingSolver =
  /**
   * Saturate cycles, then cancel negative cycles until none remain. The
   * reference method, and the default. Comfortable up to a few thousand
   * obligations.
   */
  | "cancelling"
  /**
   * Route net debt along the shortest chains of existing obligations. The
   * fastest of the three, built for national-round sizes, and it returns a
   * certificate.
   */
  | "routing"
  /** Network simplex on the circulation directly. Also returns a certificate. */
  | "simplex";

export interface ClearingOptions {
  mode: ClearingMode;
  /** Defaults to "cancelling". Use "routing" beyond a few thousand obligations. */
  solver?: ClearingSolver;
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

/**
 * Proof that a cycle clearing is maximal: one number per party.
 *
 * With these, anyone holding the original obligations and the result can
 * confirm in a single pass that no further loop could have been cancelled,
 * without re-running the solver or trusting whoever did. See `verifyClearing`.
 */
export interface ClearingCertificate {
  /** Party name and dual value, one pair per party. */
  potential: Array<[party: string, value: number]>;
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
  /**
   * Present for "cycles" mode solved by "routing" or "simplex". Path
   * compensation needs none: reaching `grossFloor` is its own proof.
   */
  certificate?: ClearingCertificate;
}
