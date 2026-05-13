// ──────────────────────────────────────────────
// Profile Page — User Info & Members Directory
// ──────────────────────────────────────────────

import { useApi } from "../hooks/useApi";
import { userApi } from "../lib/api";

function getInitials(name: string): string {
  return name.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2);
}

export function ProfilePage() {
  const { data: users, loading } = useApi(() => userApi.list());

  return (
    <div className="h-full flex flex-col">
      <header className="h-14 border-b border-outline-variant/30 flex items-center pl-14 md:px-6 pr-6 bg-surface-container/50 shrink-0">
        <span className="material-symbols-outlined text-on-surface-variant text-[20px] mr-3">person</span>
        <h2 className="text-[15px] font-semibold text-on-surface">Profile & Members</h2>
      </header>

      <div className="flex-1 overflow-auto px-6 py-6">
        <div className="max-w-2xl flex flex-col gap-6">
          {/* Members Directory */}
          <section>
            <h3 className="text-section-title mb-4">Members Directory</h3>
            <p className="text-[13px] text-on-surface-variant mb-4">
              All registered users across your CashFlow workspace.
            </p>
            {loading ? (
              <div className="flex flex-col gap-2">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="glass-panel-sm p-4 h-16 animate-pulse" />
                ))}
              </div>
            ) : (
              <div className="flex flex-col gap-2">
                {users?.map((user, i) => (
                  <div key={user.id} className="glass-panel-sm p-4 flex items-center gap-4 hover:border-outline transition-colors">
                    <div className={`avatar avatar-lg avatar-${i % 6}`}>
                      {getInitials(user.name)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-[14px] font-semibold text-on-surface">{user.name}</p>
                      <p className="text-[12px] text-on-surface-variant">{user.email}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-[11px] text-on-surface-variant">Member since</p>
                      <p className="text-data text-[12px] text-on-surface">
                        {new Date(user.createdAt).toLocaleDateString("en-US", { month: "short", year: "numeric" })}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
