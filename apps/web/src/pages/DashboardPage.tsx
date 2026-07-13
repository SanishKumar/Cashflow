import { Link } from "react-router-dom";
import { useApi } from "../hooks/useApi";
import { dashboardApi } from "../lib/api";
import { useUser } from "../contexts/UserContext";
import type {
  AuditLogEntry,
  DashboardGroupPreview,
  DashboardPendingConfirmation,
  DashboardSettlementAction,
  DashboardStats,
} from "../types/index";

const ACTION_ICONS: Record<string, { icon: string; color: string }> = {
  GROUP_CREATED: { icon: "group_add", color: "text-primary" },
  GROUP_DELETED: { icon: "delete_forever", color: "text-error" },
  MEMBER_ADDED: { icon: "person_add", color: "text-secondary" },
  MEMBER_REMOVED: { icon: "person_remove", color: "text-warning" },
  MEMBER_LEFT: { icon: "exit_to_app", color: "text-on-surface-variant" },
  EXPENSE_ADDED: { icon: "receipt_long", color: "text-secondary" },
  EXPENSE_DELETED: { icon: "receipt_long", color: "text-error" },
  ROLE_CHANGED: { icon: "shield_person", color: "text-primary" },
  SETTLEMENT_SENT: { icon: "outgoing_mail", color: "text-warning" },
  SETTLEMENT_CONFIRMED: { icon: "task_alt", color: "text-secondary" },
  SETTLEMENT_REJECTED: { icon: "cancel", color: "text-error" },
  SETTLEMENT_CANCELLED: { icon: "block", color: "text-on-surface-variant" },
};

function formatCurrency(amount: number, currency: string): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
  }).format(amount);
}

function relativeTime(dateStr: string): string {
  const elapsed = Date.now() - new Date(dateStr).getTime();
  const minutes = Math.floor(elapsed / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(dateStr).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function getInitials(name: string): string {
  return name.split(" ").map((part) => part[0]).join("").toUpperCase().slice(0, 2);
}

export function DashboardPage() {
  const { currentUser } = useUser();
  const { data: stats, loading, error } = useApi<DashboardStats>(() => dashboardApi.getStats());

  if (loading) return <DashboardLoading />;

  if (error) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4 px-6 text-center animate-fade-in">
        <div className="flex h-16 w-16 items-center justify-center rounded-3xl bg-glow-error">
          <span className="material-symbols-outlined text-[32px] text-error">cloud_off</span>
        </div>
        <div>
          <p className="text-[16px] font-bold text-on-surface">Your overview is unavailable</p>
          <p className="mt-1 text-[13px] text-on-surface-variant">{error}</p>
        </div>
      </div>
    );
  }

  if (!stats) return null;
  const firstName = currentUser?.name.split(" ")[0];

  return (
    <div className="mobile-scroll-safe h-full max-w-full overflow-x-hidden overflow-y-auto">
      <div className="mx-auto min-w-0 max-w-[1240px] px-4 py-5 md:px-8 md:py-8">
        <header className="mb-6 flex min-w-0 flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div className="min-w-0">
            <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-primary">Settlement desk</p>
            <h1 className="mt-2 text-[28px] font-bold leading-tight tracking-[-0.03em] text-on-surface md:text-[34px]">
              {firstName ? `${firstName}, here’s what needs attention.` : "Here’s what needs attention."}
            </h1>
            <p className="mt-2 max-w-2xl text-[13px] leading-6 text-on-surface-variant">
              Confirm money you received, send the payments assigned to you, or move on when everything is settled.
            </p>
          </div>
          <Link to="/groups" className="btn-primary h-10 w-fit shrink-0 px-4">
            <span className="material-symbols-outlined text-[17px]">add</span>
            Add an expense
          </Link>
        </header>

        <section className="mb-5 grid grid-cols-3 gap-2 sm:gap-3" aria-label="Account summary">
          <SummaryMetric label="Active groups" value={stats.totalGroups} icon="groups" />
          <SummaryMetric label="Expenses" value={stats.totalTransactions} icon="receipt_long" />
          <SummaryMetric label="To confirm" value={stats.pendingSettlements} icon="verified" urgent={stats.pendingSettlements > 0} />
        </section>

        <section className="grid min-w-0 gap-5 xl:grid-cols-[minmax(0,1.55fr)_minmax(300px,0.75fr)]">
          <NextMovesPanel
            outgoing={stats.outgoingSettlements}
            confirmations={stats.pendingConfirmations}
            hasGroups={stats.totalGroups > 0}
          />
          <ExpectedBackPanel settlements={stats.incomingSettlements} />
        </section>

        <section className="mt-5 grid min-w-0 gap-5 xl:grid-cols-[minmax(0,1.2fr)_minmax(320px,0.8fr)]">
          <GroupPreview groups={stats.groups} />
          <ActivityStream entries={stats.recentActivity} />
        </section>

        <div className="mt-5 flex items-start gap-2 rounded-2xl border border-outline-variant/70 bg-surface-container-low px-4 py-3 text-[11px] leading-5 text-on-surface-variant">
          <span className="material-symbols-outlined mt-0.5 text-[16px] text-primary">account_balance_off</span>
          <p>CashFlow records shared expenses and payment confirmations. It does not connect to a bank or transfer money.</p>
        </div>
      </div>
    </div>
  );
}

