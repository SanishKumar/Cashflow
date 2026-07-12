import { Link } from "react-router-dom";
import { useApi } from "../hooks/useApi";
import { dashboardApi, groupApi } from "../lib/api";
import type { AuditLogEntry, DashboardStats, Group, MonthlyVolume, PendingSettlementGroup } from "../types/index";

const ACTION_ICONS: Record<string, { icon: string; color: string }> = {
  GROUP_CREATED: { icon: "group_add", color: "text-primary" },
  GROUP_DELETED: { icon: "delete_forever", color: "text-error" },
  MEMBER_ADDED: { icon: "person_add", color: "text-secondary" },
  MEMBER_REMOVED: { icon: "person_remove", color: "text-warning" },
  MEMBER_LEFT: { icon: "exit_to_app", color: "text-on-surface-variant" },
  EXPENSE_ADDED: { icon: "receipt_long", color: "text-secondary" },
  EXPENSE_DELETED: { icon: "receipt_long", color: "text-error" },
  ROLE_CHANGED: { icon: "shield_person", color: "text-primary" },
  TRANSACTION_COMPLETED: { icon: "task_alt", color: "text-secondary" },
  TRANSACTION_PENDING: { icon: "schedule", color: "text-warning" },
  TRANSACTION_REJECTED: { icon: "cancel", color: "text-error" },
  USER_LOGIN: { icon: "login", color: "text-on-surface-variant" },
  USER_REGISTER: { icon: "person_add", color: "text-primary" },
};

const GROUP_ACCENTS = [
  "from-violet-500 to-indigo-600",
  "from-emerald-500 to-teal-600",
  "from-amber-400 to-orange-500",
  "from-rose-500 to-pink-600",
];

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(Math.abs(amount));
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
  const { data: stats, loading, error } = useApi<DashboardStats>(() => dashboardApi.getStats());
  const { data: groups, loading: groupsLoading } = useApi<Group[]>(() => groupApi.list());

  if (loading) return <DashboardLoading />;

  if (error) {
    return (
      <div className="h-full flex flex-col items-center justify-center gap-4 animate-fade-in px-6 text-center">
        <div className="w-16 h-16 rounded-3xl bg-glow-error flex items-center justify-center">
          <span className="material-symbols-outlined text-error text-[32px]">cloud_off</span>
        </div>
        <div>
          <p className="text-[16px] font-bold text-on-surface">Your overview is unavailable</p>
          <p className="mt-1 text-[13px] text-on-surface-variant">{error}</p>
        </div>
      </div>
    );
  }

  if (!stats) return null;

  const isOwed = stats.netPosition > 0;
  const isEven = stats.netPosition === 0;
  const balanceLabel = isEven ? "All even" : isOwed ? "Owed to you" : "You owe";

  return (
    <div className="mobile-scroll-safe h-full max-w-full overflow-x-hidden overflow-y-auto">
      <div className="mx-auto min-w-0 max-w-[1440px] px-4 py-5 md:px-8 md:py-8">
        <section className="mb-7 flex min-w-0 flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div className="min-w-0">
            <p className="mb-2 text-[11px] font-bold uppercase tracking-[0.16em] text-primary">Your workspace</p>
            <h1 className="text-[28px] font-bold tracking-tight text-on-surface md:text-[32px]">Shared money, made clear.</h1>
            <p className="mt-2 max-w-xl text-[13px] leading-relaxed text-on-surface-variant">See what your groups are spending, what needs a settle-up, and what happened most recently.</p>
          </div>
          <div className="flex w-full min-w-0 gap-3 md:w-auto">
            <Link to="/ledger" className="btn-secondary flex-1 md:flex-none">
              <span className="material-symbols-outlined text-[17px]">receipt_long</span>
              Ledger
            </Link>
            <Link to="/groups" className="btn-primary flex-1 md:flex-none">
              <span className="material-symbols-outlined text-[17px]">groups</span>
              Your groups
            </Link>
          </div>
        </section>

        <section className="grid min-w-0 gap-4 xl:grid-cols-4">
          <div className="relative min-w-0 overflow-hidden rounded-[26px] bg-gradient-to-br from-[#5133db] via-[#6d4aff] to-[#a186ff] p-6 text-white shadow-[0_18px_40px_rgba(105,71,244,0.24)] xl:col-span-2">
            <div className="absolute -right-10 -top-14 h-48 w-48 rounded-full bg-white/10 blur-2xl" />
            <div className="absolute -bottom-16 left-24 h-40 w-40 rounded-full bg-indigo-950/15 blur-2xl" />
            <div className="relative flex h-full min-h-[184px] flex-col justify-between">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-[12px] font-semibold text-white/80">
                  <span className="material-symbols-outlined text-[18px]">account_balance_wallet</span>
                  Settlement snapshot
                </div>
                <span className="rounded-full border border-white/20 bg-white/10 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.09em]">Across {stats.totalGroups} group{stats.totalGroups === 1 ? "" : "s"}</span>
              </div>
              <div>
                <p className="text-[13px] text-white/75">{balanceLabel}</p>
                <p className="mt-1 text-[36px] font-bold tracking-tight">{isEven ? "$0" : `${isOwed ? "+" : "-"}${formatCurrency(stats.netPosition)}`}</p>
                <p className="mt-2 max-w-sm text-[12px] leading-relaxed text-white/75">
                  {isEven ? "Everyone is square across the groups you can see." : "A clear view of your current position across every shared expense."}
                </p>
              </div>
              <Link to="/groups" className="flex w-fit items-center gap-2 rounded-xl bg-white px-3.5 py-2 text-[12px] font-bold text-[#5133db] shadow-sm transition-transform hover:-translate-y-0.5">
                Review groups
                <span className="material-symbols-outlined text-[16px]">arrow_forward</span>
              </Link>
            </div>
          </div>

          <MetricTile icon="groups" label="Your groups" value={String(stats.totalGroups)} hint="Shared workspaces" tone="primary" />
          <MetricTile icon="receipt_long" label="Expenses tracked" value={String(stats.totalTransactions)} hint="Across all groups" tone="emerald" />
        </section>

        <section className="mt-6 grid gap-6 xl:grid-cols-3">
          <GroupWorkspacePreview groups={groups ?? []} loading={groupsLoading} />
          <SettlementPanel pending={stats.pendingSettlements} pendingGroups={stats.pendingGroups ?? []} />
        </section>

        <section className="mt-6 grid gap-6 xl:grid-cols-5">
          <SpendingTrend data={stats.monthlyVolume} totalVolume={stats.totalVolume} />
          <ActivityStream entries={stats.recentActivity} />
        </section>
      </div>
    </div>
  );
}

