// ──────────────────────────────────────────────
// Group Detail Page — v2.1 Modernized
// Ledger + Graph + Balances + Actions
// ──────────────────────────────────────────────

import { useState, useCallback } from "react";
import { useParams, Link } from "react-router-dom";
import { useApi } from "../hooks/useApi";
import { useSocket } from "../hooks/useSocket";
import { groupApi, transactionApi, settlementApi } from "../lib/api";
import type { Group, Transaction, GroupBalances, Settlement } from "../types/index";
import { ExpenseModal } from "../components/ExpenseModal";
import { SettleUpModal } from "../components/SettleUpModal";
import { DeleteGroupModal } from "../components/DeleteGroupModal";
import { DebtGraph } from "../components/DebtGraph";
import { useUser } from "../contexts/UserContext";

type ViewMode = "ledger" | "graph";

function getInitials(name: string): string {
  return name.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2);
}

function formatCurrency(amount: number, currencyCode: string = "USD"): string {
  try {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: currencyCode }).format(amount);
  } catch (e) {
    return `$${amount.toFixed(2)}`;
  }
}

export function GroupDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [viewMode, setViewMode] = useState<ViewMode>("ledger");
  const [showExpenseModal, setShowExpenseModal] = useState(false);
  const [showSettleModal, setShowSettleModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [liveSettlements, setLiveSettlements] = useState<Settlement[] | null>(null);
  const { currentUserId } = useUser();

  const { data: group, loading: groupLoading, error: groupError } = useApi<Group>(() => groupApi.get(id!), [id]);
  const { data: transactions, loading: txLoading, refetch: refetchTx } = useApi<Transaction[]>(() => transactionApi.list(id!), [id]);
  const { data: balances, refetch: refetchBalances } = useApi<GroupBalances>(() => settlementApi.get(id!), [id]);

  // Determine the current user's role in this group
  const myMembership = group ? group.members.find(m => m.userId === currentUserId) : null;
  const isAdmin = myMembership?.role === "ADMIN";

  const handleSettlementsUpdate = useCallback(
    (newSettlements: Settlement[]) => {
      setLiveSettlements(newSettlements);
      refetchTx();
      refetchBalances();
    },
    [refetchTx, refetchBalances]
  );

  const { connected, latency } = useSocket(id, handleSettlementsUpdate);

  const currentSettlements = liveSettlements ?? balances?.settlements ?? [];
  const currentBalances = balances?.balances ?? [];

  const handleMutationDone = () => {
    setShowExpenseModal(false);
    setShowSettleModal(false);
    refetchTx();
    refetchBalances();
  };

  const handleUpdateStatus = async (txId: string, status: "COMPLETED" | "REJECTED") => {
    try {
      await transactionApi.updateStatus(id!, txId, status);
      refetchTx();
      refetchBalances();
    } catch (err) {
      console.error("Failed to update status", err);
    }
  };

  if (groupLoading) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="flex flex-col items-center gap-3 animate-pulse">
          <div className="w-12 h-12 rounded-xl bg-surface-variant" />
          <div className="h-3 w-32 rounded bg-surface-variant" />
        </div>
      </div>
    );
  }

  if (groupError || !group) {
    return (
      <div className="h-full flex flex-col items-center justify-center gap-4 animate-fade-in">
        <div className="w-16 h-16 rounded-2xl bg-glow-error flex items-center justify-center">
          <span className="material-symbols-outlined text-error text-[32px]">error</span>
        </div>
        <p className="text-[14px] font-medium text-on-surface">{groupError || "Group not found"}</p>
        <Link to="/" className="btn-secondary">
          <span className="material-symbols-outlined text-[16px]">arrow_back</span>
          Back to Groups
        </Link>
      </div>
    );
  }

  const totalOwed = currentBalances.filter((b) => b.netBalance > 0).reduce((sum, b) => sum + b.netBalance, 0);

  return (
    <div className="h-full flex flex-row overflow-hidden">
      {/* ── Center Panel ──────────────────── */}
      <section className="flex-1 h-full flex flex-col border-r border-outline-variant/30 overflow-hidden min-w-0">
        {/* Header */}
        <header className="h-14 border-b border-outline-variant/30 flex items-center pl-14 md:px-5 pr-5 justify-between bg-surface-container/50 shrink-0">
          <div className="flex items-center gap-3">
            <Link to="/" className="btn-ghost !p-1.5 !h-auto">
              <span className="material-symbols-outlined text-[18px]">arrow_back</span>
            </Link>
            <div>
              <h2 className="text-[14px] font-semibold text-on-surface">{group.name}</h2>
              <p className="text-[11px] text-on-surface-variant">{group.members.length} members • {transactions?.length ?? 0} transactions</p>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-1 bg-surface-variant/50 rounded-lg p-0.5">
            <button
              onClick={() => setViewMode("ledger")}
              className={`h-7 px-3 rounded-md text-[12px] font-medium transition-all duration-150 ${
                viewMode === "ledger"
                  ? "bg-surface-container-high text-on-surface shadow-sm"
                  : "text-on-surface-variant hover:text-on-surface"
              }`}
            >
              Ledger
            </button>
            <button
              onClick={() => setViewMode("graph")}
              className={`h-7 px-3 rounded-md text-[12px] font-medium transition-all duration-150 ${
                viewMode === "graph"
                  ? "bg-surface-container-high text-on-surface shadow-sm"
                  : "text-on-surface-variant hover:text-on-surface"
              }`}
            >
              Graph
            </button>
            </div>
          </div>
        </header>

        {viewMode === "ledger" ? (
          <LedgerView 
            transactions={transactions ?? []} 
            loading={txLoading} 
            currentUserId={currentUserId}
            currency={group.currency}
            onUpdateStatus={handleUpdateStatus}
          />
        ) : (
          <DebtGraph settlements={currentSettlements} members={group.members} currency={group.currency} />
        )}
      </section>

      {/* ── Right Panel ───────────────────── */}
      <aside className="w-[320px] bg-surface-container/30 flex flex-col h-full overflow-y-auto shrink-0">
        {/* Actions */}
        <div className="p-5 flex flex-col gap-3 border-b border-outline-variant/30">
          <button onClick={() => setShowExpenseModal(true)} className="btn-primary w-full">
            <span className="material-symbols-outlined text-[16px]">add</span>
            Add Expense
          </button>
          <button onClick={() => setShowSettleModal(true)} className="btn-secondary w-full">
            <span className="material-symbols-outlined text-[16px]">handshake</span>
            Settle Up
          </button>
        </div>

        {/* Balances */}
        <div className="p-5 flex-1 flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <h3 className="text-section-title">Balances</h3>
          </div>

          {/* Summary Card */}
          <div className="glass-panel-sm p-4 flex flex-col gap-1">
            <span className="text-label text-[10px]">Total in Circulation</span>
            <span className="text-data-lg text-secondary">{formatCurrency(totalOwed)}</span>
            <span className="text-[11px] text-on-surface-variant mt-1">
              {currentSettlements.length} settlement{currentSettlements.length !== 1 ? "s" : ""} needed
            </span>
          </div>

          {/* Individual */}
          <div className="flex flex-col gap-2">
            {currentBalances.map((balance, i) => (
              <div
                key={balance.userId}
                className="flex items-center gap-3 p-3 rounded-lg hover:bg-glass-hover transition-colors"
              >
                <div className={`avatar avatar-sm avatar-${i % 6}`}>
                  {getInitials(balance.name)}
                </div>
                <div className="flex-1 min-w-0">
                  <span className="text-[13px] font-medium text-on-surface truncate block">{balance.name}</span>
                </div>
                <span
                  className={`text-data font-semibold ${
                    balance.netBalance > 0.01
                      ? "text-positive"
                      : balance.netBalance < -0.01
                        ? "text-negative"
                        : "text-neutral"
                  }`}
                >
                  {balance.netBalance > 0.01 ? "+" : ""}{balance.netBalance < -0.01 ? "-" : ""}{formatCurrency(balance.netBalance)}
                </span>
              </div>
            ))}
          </div>

          {/* Settlements Preview */}
          {currentSettlements.length > 0 && (
            <>
              <div className="h-px bg-outline-variant/30 my-1" />
              <h3 className="text-section-title">Optimal Settlements</h3>
              <div className="flex flex-col gap-2">
                {currentSettlements.map((s, i) => (
                  <div key={i} className="flex items-center gap-2 p-2.5 rounded-lg bg-surface-dim text-[12px]">
                    <span className="font-medium text-on-surface">{s.fromName.split(" ")[0]}</span>
                    <span className="material-symbols-outlined text-[14px] text-on-surface-variant">arrow_forward</span>
                    <span className="font-medium text-on-surface">{s.toName.split(" ")[0]}</span>
                    <span className="ml-auto text-data text-secondary font-semibold">{formatCurrency(s.amount, group.currency)}</span>
                  </div>
                ))}
              </div>
            </>
          )}

          {/* Danger Zone — Admin Only */}
          {isAdmin && (
            <div className="mt-4 pt-4 border-t border-error/20 flex flex-col gap-3">
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-error text-[16px]">warning</span>
                <h3 className="text-section-title !text-error">Danger Zone</h3>
              </div>
              <button 
                onClick={() => setShowDeleteModal(true)} 
                className="btn-secondary w-full !border-error/20 !text-error hover:!bg-error hover:!text-white transition-colors"
              >
                <span className="material-symbols-outlined text-[16px]">delete</span>
                Delete Group
              </button>
            </div>
          )}
        </div>

        {/* Status */}
        <div className="p-4 border-t border-outline-variant/30 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2">
            <span className="relative flex h-2 w-2">
              {connected && <span className="animate-sync-ping absolute inline-flex h-full w-full rounded-full bg-secondary opacity-75" />}
              <span className={`relative inline-flex h-2 w-2 rounded-full ${connected ? "bg-secondary" : "bg-outline"}`} />
            </span>
            <span className="text-[11px] text-on-surface-variant font-medium">{connected ? "Live" : "Offline"}</span>
          </div>
          <span className="text-[11px] text-on-surface-variant font-mono">{latency}ms</span>
        </div>
      </aside>

      {showExpenseModal && <ExpenseModal group={group} onClose={() => setShowExpenseModal(false)} onCreated={handleMutationDone} />}
      {showSettleModal && <SettleUpModal group={group} settlements={currentSettlements} onClose={() => setShowSettleModal(false)} onSettled={handleMutationDone} />}
      {showDeleteModal && <DeleteGroupModal group={group} onClose={() => setShowDeleteModal(false)} />}
    </div>
  );
}

