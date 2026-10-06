// ──────────────────────────────────────────────
// Group Detail Page
// Ledger + Graph + Balances + Actions
//
// The balances can be put away on any tab and at any width. On a phone they
// are a sheet under the content, folded by default to one line carrying the
// group total, so the ledger or the debt map has the screen. On a desk they
// are the column on the right, which folds to a rail that keeps the actions.
// ──────────────────────────────────────────────

import { lazy, Suspense, useState, useCallback, useEffect } from "react";
import { useParams, Link, useSearchParams } from "react-router-dom";
import { useApi } from "../hooks/useApi";
import { useSocket } from "../hooks/useSocket";
import { groupApi, transactionApi, settlementApi, settlementPaymentApi, exportApi } from "../lib/api";
import type { Group, Transaction, GroupBalances, Settlement, SettlementPayment } from "../types/index";
import { ExpenseModal } from "../components/ExpenseModal";
import { SettleUpModal } from "../components/SettleUpModal";
import { SettlementPaymentsPanel } from "../components/SettlementPaymentsPanel";
import { DeleteGroupModal } from "../components/DeleteGroupModal";
import { RoleManager } from "../components/RoleManager";
import { AuditLogViewer } from "../components/AuditLogViewer";
import { SheetHandle } from "../components/SheetHandle";
import { useMedia } from "../hooks/useMedia";
import { useStoredFlag } from "../hooks/useStoredFlag";
import { useUser } from "../contexts/UserContext";

const DebtGraph = lazy(() =>
  import("../components/DebtGraph").then(({ DebtGraph }) => ({ default: DebtGraph }))
);

type ViewMode = "ledger" | "payments" | "graph" | "settings";

function getInitials(name: string): string {
  return name.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2);
}

function formatCurrency(amount: number, currencyCode: string = "USD"): string {
  try {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: currencyCode }).format(amount);
  } catch {
    return `$${amount.toFixed(2)}`;
  }
}