function DashboardLoading() {
  return (
    <div className="mobile-scroll-safe h-full overflow-auto">
      <div className="mx-auto max-w-[1440px] px-4 py-5 md:px-8 md:py-8 animate-pulse">
        <div className="h-3 w-28 rounded bg-surface-variant" />
        <div className="mt-3 h-9 w-72 rounded bg-surface-variant" />
        <div className="mt-2 h-4 w-[420px] max-w-full rounded bg-surface-variant" />
        <div className="mt-8 grid gap-4 xl:grid-cols-4">
          <div className="h-[184px] rounded-[26px] bg-surface-variant xl:col-span-2" />
          <div className="h-[184px] rounded-[26px] bg-surface-variant" />
          <div className="h-[184px] rounded-[26px] bg-surface-variant" />
        </div>
        <div className="mt-6 grid gap-6 xl:grid-cols-3">
          <div className="h-72 rounded-[24px] bg-surface-variant xl:col-span-2" />
          <div className="h-72 rounded-[24px] bg-surface-variant" />
        </div>
      </div>
    </div>
  );
}

function MetricTile({ icon, label, value, hint, tone }: { icon: string; label: string; value: string; hint: string; tone: "primary" | "emerald" }) {
  const toneClass = tone === "primary" ? "bg-primary/10 text-primary" : "bg-secondary/10 text-secondary";

  return (
    <div className="min-w-0 rounded-[26px] border border-outline-variant/70 bg-surface-container p-5 shadow-[0_10px_28px_rgba(31,35,54,0.05)]">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold text-on-surface-variant">{label}</p>
          <p className="mt-2 text-[30px] font-bold tracking-tight text-on-surface">{value}</p>
        </div>
        <div className={`flex h-10 w-10 items-center justify-center rounded-2xl ${toneClass}`}>
          <span className="material-symbols-outlined text-[20px]">{icon}</span>
        </div>
      </div>
      <p className="mt-4 text-[11px] text-on-surface-variant">{hint}</p>
    </div>
  );
}

