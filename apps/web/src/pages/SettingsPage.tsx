// ──────────────────────────────────────────────
// Settings Page — App Configuration & Status
// ──────────────────────────────────────────────

import { useState } from "react";
import { useApi } from "../hooks/useApi";

export function SettingsPage() {
  const { data: health, loading } = useApi<{ status: string; uptime: number; version: string }>(async () => {
    const res = await fetch("/api/health");
    return res.json();
  });

  const [theme] = useState<"dark" | "light">("dark");

  return (
    <div className="h-full flex flex-col">
      <header className="h-14 border-b border-outline-variant/30 flex items-center px-6 bg-surface-container/50 shrink-0">
        <span className="material-symbols-outlined text-on-surface-variant text-[20px] mr-3">tune</span>
        <h2 className="text-[15px] font-semibold text-on-surface">Settings</h2>
      </header>

      <div className="flex-1 overflow-auto px-6 py-6">
        <div className="max-w-2xl flex flex-col gap-6">
          {/* Appearance */}
          <section>
            <h3 className="text-section-title mb-4">Appearance</h3>
            <div className="glass-panel-sm p-4 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-surface-variant flex items-center justify-center">
                  <span className="material-symbols-outlined text-on-surface-variant text-[20px]">
                    {theme === "dark" ? "dark_mode" : "light_mode"}
                  </span>
                </div>
                <div>
                  <p className="text-[13px] font-medium text-on-surface">Theme</p>
                  <p className="text-[12px] text-on-surface-variant">Currently using dark mode</p>
                </div>
              </div>
              <div className="flex gap-1 bg-surface-variant/50 rounded-lg p-0.5">
                <button className={`h-8 px-3 rounded-md text-[12px] font-medium transition-all ${
                  theme === "dark" ? "bg-surface-container-high text-on-surface shadow-sm" : "text-on-surface-variant"
                }`}>
                  Dark
                </button>
                <button className="h-8 px-3 rounded-md text-[12px] font-medium text-on-surface-variant cursor-not-allowed opacity-50" title="Coming soon">
                  Light
                </button>
              </div>
            </div>
          </section>

          {/* Server Status */}
          <section>
            <h3 className="text-section-title mb-4">Server Status</h3>
            <div className="glass-panel-sm overflow-hidden">
              {loading ? (
                <div className="p-4 animate-pulse">
                  <div className="h-4 w-32 bg-surface-variant rounded mb-2" />
                  <div className="h-3 w-48 bg-surface-variant rounded" />
                </div>
              ) : health ? (
                <div className="divide-y divide-glass-border">
                  <StatusRow label="API Status" value={health.status} badge="online" />
                  <StatusRow label="Version" value={health.version || "2.1.0"} />
                  <StatusRow label="Uptime" value={formatUptime(health.uptime)} />
                  <StatusRow label="API Endpoint" value="/api" mono />
                  <StatusRow label="WebSocket" value="ws://localhost:4000" mono />
                </div>
              ) : (
                <div className="p-4 flex items-center gap-2 text-error text-[13px]">
                  <span className="material-symbols-outlined text-[16px]">error</span>
                  Unable to reach API server
                </div>
              )}
            </div>
          </section>

          {/* Database */}
          <section>
            <h3 className="text-section-title mb-4">Infrastructure</h3>
            <div className="grid grid-cols-2 gap-4">
              <div className="glass-panel-sm p-4 flex items-start gap-3">
                <div className="w-10 h-10 rounded-lg bg-glow-primary flex items-center justify-center shrink-0">
                  <span className="material-symbols-outlined text-primary text-[20px]">database</span>
                </div>
                <div>
                  <p className="text-[13px] font-medium text-on-surface">PostgreSQL</p>
                  <p className="text-[11px] text-on-surface-variant mt-0.5">Neon Serverless</p>
                  <p className="text-[10px] text-secondary mt-1 font-medium">Connected</p>
                </div>
              </div>
              <div className="glass-panel-sm p-4 flex items-start gap-3">
                <div className="w-10 h-10 rounded-lg bg-glow-error flex items-center justify-center shrink-0">
                  <span className="material-symbols-outlined text-tertiary text-[20px]">bolt</span>
                </div>
                <div>
                  <p className="text-[13px] font-medium text-on-surface">Redis</p>
                  <p className="text-[11px] text-on-surface-variant mt-0.5">Upstash (TLS)</p>
                  <p className="text-[10px] text-secondary mt-1 font-medium">Connected</p>
                </div>
              </div>
            </div>
          </section>

          {/* About */}
          <section>
            <h3 className="text-section-title mb-4">About</h3>
            <div className="glass-panel-sm p-4">
              <p className="text-[13px] text-on-surface leading-relaxed">
                <strong>CashFlow</strong> is an enterprise-grade debt minimization platform using a Max Heap greedy
                algorithm (O(N log N)) to compute optimal settlement paths across complex financial networks.
              </p>
              <div className="flex gap-4 mt-3 pt-3 border-t border-glass-border">
                <div>
                  <span className="text-[10px] text-on-surface-variant uppercase font-medium">Algorithm</span>
                  <p className="text-[12px] text-on-surface font-medium mt-0.5">Max Heap (C++ → WASM)</p>
                </div>
                <div>
                  <span className="text-[10px] text-on-surface-variant uppercase font-medium">Real-Time</span>
                  <p className="text-[12px] text-on-surface font-medium mt-0.5">Socket.io + Redis Pub/Sub</p>
                </div>
                <div>
                  <span className="text-[10px] text-on-surface-variant uppercase font-medium">License</span>
                  <p className="text-[12px] text-on-surface font-medium mt-0.5">MIT</p>
                </div>
              </div>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}

function StatusRow({ label, value, badge, mono }: { label: string; value: string; badge?: string; mono?: boolean }) {
  return (
    <div className="flex items-center justify-between px-4 py-3">
      <span className="text-[13px] text-on-surface-variant">{label}</span>
      <div className="flex items-center gap-2">
        <span className={`text-[13px] font-medium text-on-surface ${mono ? "font-mono text-[12px]" : ""}`}>{value}</span>
        {badge === "online" && (
          <span className="flex h-2 w-2 rounded-full bg-secondary" />
        )}
      </div>
    </div>
  );
}

function formatUptime(seconds: number): string {
  if (!seconds) return "N/A";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}
