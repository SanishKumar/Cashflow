// ──────────────────────────────────────────────
// Sidebar Navigation — v2.1 Modernized
// ──────────────────────────────────────────────

import { NavLink, useNavigate, useSearchParams } from "react-router-dom";

interface SidebarProps {
  syncActive?: boolean;
}

const navItems = [
  { to: "/", icon: "dashboard", label: "Groups", end: true },
  { to: "/ledger", icon: "receipt_long", label: "Ledger", end: false },
  { to: "/settings", icon: "tune", label: "Settings", end: false },
];

export function Sidebar({ syncActive = false }: SidebarProps) {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const searchQuery = searchParams.get("q") || "";

  const handleSearch = (e: React.ChangeEvent<HTMLInputElement>) => {
    const q = e.target.value;
    if (q) {
      navigate(`/?q=${encodeURIComponent(q)}`, { replace: true });
    } else {
      navigate(`/`, { replace: true });
    }
  };

  return (
    <nav className="shrink-0 h-full w-[240px] bg-surface-container flex flex-col border-r border-outline-variant/50">
      {/* Brand */}
      <div className="px-5 pt-5 pb-4">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-primary-container to-[#4f46e5] flex items-center justify-center">
            <span className="material-symbols-outlined text-white text-[18px]">account_balance</span>
          </div>
          <div>
            <h1 className="text-[15px] font-bold text-on-surface tracking-tight">CashFlow</h1>
            <p className="text-[10px] text-on-surface-variant font-medium tracking-wider">v2.1 • STABLE</p>
          </div>
        </div>
      </div>

      {/* Search */}
      <div className="px-4 pb-3">
        <div className="relative">
          <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-[16px] text-on-surface-variant pointer-events-none">
            search
          </span>
          <input
            className="input-field !pl-9 !py-2 !text-[12px] !rounded-lg"
            placeholder="Search groups..."
            type="text"
            value={searchQuery}
            onChange={handleSearch}
          />
        </div>
      </div>

      {/* Navigation */}
      <div className="flex-1 overflow-y-auto px-3 flex flex-col gap-0.5">
        <p className="text-section-title px-3 pt-2 pb-2">Navigation</p>
        {navItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            className={({ isActive }) =>
              `flex items-center gap-3 h-9 px-3 rounded-lg transition-all duration-150 text-[13px] font-medium ${
                isActive
                  ? "bg-glow-primary text-primary shadow-[inset_0_0_0_1px_rgba(139,156,247,0.2)]"
                  : "text-on-surface-variant hover:text-on-surface hover:bg-glass-hover"
              }`
            }
          >
            <span className="material-symbols-outlined text-[18px]">{item.icon}</span>
            {item.label}
          </NavLink>
        ))}
      </div>

      {/* Footer */}
      <div className="px-3 pb-3 flex flex-col gap-0.5">
        <div className="h-px bg-outline-variant/30 mx-3 mb-2" />
        <NavLink
          to="/profile"
          className={({ isActive }) =>
            `flex items-center gap-3 h-9 px-3 rounded-lg transition-all duration-150 text-[13px] font-medium ${
              isActive
                ? "bg-glow-primary text-primary"
                : "text-on-surface-variant hover:text-on-surface hover:bg-glass-hover"
            }`
          }
        >
          <span className="material-symbols-outlined text-[18px]">person</span>
          Profile
        </NavLink>

        {/* Sync Status */}
        <div className="flex items-center gap-2 px-3 py-2 mt-1 rounded-lg bg-surface-dim">
          <span className="relative flex h-2 w-2">
            {syncActive && (
              <span className="animate-sync-ping absolute inline-flex h-full w-full rounded-full bg-secondary opacity-75" />
            )}
            <span
              className={`relative inline-flex h-2 w-2 rounded-full ${
                syncActive ? "bg-secondary" : "bg-outline"
              }`}
            />
          </span>
          <span className="text-[11px] text-on-surface-variant font-medium">
            {syncActive ? "Live Sync" : "Offline"}
          </span>
        </div>
      </div>
    </nav>
  );
}