function GroupWorkspacePreview({ groups, loading }: { groups: Group[]; loading: boolean }) {
  return (
    <section className="min-w-0 rounded-[24px] border border-outline-variant/70 bg-surface-container p-5 shadow-[0_10px_28px_rgba(31,35,54,0.05)] xl:col-span-2">
      <div className="mb-4 flex items-center justify-between gap-4">
        <div>
          <p className="text-[15px] font-bold text-on-surface">Your groups</p>
          <p className="mt-1 text-[11px] text-on-surface-variant">Jump back into the shared expenses that matter.</p>
        </div>
        <Link to="/groups" className="text-[11px] font-bold text-primary hover:underline">View all</Link>
      </div>

      {loading ? (
        <div className="flex flex-col gap-3 animate-pulse">
          {[1, 2, 3].map((item) => <div key={item} className="h-[74px] rounded-2xl bg-surface-variant" />)}
        </div>
      ) : groups.length === 0 ? (
        <div className="flex min-h-[208px] flex-col items-center justify-center px-4 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary"><span className="material-symbols-outlined">group_add</span></div>
          <p className="mt-3 text-[13px] font-bold text-on-surface">Start your first group</p>
          <p className="mt-1 max-w-xs text-[11px] leading-relaxed text-on-surface-variant">Create a shared space for a trip, home, or team—then add expenses as they happen.</p>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {groups.slice(0, 3).map((group, index) => (
            <Link key={group.id} to={`/groups/${group.id}`} className="group flex min-w-0 items-center gap-3 rounded-2xl border border-transparent px-2 py-2 transition-colors hover:border-outline-variant hover:bg-surface-container-low">
              <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br ${GROUP_ACCENTS[index % GROUP_ACCENTS.length]} text-[13px] font-bold text-white shadow-sm`}>
                {getInitials(group.name)}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-[13px] font-bold text-on-surface">{group.name}</p>
                <p className="mt-0.5 truncate text-[11px] text-on-surface-variant">{group.description || "A shared expense workspace"}</p>
              </div>
              <div className="hidden items-center gap-2 sm:flex">
                <div className="flex -space-x-2">
                  {group.members.slice(0, 3).map((member, memberIndex) => (
                    <span key={member.id} className={`avatar avatar-sm avatar-${(index + memberIndex) % 6} !h-6 !w-6 !text-[8px] ring-2 ring-surface-container`} title={member.user.name}>{getInitials(member.user.name)}</span>
                  ))}
                </div>
                <span className="text-[10px] font-medium text-on-surface-variant">{group._count.transactions} expenses</span>
              </div>
              <span className="material-symbols-outlined text-[18px] text-outline transition-colors group-hover:text-primary">arrow_forward</span>
            </Link>
          ))}
        </div>
      )}
    </section>
  );
}

function SettlementPanel({ pending, pendingGroups }: { pending: number; pendingGroups: PendingSettlementGroup[] }) {
  const hasPending = pending > 0;

  return (
    <section className="min-w-0 rounded-[24px] border border-outline-variant/70 bg-surface-container p-5 shadow-[0_10px_28px_rgba(31,35,54,0.05)]">
      <div className="flex items-center justify-between">
        <p className="text-[15px] font-bold text-on-surface">Settle-up check</p>
        <div className={`flex h-9 w-9 items-center justify-center rounded-xl ${hasPending ? "bg-warning/10 text-warning" : "bg-secondary/10 text-secondary"}`}>
          <span className="material-symbols-outlined text-[19px]">{hasPending ? "pending_actions" : "task_alt"}</span>
        </div>
      </div>
      <div className="mt-5">
        <p className="text-[32px] font-bold tracking-tight text-on-surface">{pending}</p>
        <p className="mt-1 text-[13px] font-semibold text-on-surface">{hasPending ? `payment${pending === 1 ? "" : "s"} waiting for confirmation` : "pending payments"}</p>
        <p className="mt-2 text-[11px] leading-relaxed text-on-surface-variant">{hasPending ? "Open an affected group to review and confirm its pending settlement payments." : "There are no settlement payments waiting for confirmation."}</p>
      </div>
      {hasPending && (
        <div className="mt-5 flex max-h-[190px] flex-col gap-2 overflow-y-auto pr-1">
          {pendingGroups.length > 0 ? pendingGroups.map((group) => (
            <Link
              key={group.groupId}
              to={`/groups/${group.groupId}?status=pending`}
              className="group flex min-w-0 items-center gap-3 rounded-xl border border-outline-variant/70 bg-surface-container-high px-3 py-2.5 transition-colors hover:border-primary/30 hover:bg-surface-container-highest"
            >
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-warning/10 text-warning">
                <span className="material-symbols-outlined text-[17px]">pending_actions</span>
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-[11px] font-bold text-on-surface">{group.groupName}</p>
                <p className="mt-0.5 text-[10px] text-on-surface-variant">{group.pendingCount} pending payment{group.pendingCount === 1 ? "" : "s"}</p>
              </div>
              <span className="material-symbols-outlined text-[17px] text-outline transition-colors group-hover:text-primary">arrow_forward</span>
            </Link>
          )) : (
            <p className="rounded-xl bg-surface-container-high px-3 py-3 text-[10px] leading-relaxed text-on-surface-variant">Affected groups will appear here after the API update is deployed.</p>
          )}
        </div>
      )}
    </section>
  );
}

function SpendingTrend({ data, totalVolume }: { data: MonthlyVolume[]; totalVolume: number }) {
  const maxVolume = Math.max(...data.map((item) => item.volume), 1);

  return (
    <section className="min-w-0 rounded-[24px] border border-outline-variant/70 bg-surface-container p-5 shadow-[0_10px_28px_rgba(31,35,54,0.05)] xl:col-span-3">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-[15px] font-bold text-on-surface">Shared spending</p>
          <p className="mt-1 text-[11px] text-on-surface-variant">The last six months across your groups.</p>
        </div>
        <div className="text-right">
          <p className="text-[20px] font-bold tracking-tight text-on-surface">{formatCurrency(totalVolume)}</p>
          <p className="mt-0.5 text-[10px] font-medium text-on-surface-variant">tracked total</p>
        </div>
      </div>
      <div className="mt-7 flex h-[156px] items-end gap-2 sm:gap-4">
        {data.map((item, index) => {
          const isCurrent = index === data.length - 1;
          const height = Math.max((item.volume / maxVolume) * 100, 4);
          const label = new Date(`${item.month}-01T00:00:00`).toLocaleDateString("en-US", { month: "short" });
          return (
            <div key={item.month} className="group flex h-full flex-1 flex-col justify-end" title={`${label}: ${formatCurrency(item.volume)}`}>
              <div className="relative flex flex-1 items-end">
                <div className={`w-full rounded-t-xl transition-all duration-200 group-hover:brightness-105 ${isCurrent ? "bg-gradient-to-t from-[#5133db] to-[#a186ff] shadow-[0_8px_18px_rgba(105,71,244,0.22)]" : "bg-primary/15 group-hover:bg-primary/25"}`} style={{ height: `${height}%` }} />
              </div>
              <span className={`mt-3 truncate text-center text-[10px] font-semibold ${isCurrent ? "text-primary" : "text-on-surface-variant"}`}>{label}</span>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function ActivityStream({ entries }: { entries: AuditLogEntry[] }) {
  return (
    <section className="min-w-0 rounded-[24px] border border-outline-variant/70 bg-surface-container p-5 shadow-[0_10px_28px_rgba(31,35,54,0.05)] xl:col-span-2">
      <div className="mb-4 flex items-center justify-between gap-4">
        <div>
          <p className="text-[15px] font-bold text-on-surface">Recent activity</p>
          <p className="mt-1 text-[11px] text-on-surface-variant">A concise log of your groups.</p>
        </div>
        <Link to="/ledger?tab=activity" className="text-[11px] font-bold text-primary hover:underline">All activity</Link>
      </div>
      {entries.length === 0 ? (
        <div className="flex min-h-[150px] flex-col items-center justify-center text-center">
          <span className="material-symbols-outlined text-[28px] text-outline">history</span>
          <p className="mt-2 text-[12px] font-semibold text-on-surface">No recent activity</p>
          <p className="mt-1 text-[11px] text-on-surface-variant">New expenses and settlements will appear here.</p>
        </div>
      ) : (
        <div className="flex max-h-[220px] flex-col overflow-y-auto">
          {entries.map((entry) => {
            const meta = ACTION_ICONS[entry.action] ?? { icon: "info", color: "text-on-surface-variant" };
            return (
              <div key={entry.id} className="flex gap-3 border-b border-outline-variant/50 py-3 last:border-0 first:pt-0">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-surface-container-high">
                  <span className={`material-symbols-outlined text-[16px] ${meta.color}`}>{meta.icon}</span>
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[12px] leading-relaxed text-on-surface"><span className="font-bold">{entry.user.name.split(" ")[0]}</span>{" "}<span className="text-on-surface-variant">{entry.details || entry.action.replace(/_/g, " ").toLowerCase()}</span></p>
                  <div className="mt-1 flex flex-wrap items-center gap-2 text-[10px] text-on-surface-variant">
                    <span>{relativeTime(entry.createdAt)}</span>
                    {entry.group && <span className="rounded-full bg-primary/10 px-2 py-0.5 font-semibold text-primary">{entry.group.name}</span>}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
