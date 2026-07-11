import type { DebtEdge, Settlement } from "../types/api.js";

/**
 * Exact minimum-transfer settlement becomes expensive quickly as the number of
 * non-zero balances grows. Twelve active balances comfortably covers ordinary
 * trips and households while keeping the worst-case search bounded.
 */
export const EXACT_SOLVER_ACTIVE_BALANCE_LIMIT = 12;

export type SolverStrategy = "exact" | "greedy";

export interface SolverOutcome {
  settlements: Settlement[];
  strategy: SolverStrategy;
  exact: boolean;
  activeBalances: number;
}

interface CentBalance {
  userId: string;
  cents: number;
}

interface CentSettlement {
  from: string;
  to: string;
  cents: number;
}

/**
 * Builds net balances in integer cents. The database currently stores amounts
 * as floating-point values, so converting at this boundary prevents rounding
 * noise from changing the solver's decisions.
 */
function getCentBalances(edges: DebtEdge[]): CentBalance[] {
  const balances = new Map<string, number>();

  for (const edge of edges) {
    const cents = Math.round(edge.amount * 100);
    if (cents === 0) continue;

    balances.set(edge.from, (balances.get(edge.from) ?? 0) - cents);
    balances.set(edge.to, (balances.get(edge.to) ?? 0) + cents);
  }

  return [...balances]
    .filter(([, cents]) => cents !== 0)
    .map(([userId, cents]) => ({ userId, cents }))
    .sort((a, b) => a.userId.localeCompare(b.userId));
}

export function getActiveBalanceCount(edges: DebtEdge[]): number {
  return getCentBalances(edges).length;
}

/**
 * Exhaustively tries every maximal debtor/creditor settlement. A non-maximal
 * payment can always be increased until one side is settled without adding a
 * transfer, so searching maximal payments is sufficient to find the true
 * minimum transfer count.
 */
function solveExactly(balances: CentBalance[]): CentSettlement[] {
  const amounts = balances.map((balance) => balance.cents);
  const seenDepth = new Map<string, number>();
  const current: CentSettlement[] = [];
  let best: CentSettlement[] | null = null;

  const search = (): void => {
    if (best && current.length >= best.length) return;

    const index = amounts.findIndex((amount) => amount !== 0);
    if (index === -1) {
      best = current.map((settlement) => ({ ...settlement }));
      return;
    }

    const key = amounts.join(",");
    const previousDepth = seenDepth.get(key);
    if (previousDepth !== undefined && previousDepth <= current.length) return;
    seenDepth.set(key, current.length);

    const sourceAmount = amounts[index];
    const attemptedCounterpartAmounts = new Set<number>();

    for (let counterpart = 0; counterpart < amounts.length; counterpart += 1) {
      const counterpartAmount = amounts[counterpart];
      if (sourceAmount * counterpartAmount >= 0) continue;

      // Equal balances are interchangeable for the purpose of minimizing the
      // number of payments; avoiding duplicates makes the exact search faster.
      if (attemptedCounterpartAmounts.has(counterpartAmount)) continue;
      attemptedCounterpartAmounts.add(counterpartAmount);

      const cents = Math.min(Math.abs(sourceAmount), Math.abs(counterpartAmount));
      const from = sourceAmount < 0 ? balances[index].userId : balances[counterpart].userId;
      const to = sourceAmount < 0 ? balances[counterpart].userId : balances[index].userId;

      const originalSource = amounts[index];
      const originalCounterpart = amounts[counterpart];
      amounts[index] += sourceAmount < 0 ? cents : -cents;
      amounts[counterpart] += counterpartAmount < 0 ? cents : -cents;
      current.push({ from, to, cents });

      search();

      current.pop();
      amounts[index] = originalSource;
      amounts[counterpart] = originalCounterpart;
    }
  };

  search();
  return best ?? [];
}

/**
 * Deterministic, fast fallback for unusually large groups. It preserves every
 * net balance and needs at most N - 1 payments, but it does not claim to be
 * the global minimum number of payments.
 */
function solveGreedily(balances: CentBalance[]): CentSettlement[] {
  const debtors = balances
    .filter((balance) => balance.cents < 0)
    .map((balance) => ({ userId: balance.userId, cents: -balance.cents }));
  const creditors = balances
    .filter((balance) => balance.cents > 0)
    .map((balance) => ({ userId: balance.userId, cents: balance.cents }));
  const settlements: CentSettlement[] = [];

  while (debtors.length > 0 && creditors.length > 0) {
    debtors.sort((a, b) => b.cents - a.cents || a.userId.localeCompare(b.userId));
    creditors.sort((a, b) => b.cents - a.cents || a.userId.localeCompare(b.userId));

    const debtor = debtors[0];
    const creditor = creditors[0];
    const cents = Math.min(debtor.cents, creditor.cents);

    settlements.push({ from: debtor.userId, to: creditor.userId, cents });
    debtor.cents -= cents;
    creditor.cents -= cents;

    if (debtor.cents === 0) debtors.shift();
    if (creditor.cents === 0) creditors.shift();
  }

  return settlements;
}

export function solveDebtSettlements(
  edges: DebtEdge[],
  userNames: Map<string, string>
): SolverOutcome {
  const balances = getCentBalances(edges);
  const activeBalances = balances.length;
  const exact = activeBalances <= EXACT_SOLVER_ACTIVE_BALANCE_LIMIT;
  const centSettlements = exact ? solveExactly(balances) : solveGreedily(balances);

  return {
    settlements: centSettlements.map((settlement) => ({
      from: settlement.from,
      fromName: userNames.get(settlement.from) ?? settlement.from,
      to: settlement.to,
      toName: userNames.get(settlement.to) ?? settlement.to,
      amount: settlement.cents / 100,
    })),
    strategy: exact ? "exact" : "greedy",
    exact,
    activeBalances,
  };
}

/** Backwards-compatible settlement-only API for existing callers and tests. */
export function minimizeDebts(edges: DebtEdge[], userNames: Map<string, string>): Settlement[] {
  return solveDebtSettlements(edges, userNames).settlements;
}