export function GroupDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const [viewMode, setViewMode] = useState<ViewMode>(() => searchParams.get("status") === "pending" ? "payments" : "ledger");
  const [showExpenseModal, setShowExpenseModal] = useState(false);
  const [showSettleModal, setShowSettleModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [mobileActionsOpen, setMobileActionsOpen] = useState(false);
  const [liveSettlements, setLiveSettlements] = useState<Settlement[] | null>(null);
  const { currentUserId } = useUser();

  // One panel, two shapes, and a separate memory for each: wanting the sheet
  // out of the way on a phone says nothing about the column on a desk.
  const wide = useMedia("(min-width: 768px)");
  const [sheetChoice, setSheetOpen] = useStoredFlag("cashflow.group.sheet");
  const [columnChoice, setColumnOpen] = useStoredFlag("cashflow.group.column");
  const sheetOpen = sheetChoice ?? false;
  const columnOpen = columnChoice ?? true;

  useEffect(() => {
    if (searchParams.get("settle") !== "1") return;
    setShowSettleModal(true);
    const nextParams = new URLSearchParams(searchParams);
    nextParams.delete("settle");
    setSearchParams(nextParams, { replace: true });
  }, [searchParams, setSearchParams]);

  const { data: group, loading: groupLoading, error: groupError, refetch: refetchGroup } = useApi<Group>(() => groupApi.get(id!), [id]);
  const { data: transactions, loading: txLoading, refetch: refetchTx } = useApi<Transaction[]>(() => transactionApi.list(id!), [id]);
  const { data: balances, refetch: refetchBalances } = useApi<GroupBalances>(() => settlementApi.get(id!), [id]);
  const { data: settlementPayments, loading: paymentsLoading, refetch: refetchPayments } = useApi<SettlementPayment[]>(() => settlementPaymentApi.list(id!), [id]);

  // Determine the current user's role in this group
  const myMembership = group ? group.members.find(m => m.userId === currentUserId) : null;
  const isAdmin = myMembership?.role === "ADMIN";

  const handleSettlementsUpdate = useCallback(
    (newSettlements: Settlement[]) => {
      setLiveSettlements(newSettlements);
      refetchBalances();
      refetchPayments();
    },
    [refetchBalances, refetchPayments]
  );

  const { connected, latency } = useSocket(id, handleSettlementsUpdate);

  const currentSettlements = liveSettlements ?? balances?.settlements ?? [];
  const currentBalances = balances?.balances ?? [];
  const pendingOnly = searchParams.get("status") === "pending";

  const clearPendingFilter = () => {
    const nextParams = new URLSearchParams(searchParams);
    nextParams.delete("status");
    setSearchParams(nextParams, { replace: true });
  };

  const refreshSettlementData = () => {
    setLiveSettlements(null);
    refetchBalances();
    refetchPayments();
  };

  const handleMutationDone = () => {
    setShowExpenseModal(false);
    setShowSettleModal(false);
    refetchTx();
    refreshSettlementData();
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
        <Link to="/groups" className="btn-secondary">
          <span className="material-symbols-outlined text-[16px]">arrow_back</span>
          Back to Groups
        </Link>
      </div>
    );
  }

  const totalOwed = currentBalances.filter((b) => b.netBalance > 0).reduce((sum, b) => sum + b.netBalance, 0);
  const pendingPayments = (settlementPayments ?? []).filter((payment) => payment.status === "PENDING");
  const incomingPendingCount = pendingPayments.filter((payment) => payment.toUserId === currentUserId).length;
  const settlementCount = currentSettlements.length;

  const tabClass = (tab: ViewMode): string =>
    `h-7 px-3 rounded-md text-[12px] font-medium transition-all duration-150 ${
      viewMode === tab
        ? "bg-surface-container-high text-on-surface shadow-sm"
        : "text-on-surface-variant hover:text-on-surface"
    }`;

  const liveDot = (
    <span className="relative flex h-2 w-2 shrink-0">
      {connected && <span className="animate-sync-ping absolute inline-flex h-full w-full rounded-full bg-secondary opacity-75" />}
      <span className={`relative inline-flex h-2 w-2 rounded-full ${connected ? "bg-secondary" : "bg-outline"}`} />
    </span>
  );

  const balancesBody = (
    <div className="p-4 md:p-5 flex-1 flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <h3 className="text-[13px] font-bold text-on-surface">Open balances</h3>
      </div>

      {/* Summary Card */}
      <div className="rounded-2xl border border-outline-variant/70 bg-surface-container p-4 shadow-[0_8px_20px_rgba(31,35,54,0.04)] flex flex-col gap-1">
        <span className="text-label text-[10px]">Group total</span>
        <span className="text-data-lg text-secondary">{formatCurrency(totalOwed, group.currency)}</span>
        <span className="text-[11px] text-on-surface-variant mt-1">
          {settlementCount} settlement{settlementCount !== 1 ? "s" : ""} needed
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
              {balance.netBalance > 0.01 ? "+" : ""}{formatCurrency(balance.netBalance, group.currency)}
            </span>
          </div>
        ))}
      </div>

      {/* Settlements Preview */}
      {settlementCount > 0 && (
        <>
          <div className="h-px bg-outline-variant/30 my-1" />
          <h3 className="text-[13px] font-bold text-on-surface">Suggested settlements</h3>
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
            className="btn-secondary w-full !border-error/20 !text-error hover:!bg-error hover:!text-on-error transition-colors"
          >
            <span className="material-symbols-outlined text-[16px]">delete</span>
            Delete Group
          </button>
        </div>
      )}
    </div>
  );

  const status = (
    <div className="p-4 border-t border-outline-variant/30 flex items-center justify-between shrink-0">
      <div className="flex items-center gap-2">
        {liveDot}
        <span className="text-[11px] text-on-surface-variant font-medium">{connected ? "Updates live" : "Reconnecting"}</span>
      </div>
      {connected && <span className="text-[10px] text-on-surface-variant tabular-nums">{latency}ms</span>}
    </div>
  );

  const railButton =
    "flex h-9 w-9 items-center justify-center rounded-[4px] text-on-surface-variant transition-colors hover:bg-glass-hover hover:text-on-surface";

  return (
    <div className="h-full flex flex-col bg-background md:flex-row overflow-hidden">
      {/* ── Center Panel ──────────────────── */}
      <section className="relative min-h-0 min-w-0 flex-1 md:h-full flex flex-col overflow-hidden md:border-r md:border-outline-variant/70">
        {/* Header */}
        <header className="h-auto min-h-14 border-b border-outline-variant/70 flex flex-col items-stretch gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between md:px-6 md:py-4 bg-surface-container shrink-0">
          <div className="flex items-center gap-3">
            <Link to="/groups" className="btn-ghost !p-1.5 !h-auto">
              <span className="material-symbols-outlined text-[18px]">arrow_back</span>
            </Link>
            <div>
              <h2 className="text-[14px] font-semibold text-on-surface">{group.name}</h2>
              <p className="text-[11px] text-on-surface-variant">{group.members.length} members • {transactions?.length ?? 0} expenses</p>
            </div>
          </div>
          <div className="flex max-w-full flex-wrap items-center gap-2">
            <div className="no-scrollbar flex items-center gap-1 bg-surface-variant/50 rounded-lg p-0.5 overflow-x-auto whitespace-nowrap">
              <button onClick={() => setViewMode("ledger")} className={tabClass("ledger")}>
                Ledger
              </button>
              <button onClick={() => setViewMode("payments")} className={tabClass("payments")}>
                Payments{incomingPendingCount > 0 ? ` (${incomingPendingCount})` : ""}
              </button>
              <button onClick={() => setViewMode("graph")} className={tabClass("graph")}>
                Debt map
              </button>
              <button onClick={() => setViewMode("settings")} className={tabClass("settings")}>
                Settings
              </button>
            </div>
            {pendingOnly && viewMode === "payments" && (
              <button onClick={clearPendingFilter} className="flex h-7 items-center gap-1 rounded-full bg-warning/10 px-2.5 text-[10px] font-bold text-warning transition-colors hover:bg-warning/20" title="Show payment history">
                Pending only
                <span className="material-symbols-outlined text-[14px]">close</span>
              </button>
            )}
            <button
              type="button"
              onClick={() => setColumnOpen(!columnOpen)}
              aria-pressed={columnOpen}
              aria-label={columnOpen ? "Hide balances" : "Show balances"}
              title={columnOpen ? "Hide balances" : "Show balances"}
              className="hidden h-7 w-7 shrink-0 items-center justify-center rounded-md text-on-surface-variant transition-colors hover:text-on-surface md:flex"
            >
              <span className="material-symbols-outlined text-[18px]">
                {columnOpen ? "right_panel_close" : "right_panel_open"}
              </span>
            </button>
          </div>
        </header>

        {viewMode === "ledger" ? (
          <LedgerView
            transactions={transactions ?? []}
            loading={txLoading}
            currency={group.currency}
          />
        ) : viewMode === "payments" ? (
          <SettlementPaymentsPanel
            groupId={group.id}
            payments={settlementPayments ?? []}
            currentUserId={currentUserId}
            pendingOnly={pendingOnly}
            loading={paymentsLoading}
            onChanged={refreshSettlementData}
          />
        ) : viewMode === "graph" ? (
          <Suspense
            fallback={
              <div className="flex-1 flex items-center justify-center">
                <div className="flex flex-col items-center gap-3 animate-pulse">
                  <div className="w-12 h-12 rounded-xl bg-surface-variant" />
                  <div className="h-3 w-28 rounded bg-surface-variant" />
                </div>
              </div>
            }
          >
            <DebtGraph settlements={currentSettlements} members={group.members} currency={group.currency} />
          </Suspense>
        ) : (
          <div className="flex-1 overflow-y-auto p-4 pb-24 md:p-6 max-w-3xl mx-auto w-full space-y-8 animate-fade-in">
            <section>
              <h3 className="text-[16px] font-bold text-on-surface mb-4">Member access</h3>
              <RoleManager group={group} currentUserId={currentUserId} onRoleChanged={refetchGroup} />
            </section>

            <section>
              <h3 className="text-[16px] font-bold text-on-surface mb-4">Group activity</h3>
              <AuditLogViewer groupId={group.id} />
            </section>
          </div>
        )}

        {/* Actions on a phone. Anchored to the content rather than the screen,
            so it rides above the balances sheet at whatever height that is. */}
        <div className="absolute right-4 bottom-4 z-30 flex flex-col items-end gap-2 md:hidden">
          {mobileActionsOpen && (
            <div className="flex flex-col items-end gap-2 animate-slide-up">
              <button onClick={() => { setShowExpenseModal(true); setMobileActionsOpen(false); }} className="btn-primary shadow-lg">
                <span className="material-symbols-outlined text-[17px]">add</span>
                Add Expense
              </button>
              <button onClick={() => { setShowSettleModal(true); setMobileActionsOpen(false); }} className="btn-secondary shadow-lg">
                <span className="material-symbols-outlined text-[17px]">handshake</span>
                Settle Up
              </button>
              <button onClick={() => exportApi.downloadPdf(id!)} className="btn-secondary shadow-lg">
                <span className="material-symbols-outlined text-[17px]">picture_as_pdf</span>
                PDF Report
              </button>
              <button onClick={() => exportApi.downloadCsv(id!)} className="btn-secondary shadow-lg">
                <span className="material-symbols-outlined text-[17px]">table_chart</span>
                CSV Ledger
              </button>
            </div>
          )}
          <button
            type="button"
            onClick={() => setMobileActionsOpen((isOpen) => !isOpen)}
            aria-label={mobileActionsOpen ? "Close group actions" : "Open group actions"}
            className="w-14 h-14 rounded-full bg-primary-container text-on-primary-container shadow-lg flex items-center justify-center transition-transform active:scale-95"
          >
            <span className="material-symbols-outlined text-[26px]">{mobileActionsOpen ? "close" : "add"}</span>
          </button>
        </div>
      </section>

      {/* ── Balances ──────────────────────── */}
      {!wide ? (
        <aside className="flex shrink-0 flex-col border-t border-outline-variant/70 bg-surface-container-low pb-[env(safe-area-inset-bottom)]">
          <SheetHandle open={sheetOpen} onChange={setSheetOpen} label="balances" />
          {sheetOpen ? (
            <div className="flex max-h-[46vh] flex-col overflow-y-auto">
              {balancesBody}
              {status}
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setSheetOpen(true)}
              className="flex min-h-[44px] items-center justify-between gap-3 px-4 pb-2 text-left"
            >
              <span className="flex min-w-0 items-center gap-2">
                {liveDot}
                <span className="truncate text-[12px] font-medium text-on-surface">Open balances</span>
              </span>
              <span className="flex shrink-0 items-center gap-2">
                <span className="text-data font-semibold text-secondary">{formatCurrency(totalOwed, group.currency)}</span>
                <span className="text-[11px] text-on-surface-variant">
                  {settlementCount === 0 ? "settled" : `${settlementCount} to settle`}
                </span>
                <span className="material-symbols-outlined text-[18px] text-on-surface-variant">expand_less</span>
              </span>
            </button>
          )}
        </aside>
      ) : columnOpen ? (
        <aside className="flex h-full w-[336px] shrink-0 flex-col overflow-y-auto bg-surface-container-low">
          {/* Actions */}
          <div className="flex p-5 flex-col gap-3 border-b border-outline-variant/70">
            <button onClick={() => setShowExpenseModal(true)} className="btn-primary w-full">
              <span className="material-symbols-outlined text-[16px]">add</span>
              Add Expense
            </button>
            <button onClick={() => setShowSettleModal(true)} className="btn-secondary w-full">
              <span className="material-symbols-outlined text-[16px]">handshake</span>
              Settle Up
            </button>
            <div className="flex gap-2">
              <button onClick={() => exportApi.downloadPdf(id!)} className="btn-secondary flex-1 !text-[11px] !px-1">
                <span className="material-symbols-outlined text-[14px]">picture_as_pdf</span>
                PDF Report
              </button>
              <button onClick={() => exportApi.downloadCsv(id!)} className="btn-secondary flex-1 !text-[11px] !px-1">
                <span className="material-symbols-outlined text-[14px]">table_chart</span>
                CSV Ledger
              </button>
            </div>
          </div>

          {balancesBody}
          {status}
        </aside>
      ) : (
        // Folded, the column is a rail: the balances go, the actions stay.
        <aside className="flex h-full w-14 shrink-0 flex-col items-center gap-1.5 bg-surface-container-low py-4">
          <button
            type="button"
            onClick={() => setShowExpenseModal(true)}
            aria-label="Add expense"
            title="Add expense"
            className="flex h-9 w-9 items-center justify-center rounded-[4px] bg-[#85c093] text-[#09352e] transition-[filter] hover:brightness-95"
          >
            <span className="material-symbols-outlined text-[18px]">add</span>
          </button>
          <button type="button" onClick={() => setShowSettleModal(true)} aria-label="Settle up" title="Settle up" className={railButton}>
            <span className="material-symbols-outlined text-[18px]">handshake</span>
          </button>
          <button type="button" onClick={() => exportApi.downloadPdf(id!)} aria-label="PDF report" title="PDF report" className={railButton}>
            <span className="material-symbols-outlined text-[18px]">picture_as_pdf</span>
          </button>
          <button type="button" onClick={() => exportApi.downloadCsv(id!)} aria-label="CSV ledger" title="CSV ledger" className={railButton}>
            <span className="material-symbols-outlined text-[18px]">table_chart</span>
          </button>
          <span className="mt-auto" title={connected ? "Updates live" : "Reconnecting"}>
            {liveDot}
          </span>
        </aside>
      )}

      {showExpenseModal && <ExpenseModal group={group} onClose={() => setShowExpenseModal(false)} onCreated={handleMutationDone} />}
      {showSettleModal && (
        <SettleUpModal
          group={group}
          settlements={currentSettlements}
          pendingPayments={pendingPayments}
          currentUserId={currentUserId}
          onClose={() => setShowSettleModal(false)}
          onChanged={refreshSettlementData}
        />
      )}
      {showDeleteModal && <DeleteGroupModal group={group} onClose={() => setShowDeleteModal(false)} />}
    </div>
  );
}