// ── Ledger View ──────────────────────────────

interface LedgerViewProps {
  transactions: Transaction[];
  loading: boolean;
  currentUserId: string | null;
  currency: string;
  onUpdateStatus: (txId: string, status: "COMPLETED" | "REJECTED") => void;
}

function LedgerView({ transactions, loading, currentUserId, currency, onUpdateStatus }: LedgerViewProps) {
  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="animate-pulse flex flex-col items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-surface-variant" />
          <div className="h-3 w-28 rounded bg-surface-variant" />
        </div>
      </div>
    );
  }

  if (transactions.length === 0) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-4 animate-fade-in">
        <div className="w-16 h-16 rounded-2xl bg-surface-variant flex items-center justify-center">
          <span className="material-symbols-outlined text-outline text-[32px]">receipt_long</span>
        </div>
        <p className="text-[14px] font-medium text-on-surface">No transactions yet</p>
        <p className="text-[13px] text-on-surface-variant">Add your first expense to get started.</p>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-auto">
      {/* Column Headers */}
      <div className="grid grid-cols-12 gap-4 px-5 py-3 border-b border-outline-variant/30 sticky top-0 bg-surface-dim/80 backdrop-blur-sm z-10">
        <div className="col-span-2 text-label">Date</div>
        <div className="col-span-4 text-label">Description</div>
        <div className="col-span-3 text-label">Paid By</div>
        <div className="col-span-2 text-label text-right">Amount</div>
        <div className="col-span-1 text-label text-right">Split</div>
      </div>

      {/* Rows */}
      <div className="flex flex-col">
        {transactions.map((tx, i) => (
          <div
            key={tx.id}
            className="grid grid-cols-12 gap-4 px-5 py-3 border-b border-outline-variant/20 hover:bg-glass-hover transition-colors animate-slide-up"
            style={{ animationDelay: `${i * 30}ms` }}
          >
            <div className="col-span-2 text-data text-on-surface-variant">
              {new Date(tx.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
            </div>
            <div className="col-span-4 text-[13px] font-medium text-on-surface truncate">
              {tx.description}
            </div>
            <div className="col-span-3 flex items-center gap-2">
              <div className={`avatar avatar-sm avatar-${i % 6} !w-6 !h-6 !text-[9px]`}>
                {getInitials(tx.paidBy.name)}
              </div>
              <span className="text-[13px] text-on-surface truncate">{tx.paidBy.name}</span>
            </div>
            <div className="col-span-2 text-data text-right text-secondary font-semibold">
              {formatCurrency(tx.amount, currency)}
            </div>
            <div className="col-span-1 text-[12px] text-right">
              {tx.status === "PENDING" ? (
                tx.debtShares[0]?.owedById === currentUserId ? (
                  <div className="flex items-center justify-end gap-1">
                    <button onClick={() => onUpdateStatus(tx.id, "COMPLETED")} className="btn-ghost !p-1 text-positive hover:bg-positive/10">
                      <span className="material-symbols-outlined text-[16px]">check</span>
                    </button>
                    <button onClick={() => onUpdateStatus(tx.id, "REJECTED")} className="btn-ghost !p-1 text-error hover:bg-error/10">
                      <span className="material-symbols-outlined text-[16px]">close</span>
                    </button>
                  </div>
                ) : (
                  <span className="text-warning text-[10px] font-semibold tracking-wider">PENDING</span>
                )
              ) : tx.status === "REJECTED" ? (
                <span className="text-error text-[10px] font-semibold tracking-wider">REJECTED</span>
              ) : (
                <span className="text-on-surface-variant">{tx.debtShares.length}</span>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
