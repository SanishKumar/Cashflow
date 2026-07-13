// ──────────────────────────────────────────────
// Global Ledger Page — Transactions + Audit Log
// ──────────────────────────────────────────────

import { useSearchParams } from "react-router-dom";
import { useApi } from "../hooks/useApi";
import { groupApi, transactionApi, auditLogApi } from "../lib/api";
import type { Group, Transaction, AuditLogEntry } from "../types/index";

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

const ACTION_ICONS: Record<string, { icon: string; color: string }> = {
  GROUP_CREATED: { icon: "group_add", color: "text-primary" },
  GROUP_DELETED: { icon: "delete_forever", color: "text-error" },
  MEMBER_ADDED: { icon: "person_add", color: "text-secondary" },
  MEMBER_REMOVED: { icon: "person_remove", color: "text-warning" },
  MEMBER_LEFT: { icon: "exit_to_app", color: "text-on-surface-variant" },
  EXPENSE_ADDED: { icon: "receipt", color: "text-positive" },
  EXPENSE_DELETED: { icon: "receipt_long", color: "text-error" },
  TRANSACTION_COMPLETED: { icon: "check_circle", color: "text-positive" },
  TRANSACTION_PENDING: { icon: "schedule", color: "text-warning" },
  TRANSACTION_REJECTED: { icon: "cancel", color: "text-error" },
  SETTLEMENT_SENT: { icon: "outgoing_mail", color: "text-warning" },
  SETTLEMENT_CONFIRMED: { icon: "task_alt", color: "text-positive" },
  SETTLEMENT_REJECTED: { icon: "cancel", color: "text-error" },
  SETTLEMENT_CANCELLED: { icon: "block", color: "text-on-surface-variant" },
};

interface GroupWithTransactions {
  group: Group;
  transactions: Transaction[];
}

type Tab = "transactions" | "audit";

export function LedgerPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const tab: Tab = searchParams.get("tab") === "activity" ? "audit" : "transactions";
  const { data: groups, loading } = useApi<Group[]>(() => groupApi.list());

  const selectTab = (nextTab: Tab) => {
    const nextParams = new URLSearchParams(searchParams);
    if (nextTab === "audit") nextParams.set("tab", "activity");
    else nextParams.delete("tab");
    setSearchParams(nextParams, { replace: true });
  };

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

  const { data: auditData, loading: auditLoading } = useApi<{ items: AuditLogEntry[]; total: number; page: number; totalPages: number; }>(
    () => auditLogApi.list()
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
      <header className="flex shrink-0 flex-col gap-3 px-4 pb-2 pt-3 md:gap-4 md:px-8 md:pb-4 md:pt-7">
        <div>
          <p className="mb-1 hidden text-[10px] font-bold uppercase tracking-[0.14em] text-primary md:block">Your records</p>
          <h2 className="text-[22px] font-bold tracking-tight text-on-surface md:text-[24px]">Ledger & activity</h2>
          <p className="mt-0.5 max-w-xl text-[11px] leading-relaxed text-on-surface-variant md:mt-1 md:text-[12px]">Every expense, status change, and group update in one timeline.</p>
          {allTransactions.length > 0 && (
            <span className="mt-1.5 inline-flex rounded-full bg-primary/10 px-2.5 py-1 text-[10px] font-bold text-primary md:mt-2">
              {allTransactions.length} records
            </span>
          )}
        </div>
        <div className="flex items-center gap-3 w-full md:w-auto">
          <div className="flex items-center gap-1 bg-surface-variant/50 rounded-lg p-0.5 w-full md:w-auto">
            <button
              onClick={() => selectTab("transactions")}
              className={`h-8 md:h-7 flex-1 md:flex-none px-3 rounded-md text-[12px] font-medium transition-all duration-150 ${
                tab === "transactions"
                  ? "bg-surface-container-high text-on-surface shadow-sm"
                  : "text-on-surface-variant hover:text-on-surface"
              }`}
            >
              Transactions
            </button>
            <button
              onClick={() => selectTab("audit")}
              className={`h-8 md:h-7 flex-1 md:flex-none px-3 rounded-md text-[12px] font-medium transition-all duration-150 ${
                tab === "audit"
                  ? "bg-surface-container-high text-on-surface shadow-sm"
                  : "text-on-surface-variant hover:text-on-surface"
              }`}
            >
              Activity
            </button>
          </div>
        </div>
      </header>

      {/* Summary Cards */}
      <div className="grid shrink-0 grid-cols-3 gap-2 px-4 pb-3 md:gap-4 md:px-8 md:pb-5">
        <div className="min-w-0 rounded-2xl border border-outline-variant/70 bg-surface-container p-3 shadow-[0_8px_20px_rgba(31,35,54,0.04)] md:p-3.5">
          <span className="text-[10px] font-semibold text-on-surface-variant"><span className="md:hidden">Tracked</span><span className="hidden md:inline">Tracked spending</span></span>
          <div className="mt-1 whitespace-nowrap text-[clamp(0.94rem,4.4vw,1.25rem)] font-bold leading-none tracking-tight tabular-nums text-secondary">{formatCurrency(totalVolume)}</div>
        </div>
        <div className="min-w-0 rounded-2xl border border-outline-variant/70 bg-surface-container p-3 shadow-[0_8px_20px_rgba(31,35,54,0.04)] md:p-3.5">
          <span className="text-[10px] font-semibold text-on-surface-variant">Expenses</span>
          <div className="mt-1 text-[20px] font-bold leading-none tracking-tight text-on-surface">{allTransactions.length}</div>
        </div>
        <div className="min-w-0 rounded-2xl border border-outline-variant/70 bg-surface-container p-3 shadow-[0_8px_20px_rgba(31,35,54,0.04)] md:p-3.5">
          <span className="text-[10px] font-semibold text-on-surface-variant">Groups</span>
          <div className="mt-1 text-[20px] font-bold leading-none tracking-tight text-on-surface">{groups?.length ?? 0}</div>
        </div>
      </div>

      {/* Content */}
      <div className="mobile-scroll-safe flex-1 overflow-auto px-4 pb-6 md:px-8 md:pb-8">
        {tab === "transactions" ? (
          <TransactionsView transactions={allTransactions} loading={isLoading} />
        ) : (
          <AuditLogView logs={auditData?.items ?? []} loading={auditLoading} />
        )}
      </div>
    </div>
  );
}