function DashboardLoading() {
  return (
    <div className="mobile-scroll-safe h-full overflow-auto">
      <div className="mx-auto max-w-[1240px] px-4 py-5 animate-pulse md:px-8 md:py-8">
        <div className="h-3 w-28 rounded bg-surface-variant" />
        <div className="mt-3 h-9 w-[480px] max-w-full rounded bg-surface-variant" />
        <div className="mt-8 grid grid-cols-3 gap-3"><div className="h-24 rounded-2xl bg-surface-variant" /><div className="h-24 rounded-2xl bg-surface-variant" /><div className="h-24 rounded-2xl bg-surface-variant" /></div>
        <div className="mt-5 grid gap-5 xl:grid-cols-[1.55fr_0.75fr]"><div className="h-[360px] rounded-3xl bg-surface-variant" /><div className="h-[360px] rounded-3xl bg-surface-variant" /></div>
      </div>
    </div>
  );
}

function SummaryMetric({ label, value, icon, urgent = false }: { label: string; value: number; icon: string; urgent?: boolean }) {
  return (
    <article className="min-w-0 rounded-2xl border border-outline-variant/70 bg-surface-container p-3 shadow-[0_8px_20px_rgba(31,35,54,0.04)] sm:p-4">
      <div className="flex min-w-0 items-center gap-2">
        <span className={`material-symbols-outlined text-[17px] ${urgent ? "text-warning" : "text-primary"}`}>{icon}</span>
        <span className="truncate text-[10px] font-bold uppercase tracking-[0.07em] text-on-surface-variant">{label}</span>
      </div>
      <p className="mt-2 text-[22px] font-bold tabular-nums text-on-surface" aria-label={`${label}: ${value}`}>{value}</p>
    </article>
  );
}

