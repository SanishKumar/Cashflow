/**
 * Dashboard Page — Analytics Overview
 *
 * KPI cards, 6-month volume chart, and recent activity feed.
 * Clean, functional layout without clutter.
 */

import { useApi } from "../hooks/useApi";
import { dashboardApi } from "../lib/api";
import { Link } from "react-router-dom";
import { useState } from "react";
import type { DashboardStats, AuditLogEntry, MonthlyVolume } from "../types/index";

const ACTION_ICONS: Record<string, { icon: string; color: string }> = {
  GROUP_CREATED: { icon: "group_add", color: "text-primary" },
  GROUP_DELETED: { icon: "delete_forever", color: "text-error" },
  MEMBER_ADDED: { icon: "person_add", color: "text-secondary" },
  MEMBER_REMOVED: { icon: "person_remove", color: "text-warning" },
  MEMBER_LEFT: { icon: "exit_to_app", color: "text-on-surface-variant" },
  EXPENSE_ADDED: { icon: "receipt", color: "text-positive" },
  EXPENSE_DELETED: { icon: "receipt_long", color: "text-error" },
  ROLE_CHANGED: { icon: "shield", color: "text-primary" },
  TRANSACTION_COMPLETED: { icon: "check_circle", color: "text-positive" },
  TRANSACTION_PENDING: { icon: "schedule", color: "text-warning" },
  TRANSACTION_REJECTED: { icon: "cancel", color: "text-error" },
  USER_LOGIN: { icon: "login", color: "text-on-surface-variant" },
  USER_REGISTER: { icon: "person_add", color: "text-primary" },
};

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(Math.abs(amount));
}

function relativeTime(dateStr: string): string {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diff = now - then;
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(dateStr).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function formatMonthLabel(month: string): string {
  const [year, m] = month.split("-");
  const date = new Date(Number(year), Number(m) - 1);
  return date.toLocaleDateString("en-US", { month: "short" });
}

export function DashboardPage() {
  const { data: stats, loading, error } = useApi<DashboardStats>(() => dashboardApi.getStats());

  if (loading) {
    return (
      <div className="h-full flex flex-col">
        <header className="h-14 border-b border-outline-variant/30 flex items-center pl-14 md:px-6 pr-6 bg-surface-container/50 shrink-0">
          <div className="flex items-center gap-3">
            <span className="material-symbols-outlined text-on-surface-variant text-[20px]">space_dashboard</span>
            <h2 className="text-[15px] font-semibold text-on-surface">Dashboard</h2>
          </div>
        </header>
        <div className="flex-1 overflow-auto p-6">
          <div className="grid grid-cols-2 xl:grid-cols-4 gap-4 mb-6">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="glass-panel-sm p-5 h-[100px] animate-pulse">
                <div className="h-3 bg-surface-variant rounded w-1/2 mb-3" />
                <div className="h-5 bg-surface-variant rounded w-1/3" />
              </div>
            ))}
          </div>
          <div className="glass-panel-sm p-6 h-[220px] animate-pulse mb-6">
            <div className="h-3 bg-surface-variant rounded w-1/4" />
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="h-full flex flex-col items-center justify-center gap-4 animate-fade-in">
        <div className="w-16 h-16 rounded-2xl bg-glow-error flex items-center justify-center">
          <span className="material-symbols-outlined text-error text-[32px]">cloud_off</span>
        </div>
        <p className="text-[14px] font-medium text-on-surface">Unable to load dashboard</p>
        <p className="text-[13px] text-on-surface-variant">{error}</p>
      </div>
    );
  }

  if (!stats) return null;

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <header className="h-14 border-b border-outline-variant/30 flex items-center pl-14 md:px-6 pr-6 justify-between bg-surface-container/50 shrink-0">
        <div className="flex items-center gap-3">
          <span className="material-symbols-outlined text-on-surface-variant text-[20px]">space_dashboard</span>
          <h2 className="text-[15px] font-semibold text-on-surface">Dashboard</h2>
        </div>
        <Link to="/groups" className="btn-primary !h-8 !px-4 !text-[12px]">
          <span className="material-symbols-outlined text-[14px]">add</span>
          New Group
        </Link>
      </header>

      <div className="flex-1 overflow-auto p-6 animate-fade-in">
        {/* KPI Cards */}
        <div className="grid grid-cols-2 xl:grid-cols-4 gap-4 mb-6">
          <KPICard
            icon="group"
            label="Groups"
            value={String(stats.totalGroups)}
            color="primary"
          />
          <KPICard
            icon="receipt_long"
            label="Transactions"
            value={String(stats.totalTransactions)}
            color="secondary"
          />
          <KPICard
            icon="account_balance_wallet"
            label="Net Position"
            value={`${stats.netPosition >= 0 ? "+" : "-"}${formatCurrency(stats.netPosition)}`}
            color={stats.netPosition >= 0 ? "positive" : "negative"}
            subtitle={stats.netPosition >= 0 ? "Others owe you" : "You owe others"}
          />
          <KPICard
            icon="pending_actions"
            label="Pending"
            value={String(stats.pendingSettlements)}
            color={stats.pendingSettlements > 0 ? "warning" : "neutral"}
            subtitle={stats.pendingSettlements > 0 ? "Need attention" : "All settled"}
          />
        </div>

        {/* Chart + Activity side by side on large screens, stacked on small */}
        <div className="grid grid-cols-1 xl:grid-cols-5 gap-6">
          {/* Volume Chart */}
          <div className="xl:col-span-3">
            <VolumeChart data={stats.monthlyVolume} totalVolume={stats.totalVolume} />
          </div>

          {/* Recent Activity */}
          <div className="xl:col-span-2">
            <ActivityFeed entries={stats.recentActivity} />
          </div>
        </div>
      </div>
    </div>
  );
}