// ── Transactions View ──────────────────────────

function TransactionsView({ transactions, loading }: { transactions: (Transaction & { groupName: string; groupCurrency: string })[]; loading: boolean }) {
  if (loading) {
    return (
      <div className="flex flex-col gap-2 mt-4">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="h-12 rounded-lg bg-surface-variant/30 animate-pulse" />
        ))}
      </div>
    );
  }

  if (transactions.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4 animate-fade-in">
        <div className="w-16 h-16 rounded-2xl bg-surface-variant flex items-center justify-center">
          <span className="material-symbols-outlined text-outline text-[32px]">receipt_long</span>
        </div>
        <p className="text-[14px] font-medium text-on-surface">No transactions yet</p>
        <p className="text-[13px] text-on-surface-variant text-center max-w-sm">
          Transactions will appear here as expenses are added to your groups.
        </p>
      </div>
    );
  }

  return (
    <>
    <div className="hidden md:block rounded-lg border border-outline-variant/30 overflow-hidden mt-2">
      <div className="grid grid-cols-12 gap-3 px-4 py-2.5 bg-surface-dim border-b border-outline-variant/30">
        <div className="col-span-2 text-label text-[10px]">Date</div>
        <div className="col-span-4 text-label text-[10px]">Description</div>
        <div className="col-span-2 text-label text-[10px]">Group</div>
        <div className="col-span-2 text-label text-[10px]">Initiated By</div>
        <div className="col-span-2 text-label text-[10px] text-right">Amount</div>
      </div>
      {transactions.map((tx, i) => (
        <div
          key={tx.id}
          className="grid grid-cols-12 gap-3 px-4 py-3 border-b border-outline-variant/15 hover:bg-glass-hover transition-colors animate-slide-up"
          style={{ animationDelay: `${Math.min(i * 20, 200)}ms` }}
        >
          <div className="col-span-2 text-data text-on-surface-variant text-[12px]">
            {new Date(tx.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
          </div>
          <div className="col-span-4 text-[13px] font-medium text-on-surface truncate">
            {tx.description}
            {tx.status && <span className={`ml-2 text-[9px] px-1.5 py-0.5 rounded font-bold tracking-wider ${tx.status === 'COMPLETED' ? 'bg-positive/20 text-positive' : tx.status === 'PENDING' ? 'bg-warning/20 text-warning' : 'bg-error/20 text-error'}`}>{tx.status}</span>}
          </div>
          <div className="col-span-2">
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
            {formatCurrency(tx.amount, tx.groupCurrency || "USD")}
          </div>
        </div>
      ))}
    </div>
    <div className="md:hidden mt-1 flex flex-col gap-2">
      {transactions.map((tx, i) => (
        <article
          key={tx.id}
          className="min-w-0 rounded-2xl border border-outline-variant/70 bg-surface-container p-3 shadow-[0_6px_16px_rgba(31,35,54,0.035)] animate-slide-up"
          style={{ animationDelay: `${Math.min(i * 20, 200)}ms` }}
        >
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="truncate text-[13px] font-bold leading-snug text-on-surface">
                {tx.description}
              </p>
              <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                {tx.status && (
                  <span className={`text-[9px] px-1.5 py-0.5 rounded font-bold tracking-wider ${tx.status === 'COMPLETED' ? 'bg-positive/20 text-positive' : tx.status === 'PENDING' ? 'bg-warning/20 text-warning' : 'bg-error/20 text-error'}`}>
                    {tx.status}
                  </span>
                )}
                <span className="text-[10px] text-primary bg-glow-primary px-2 py-0.5 rounded-full font-medium">
                  {tx.groupName}
                </span>
              </div>
            </div>
            <div className="shrink-0 whitespace-nowrap text-[14px] font-bold tabular-nums text-secondary">
              {formatCurrency(tx.amount, tx.groupCurrency || "USD")}
            </div>
          </div>

          <div className="mt-2 flex min-w-0 items-center justify-between gap-3 border-t border-outline-variant/50 pt-2 text-[10px] text-on-surface-variant">
            <div className="flex min-w-0 items-center gap-1.5">
              <span className={`avatar avatar-sm avatar-${i % 6} !h-5 !w-5 !text-[8px]`}>{getInitials(tx.paidBy.name)}</span>
              <span className="truncate">{tx.paidBy.name}</span>
            </div>
            <time className="shrink-0 font-medium tabular-nums">{new Date(tx.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}</time>
          </div>
        </article>
      ))}
    </div>
    </>
  );
}

// ── Audit Log View ──────────────────────────────

function AuditLogView({ logs, loading }: { logs: AuditLogEntry[]; loading: boolean }) {
  if (loading) {
    return (
      <div className="flex flex-col gap-2 mt-4">
        {[1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="h-14 rounded-lg bg-surface-variant/30 animate-pulse" />
        ))}
      </div>
    );
  }

  if (logs.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4 animate-fade-in">
        <div className="w-16 h-16 rounded-2xl bg-surface-variant flex items-center justify-center">
          <span className="material-symbols-outlined text-outline text-[32px]">history</span>
        </div>
        <p className="text-[14px] font-medium text-on-surface">No activity yet</p>
        <p className="text-[13px] text-on-surface-variant text-center max-w-sm">
          Actions like creating groups, adding expenses, and approving settlements will appear here.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-1 mt-2">
      {logs.map((log, i) => {
        const actionMeta = ACTION_ICONS[log.action] ?? { icon: "info", color: "text-on-surface-variant" };
        return (
          <div
            key={log.id}
            className="flex items-start gap-3 p-3 rounded-lg hover:bg-glass-hover transition-colors animate-slide-up"
            style={{ animationDelay: `${Math.min(i * 20, 200)}ms` }}
          >
            {/* Icon */}
            <div className="w-8 h-8 rounded-lg bg-surface-variant flex items-center justify-center shrink-0 mt-0.5">
              <span className={`material-symbols-outlined text-[16px] ${actionMeta.color}`}>
                {actionMeta.icon}
              </span>
            </div>

            {/* Content */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-[13px] font-semibold text-on-surface">{log.user.name}</span>
                <span className="text-[12px] text-on-surface-variant">{log.details || log.action.replace(/_/g, " ").toLowerCase()}</span>
              </div>
              <div className="flex items-center gap-2 mt-1">
                <span className="text-[10px] text-on-surface-variant font-mono">
                  {new Date(log.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                </span>
                {log.group && (
                  <span className="text-[10px] text-primary bg-primary/10 px-1.5 py-0.5 rounded-full font-medium">
                    {log.group.name}
                  </span>
                )}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