function NextMovesPanel({
  outgoing,
  confirmations,
  hasGroups,
}: {
  outgoing: DashboardSettlementAction[];
  confirmations: DashboardPendingConfirmation[];
  hasGroups: boolean;
}) {
  const hasActions = outgoing.length > 0 || confirmations.length > 0;

  return (
    <section className="min-w-0 overflow-hidden rounded-3xl border border-outline-variant/70 bg-surface-container shadow-[0_10px_28px_rgba(31,35,54,0.05)]">
      <div className="border-b border-outline-variant/60 px-4 py-4 sm:px-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-[16px] font-bold text-on-surface">Your next moves</p>
            <p className="mt-1 text-[11px] text-on-surface-variant">Only the actions assigned to you appear here.</p>
          </div>
          <span className={`rounded-full px-2.5 py-1 text-[10px] font-bold ${hasActions ? "bg-warning/10 text-warning" : "bg-secondary/10 text-secondary"}`}>
            {hasActions ? `${confirmations.length + outgoing.length} open` : "Up to date"}
          </span>
        </div>
      </div>

      {!hasActions ? (
        <div className="flex min-h-[290px] flex-col items-center justify-center px-5 text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-secondary/10 text-secondary"><span className="material-symbols-outlined text-[28px]">task_alt</span></div>
          <p className="mt-4 text-[15px] font-bold text-on-surface">{hasGroups ? "Nothing needs your attention" : "Create your first group"}</p>
          <p className="mt-1 max-w-sm text-[11px] leading-5 text-on-surface-variant">
            {hasGroups ? "You have no payments to send or confirm right now." : "Add a trip, home, or team group, then record expenses as they happen."}
          </p>
          <Link to="/groups" className="btn-secondary mt-4 h-9 px-4">{hasGroups ? "Open groups" : "Create a group"}</Link>
        </div>
      ) : (
        <div className="divide-y divide-outline-variant/60">
          {confirmations.map((payment) => (
            <Link key={payment.id} to={`/groups/${payment.groupId}?status=pending`} className="group grid min-w-0 grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 px-4 py-4 transition-colors hover:bg-surface-container-low sm:px-5" aria-label={`Confirm ${formatCurrency(payment.amount, payment.currency)} from ${payment.fromName} in ${payment.groupName}`}>
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-warning/10 text-warning"><span className="material-symbols-outlined text-[19px]">download</span></div>
              <div className="min-w-0">
                <p className="truncate text-[12px] font-bold text-on-surface">Confirm money from {payment.fromName}</p>
                <p className="mt-0.5 truncate text-[10px] text-on-surface-variant">{payment.groupName} · marked sent {relativeTime(payment.createdAt)}</p>
              </div>
              <div className="text-right">
                <p className="text-[13px] font-bold tabular-nums text-on-surface">{formatCurrency(payment.amount, payment.currency)}</p>
                <p className="mt-0.5 text-[9px] font-bold uppercase tracking-[0.06em] text-warning">Review</p>
              </div>
            </Link>
          ))}
          {outgoing.map((settlement) => {
            const waiting = settlement.state === "PENDING_CONFIRMATION";
            return (
              <Link key={`${settlement.groupId}:${settlement.toUserId}`} to={`/groups/${settlement.groupId}?${waiting ? "status=pending" : "settle=1"}`} className="group grid min-w-0 grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 px-4 py-4 transition-colors hover:bg-surface-container-low sm:px-5" aria-label={`${waiting ? "Review" : "Pay"} ${formatCurrency(settlement.amount, settlement.currency)} to ${settlement.toName} in ${settlement.groupName}`}>
                <div className={`flex h-10 w-10 items-center justify-center rounded-xl ${waiting ? "bg-warning/10 text-warning" : "bg-primary/10 text-primary"}`}><span className="material-symbols-outlined text-[19px]">{waiting ? "hourglass_top" : "north_east"}</span></div>
                <div className="min-w-0">
                  <p className="truncate text-[12px] font-bold text-on-surface">{waiting ? `Waiting for ${settlement.toName}` : `Pay ${settlement.toName}`}</p>
                  <p className="mt-0.5 truncate text-[10px] text-on-surface-variant">{settlement.groupName} · {waiting ? "sent, awaiting confirmation" : "from the current plan"}</p>
                </div>
                <div className="text-right">
                  <p className="text-[13px] font-bold tabular-nums text-on-surface">{formatCurrency(settlement.amount, settlement.currency)}</p>
                  <p className={`mt-0.5 text-[9px] font-bold uppercase tracking-[0.06em] ${waiting ? "text-warning" : "text-primary"}`}>{waiting ? "Pending" : "Settle"}</p>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </section>
  );
}

function ExpectedBackPanel({ settlements }: { settlements: DashboardSettlementAction[] }) {
  return (
    <section className="min-w-0 rounded-3xl border border-outline-variant/70 bg-surface-container p-4 shadow-[0_10px_28px_rgba(31,35,54,0.05)] sm:p-5">
      <div className="flex items-start justify-between gap-3">
        <div><p className="text-[15px] font-bold text-on-surface">Expected back</p><p className="mt-1 text-[11px] text-on-surface-variant">Current plan, by currency.</p></div>
        <span className="material-symbols-outlined rounded-xl bg-secondary/10 p-2 text-[18px] text-secondary">south_west</span>
      </div>
      {settlements.length === 0 ? (
        <div className="flex min-h-[220px] flex-col items-center justify-center text-center"><span className="material-symbols-outlined text-[28px] text-outline">horizontal_rule</span><p className="mt-2 text-[12px] font-bold">No one owes you right now</p></div>
      ) : (
        <div className="mt-4 space-y-2">
          {settlements.map((settlement) => (
            <Link key={`${settlement.groupId}:${settlement.fromUserId}`} to={`/groups/${settlement.groupId}`} className="flex min-w-0 items-center justify-between gap-3 rounded-xl bg-surface-container-high px-3 py-3 transition-colors hover:bg-surface-container-highest">
              <div className="min-w-0"><p className="truncate text-[11px] font-bold">{settlement.fromName}</p><p className="mt-0.5 truncate text-[9px] text-on-surface-variant">{settlement.groupName}</p></div>
              <p className="shrink-0 text-[12px] font-bold tabular-nums text-secondary">{formatCurrency(settlement.amount, settlement.currency)}</p>
            </Link>
          ))}
        </div>
      )}
    </section>
  );
}

function GroupPreview({ groups }: { groups: DashboardGroupPreview[] }) {
  return (
    <section className="min-w-0 rounded-3xl border border-outline-variant/70 bg-surface-container p-4 shadow-[0_10px_28px_rgba(31,35,54,0.05)] sm:p-5">
      <div className="mb-3 flex items-center justify-between gap-3"><div><p className="text-[15px] font-bold">Active groups</p><p className="mt-1 text-[11px] text-on-surface-variant">Expenses and payment plans live inside each group.</p></div><Link to="/groups" className="text-[11px] font-bold text-primary hover:underline">View all</Link></div>
      {groups.length === 0 ? <p className="py-8 text-center text-[11px] text-on-surface-variant">No groups yet.</p> : (
        <div className="divide-y divide-outline-variant/60">
          {groups.slice(0, 4).map((group) => (
            <Link key={group.id} to={`/groups/${group.id}`} className="flex min-w-0 items-center gap-3 py-3 first:pt-1 last:pb-0">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-[10px] font-bold text-primary">{getInitials(group.name)}</div>
              <div className="min-w-0 flex-1"><p className="truncate text-[12px] font-bold">{group.name}</p><p className="mt-0.5 truncate text-[9px] text-on-surface-variant">{group.memberCount} members · {group.expenseCount} expenses · {group.currency}</p></div>
              <span className="material-symbols-outlined text-[17px] text-outline">chevron_right</span>
            </Link>
          ))}
        </div>
      )}
    </section>
  );
}

function ActivityStream({ entries }: { entries: AuditLogEntry[] }) {
  return (
    <section className="min-w-0 rounded-3xl border border-outline-variant/70 bg-surface-container p-4 shadow-[0_10px_28px_rgba(31,35,54,0.05)] sm:p-5">
      <div className="mb-3 flex items-center justify-between gap-3"><div><p className="text-[15px] font-bold">Recent activity</p><p className="mt-1 text-[11px] text-on-surface-variant">History stays one level deeper.</p></div><Link to="/ledger?tab=activity" className="text-[11px] font-bold text-primary hover:underline">All activity</Link></div>
      {entries.length === 0 ? <div className="flex min-h-[150px] flex-col items-center justify-center text-center"><span className="material-symbols-outlined text-[28px] text-outline">history</span><p className="mt-2 text-[12px] font-bold">No recent activity</p></div> : (
        <div className="max-h-[230px] overflow-y-auto">
          {entries.map((entry) => {
            const meta = ACTION_ICONS[entry.action] ?? { icon: "info", color: "text-on-surface-variant" };
            return (
              <div key={entry.id} className="flex gap-3 border-b border-outline-variant/50 py-3 first:pt-1 last:border-0 last:pb-0">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-surface-container-high"><span className={`material-symbols-outlined text-[16px] ${meta.color}`}>{meta.icon}</span></div>
                <div className="min-w-0 flex-1"><p className="truncate text-[11px]"><span className="font-bold">{entry.user.name.split(" ")[0]}</span> <span className="text-on-surface-variant">{entry.details || entry.action.replace(/_/g, " ").toLowerCase()}</span></p><p className="mt-1 truncate text-[9px] text-on-surface-variant">{relativeTime(entry.createdAt)}{entry.group ? ` · ${entry.group.name}` : ""}</p></div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