// ── KPI Card ──────────────────────────────

function KPICard({
  icon,
  label,
  value,
  color,
  subtitle,
}: {
  icon: string;
  label: string;
  value: string;
  color: string;
  subtitle?: string;
}) {
  const colorMap: Record<string, { icon: string; value: string; glow: string }> = {
    primary: { icon: "text-primary", value: "text-primary", glow: "bg-glow-primary" },
    secondary: { icon: "text-secondary", value: "text-secondary", glow: "bg-glow-secondary" },
    positive: { icon: "text-secondary", value: "text-secondary", glow: "bg-glow-secondary" },
    negative: { icon: "text-error", value: "text-error", glow: "bg-glow-error" },
    warning: { icon: "text-warning", value: "text-warning", glow: "bg-warning/10" },
    neutral: { icon: "text-on-surface-variant", value: "text-on-surface-variant", glow: "bg-surface-variant" },
  };

  const c = colorMap[color] ?? colorMap.neutral;

  return (
    <div className="glass-panel-sm p-5 flex flex-col gap-2 group hover:border-outline/50 transition-all duration-200">
      <div className="flex items-center justify-between">
        <span className="text-label text-[10px]">{label}</span>
        <div className={`w-7 h-7 rounded-lg ${c.glow} flex items-center justify-center`}>
          <span className={`material-symbols-outlined text-[16px] ${c.icon}`}>{icon}</span>
        </div>
      </div>
      <span className={`text-data-lg ${c.value}`}>{value}</span>
      {subtitle && (
        <span className="text-[10px] text-on-surface-variant -mt-1">{subtitle}</span>
      )}
    </div>
  );
}

// ── Volume Chart (Pure CSS bar chart) ──────────────────────