// ── Ledger View ──────────────────────────────

interface LedgerViewProps {
  transactions: Transaction[];
  loading: boolean;
  currency: string;
}

function LedgerView({ transactions, loading, currency }: LedgerViewProps) {
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
        <p className="text-[14px] font-medium text-on-surface">No expenses yet</p>
        <p className="text-[13px] text-on-surface-variant">Add your first shared expense to get started.</p>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-auto">
      {/* Column Headers */}
      <div className="hidden md:grid grid-cols-12 gap-4 px-5 py-3 border-b border-outline-variant/30 sticky top-0 bg-surface-dim/80 backdrop-blur-sm z-10">
        <div className="col-span-2 text-label">Date</div>
        <div className="col-span-4 text-label">Description</div>
        <div className="col-span-3 text-label">Paid By</div>
        <div className="col-span-1 text-label text-right">Split</div>
        <div className="col-span-2 text-label text-right">Amount</div>
      </div>

      {/* Rows. On a phone the last one has to clear the action button. */}
      <div className="flex flex-col pb-20 md:pb-0">
        {transactions.map((tx, i) => (
          <div
            key={tx.id}
            className="mx-3 my-2 flex flex-col gap-2 rounded-xl border border-outline-variant/30 bg-surface-container p-4 hover:bg-glass-hover transition-colors animate-slide-up md:mx-0 md:my-0 md:grid md:grid-cols-12 md:gap-4 md:rounded-none md:border-0 md:border-b md:border-outline-variant/20 md:bg-transparent md:px-5 md:py-3"
            style={{ animationDelay: `${i * 30}ms` }}
          >
            <div className="order-4 md:order-none col-span-2 text-data text-on-surface-variant">
              {new Date(tx.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
            </div>
            <div className="order-1 md:order-none col-span-4 text-[14px] md:text-[13px] font-medium text-on-surface truncate">
              {tx.description}
            </div>
            <div className="order-3 md:order-none col-span-3 flex items-center gap-2">
              <div className={`avatar avatar-sm avatar-${i % 6} !w-6 !h-6 !text-[9px]`}>
                {getInitials(tx.paidBy.name)}
              </div>
              <span className="text-[13px] text-on-surface truncate">{tx.paidBy.name}</span>
            </div>
            <div className="order-5 md:order-none col-span-1 text-[12px] text-left md:text-right">
              <span className="text-on-surface-variant">{tx.debtShares.length}</span>
            </div>
            <div className="order-2 self-start md:self-auto col-span-2 text-data text-left md:text-right text-secondary font-semibold">
              {formatCurrency(tx.amount, currency)}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
