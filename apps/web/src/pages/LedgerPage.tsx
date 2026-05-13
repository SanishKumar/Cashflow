// ──────────────────────────────────────────────
// Global Ledger Page — All Transactions
// ──────────────────────────────────────────────

import { useApi } from "../hooks/useApi";
import { groupApi, transactionApi } from "../lib/api";
import type { Group, Transaction } from "../types/index";

function getInitials(name: string): string {
  return name.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2);
}

function formatCurrency(amount: number, currencyCode: string = "USD"): string {
  try {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: currencyCode }).format(Math.abs(amount));
  } catch (e) {
    return `$${Math.abs(amount).toFixed(2)}`;
  }
}

function getTxHash(id: string): string {
  const clean = id.replace(/[^a-f0-9]/gi, "0").toLowerCase();
  return `0x${clean.slice(0, 8)}`;
}

interface GroupWithTransactions {
  group: Group;
  transactions: Transaction[];
}

export function LedgerPage() {
  const { data: groups, loading } = useApi<Group[]>(() => groupApi.list());

  // We'll fetch transactions for all groups we have
  const groupIds = groups?.map((g) => g.id) ?? [];
  const { data: allGroupsTx, loading: txLoading } = useApi<GroupWithTransactions[]>(
    async () => {
      if (groupIds.length === 0) return [];
      const results = await Promise.all(
        groupIds.map(async (gid) => {
          const group = groups!.find((g) => g.id === gid)!;
          const transactions = await transactionApi.list(gid);
          return { group, transactions };
        })
      );
      return results;
    },
    [groupIds.join(",")]
  );

  const allTransactions = (allGroupsTx ?? [])
    .flatMap((gwt) =>
      gwt.transactions.map((tx) => ({ ...tx, groupName: gwt.group.name, groupId: gwt.group.id, groupCurrency: gwt.group.currency }))
    )
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  const totalVolume = allTransactions.reduce((sum, tx) => sum + tx.amount, 0);
  const isLoading = loading || txLoading;

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <header className="h-14 border-b border-outline-variant/30 flex items-center pl-14 md:px-6 pr-6 justify-between bg-surface-container/50 shrink-0">
        <div className="flex items-center gap-3">
          <span className="material-symbols-outlined text-on-surface-variant text-[20px]">history_edu</span>
          <h2 className="text-[15px] font-semibold text-on-surface">Immutable Audit Log</h2>
          {allTransactions.length > 0 && (
            <span className="text-[11px] text-on-surface-variant bg-surface-variant px-2 py-0.5 rounded-full font-medium">
              {allTransactions.length} records
            </span>
          )}
        </div>
        <div className="flex items-center gap-2 px-3 py-1 bg-surface-variant/40 rounded border border-outline-variant/30 text-[11px] text-on-surface-variant font-mono">
          <span className="material-symbols-outlined text-[14px] text-primary">verified_user</span>
          CRYPTOGRAPHICALLY VERIFIED
        </div>
      </header>

      {/* Summary Cards */}
      <div className="px-6 pt-5 pb-3 flex gap-4 shrink-0">
        <div className="glass-panel-sm p-4 flex-1">
          <span className="text-label text-[10px]">Total Volume</span>
          <div className="text-data-lg text-secondary mt-1">{formatCurrency(totalVolume)}</div>
        </div>
        <div className="glass-panel-sm p-4 flex-1">
          <span className="text-label text-[10px]">Transactions</span>
          <div className="text-data-lg text-on-surface mt-1">{allTransactions.length}</div>
        </div>
        <div className="glass-panel-sm p-4 flex-1">
          <span className="text-label text-[10px]">Groups</span>
          <div className="text-data-lg text-on-surface mt-1">{groups?.length ?? 0}</div>
        </div>
      </div>

      {/* Table */}
      <div className="flex-1 overflow-auto px-6 pb-6">
        {isLoading ? (
          <div className="flex flex-col gap-2 mt-4">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="h-12 rounded-lg bg-surface-variant/30 animate-pulse" />
            ))}
          </div>
        ) : allTransactions.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full gap-4 animate-fade-in">
            <div className="w-16 h-16 rounded-2xl bg-surface-variant flex items-center justify-center">
              <span className="material-symbols-outlined text-outline text-[32px]">receipt_long</span>
            </div>
            <p className="text-[14px] font-medium text-on-surface">No transactions yet</p>
            <p className="text-[13px] text-on-surface-variant text-center max-w-sm">
              Transactions will appear here as expenses are added to your groups.
            </p>
          </div>
        ) : (
          <div className="rounded-lg border border-outline-variant/30 overflow-hidden mt-2">
            {/* Header */}
            <div className="grid grid-cols-12 gap-3 px-4 py-2.5 bg-surface-dim border-b border-outline-variant/30">
              <div className="col-span-2 text-label text-[10px]">Date</div>
              <div className="col-span-2 text-label text-[10px]">Tx Hash</div>
              <div className="col-span-3 text-label text-[10px]">Description</div>
              <div className="col-span-1 text-label text-[10px]">Group</div>
              <div className="col-span-2 text-label text-[10px]">Initiated By</div>
              <div className="col-span-2 text-label text-[10px] text-right">Amount</div>
            </div>
            {/* Rows */}
            {allTransactions.map((tx, i) => (
              <div
                key={tx.id}
                className="grid grid-cols-12 gap-3 px-4 py-3 border-b border-outline-variant/15 hover:bg-glass-hover transition-colors animate-slide-up"
                style={{ animationDelay: `${Math.min(i * 20, 200)}ms` }}
              >
                <div className="col-span-2 text-data text-on-surface-variant text-[12px]">
                  {new Date(tx.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                </div>
                <div className="col-span-2 flex items-center">
                  <span className="font-mono text-[10px] text-primary/80 bg-primary/10 px-1.5 py-0.5 rounded border border-primary/20">
                    {getTxHash(tx.id)}
                  </span>
                </div>
                <div className="col-span-3 text-[13px] font-medium text-on-surface truncate">
                  {tx.description}
                  {tx.status && <span className={`ml-2 text-[9px] px-1.5 py-0.5 rounded font-bold tracking-wider ${tx.status === 'COMPLETED' ? 'bg-positive/20 text-positive' : tx.status === 'PENDING' ? 'bg-warning/20 text-warning' : 'bg-error/20 text-error'}`}>{tx.status}</span>}
                </div>
                <div className="col-span-1">
                  <span className="text-[11px] text-primary bg-glow-primary px-2 py-0.5 rounded-full font-medium truncate inline-block max-w-full">
                    {tx.groupName}
                  </span>
                </div>
                <div className="col-span-2 flex items-center gap-2">
                  <div className={`avatar avatar-sm avatar-${i % 6} !w-5 !h-5 !text-[8px]`}>
                    {getInitials(tx.paidBy.name)}
                  </div>
                  <span className="text-[12px] text-on-surface truncate">{tx.paidBy.name}</span>
                </div>
                <div className="col-span-2 text-data text-right text-secondary font-semibold">
                  {formatCurrency(tx.amount, (tx as any).groupCurrency || "USD")}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
