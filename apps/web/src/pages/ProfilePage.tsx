// ──────────────────────────────────────────────
// Profile Page — User Info & Members Directory
// ──────────────────────────────────────────────

import { useApi } from "../hooks/useApi";
import { userApi } from "../lib/api";
import { useUser } from "../contexts/UserContext";

function getInitials(name: string): string {
  return name.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2);
}

export function ProfilePage() {
  const { data: users, loading } = useApi(() => userApi.list());
  const { currentUser } = useUser();

  return (
    <div className="h-full flex flex-col">
      <header className="shrink-0 px-4 pb-3 pt-5 md:px-8 md:pb-4 md:pt-7">
        <p className="mb-1 text-[10px] font-bold uppercase tracking-[0.14em] text-primary">People</p>
        <h2 className="text-[24px] font-bold tracking-tight text-on-surface">Profile & members</h2>
        <p className="mt-1 text-[12px] text-on-surface-variant">Your account and the people available to add to groups.</p>
      </header>

      <div className="mobile-scroll-safe flex-1 overflow-auto px-4 pb-6 md:px-8 md:pb-8">
        <div className="max-w-3xl flex flex-col gap-6">
          {currentUser && (
            <section>
              <h3 className="text-section-title mb-4">Your account</h3>
              <div className="flex items-center gap-4 rounded-2xl border border-primary/15 bg-surface-container p-5 shadow-[0_8px_20px_rgba(31,35,54,0.04)]">
                <div className="avatar avatar-lg avatar-0 !h-12 !w-12 !text-[14px]">{getInitials(currentUser.name)}</div>
                <div className="min-w-0">
                  <p className="truncate text-[15px] font-bold text-on-surface">{currentUser.name}</p>
                  <p className="truncate text-[12px] text-on-surface-variant">{currentUser.email}</p>
                </div>
              </div>
            </section>
          )}

          {/* Members Directory */}
          <section>
            <h3 className="text-section-title mb-4">Members Directory</h3>
            <p className="text-[13px] text-on-surface-variant mb-4">
              All registered users across your CashFlow workspace.
            </p>
            {loading ? (
              <div className="flex flex-col gap-2">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="h-20 rounded-2xl bg-surface-variant animate-pulse" />
                ))}
              </div>
            ) : (
              <div className="flex flex-col gap-2">
                {users?.map((user, i) => (
                  <div key={user.id} className="flex items-center gap-4 rounded-2xl border border-outline-variant/70 bg-surface-container p-4 shadow-[0_8px_20px_rgba(31,35,54,0.04)] transition-colors hover:border-primary/25">
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