function VolumeChart({ data, totalVolume }: { data: MonthlyVolume[]; totalVolume: number }) {
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);
  const maxVolume = Math.max(...data.map((d) => d.volume), 1);

  return (
    <div className="glass-panel-sm p-5">
      <div className="flex items-center justify-between mb-5">
        <div>
          <h3 className="text-[13px] font-semibold text-on-surface">Transaction Volume</h3>
          <p className="text-[11px] text-on-surface-variant mt-0.5">Last 6 months</p>
        </div>
        <div className="text-right">
          <span className="text-data-lg text-secondary">{formatCurrency(totalVolume)}</span>
          <p className="text-[10px] text-on-surface-variant">Total volume</p>
        </div>
      </div>

      {/* Bar chart */}
      <div className="flex items-end gap-3 h-[140px]">
        {data.map((d, i) => {
          const heightPct = maxVolume > 0 ? (d.volume / maxVolume) * 100 : 0;
          const isHovered = hoveredIdx === i;
          const isCurrentMonth = i === data.length - 1;

          return (
            <div
              key={d.month}
              className="flex-1 flex flex-col items-center gap-2 relative"
              onMouseEnter={() => setHoveredIdx(i)}
              onMouseLeave={() => setHoveredIdx(null)}
            >
              {/* Tooltip */}
              {isHovered && d.volume > 0 && (
                <div className="absolute -top-8 left-1/2 -translate-x-1/2 bg-surface-container-highest text-on-surface text-[10px] font-mono px-2 py-1 rounded shadow-lg border border-outline-variant/30 whitespace-nowrap z-10 animate-fade-in">
                  {formatCurrency(d.volume)}
                </div>
              )}

              {/* Bar */}
              <div className="w-full flex justify-center" style={{ height: "140px" }}>
                <div
                  className={`w-full max-w-[40px] rounded-t-md transition-all duration-300 ${
                    isCurrentMonth
                      ? "bg-gradient-to-t from-primary-container to-primary/80"
                      : isHovered
                        ? "bg-primary/50"
                        : "bg-surface-variant"
                  }`}
                  style={{
                    height: `${Math.max(heightPct, 2)}%`,
                    marginTop: "auto",
                  }}
                />
              </div>

              {/* Label */}
              <span className={`text-[10px] font-medium ${isCurrentMonth ? "text-primary" : "text-on-surface-variant"}`}>
                {formatMonthLabel(d.month)}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Activity Feed ──────────────────────────────

function ActivityFeed({ entries }: { entries: AuditLogEntry[] }) {
  return (
    <div className="glass-panel-sm p-5 flex flex-col">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-[13px] font-semibold text-on-surface">Recent Activity</h3>
        <Link to="/ledger" className="text-[11px] text-primary font-medium hover:underline">
          View all
        </Link>
      </div>

      {entries.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center py-8 gap-3">
          <span className="material-symbols-outlined text-outline text-[28px]">history</span>
          <p className="text-[12px] text-on-surface-variant">No recent activity</p>
        </div>
      ) : (
        <div className="flex flex-col gap-0.5 overflow-y-auto max-h-[260px]">
          {entries.map((entry, i) => {
            const meta = ACTION_ICONS[entry.action] ?? { icon: "info", color: "text-on-surface-variant" };
            return (
              <div
                key={entry.id}
                className="flex items-start gap-3 p-2.5 rounded-lg hover:bg-glass-hover transition-colors animate-slide-up"
                style={{ animationDelay: `${i * 30}ms` }}
              >
                <div className={`w-7 h-7 rounded-md bg-surface-variant flex items-center justify-center shrink-0 mt-0.5`}>
                  <span className={`material-symbols-outlined text-[14px] ${meta.color}`}>{meta.icon}</span>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[12px] text-on-surface leading-tight">
                    <span className="font-semibold">{entry.user.name.split(" ")[0]}</span>{" "}
                    <span className="text-on-surface-variant">
                      {entry.details || entry.action.replace(/_/g, " ").toLowerCase()}
                    </span>
                  </p>
                  <div className="flex items-center gap-2 mt-1">
                    <span className="text-[10px] text-on-surface-variant">{relativeTime(entry.createdAt)}</span>
                    {entry.group && (
                      <span className="text-[9px] text-primary bg-primary/10 px-1.5 py-0.5 rounded-full font-medium">
                        {entry.group.name}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
