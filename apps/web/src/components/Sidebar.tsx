// ──────────────────────────────────────────────
// Sidebar Navigation — v3.0 Identity-Aware
// ──────────────────────────────────────────────

import { useRef } from "react";
import { Link, NavLink } from "react-router-dom";
import { useUser } from "../contexts/UserContext";
import { useTheme } from "../contexts/ThemeContext";
import { BrandMark } from "./BrandMark";

interface SidebarProps {
  onClose?: () => void;
}

const navItems = [
  { to: "/", icon: "space_dashboard", label: "Dashboard", end: true },
  { to: "/groups", icon: "group", label: "Groups", end: false },
  { to: "/ledger", icon: "receipt_long", label: "Ledger", end: false },
  { to: "/settings", icon: "tune", label: "Settings", end: false },
];

function getInitials(name: string): string {
  return name.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2);
}

export function Sidebar({ onClose }: SidebarProps) {
  const { currentUser, logout } = useUser();
  const { theme, toggleTheme } = useTheme();
  const swipeStartX = useRef<number | null>(null);

  const handleSignOut = async () => {
    await logout();
    window.location.href = "/login";
  };

  const handleTouchStart = (event: React.TouchEvent<HTMLElement>) => {
    swipeStartX.current = event.touches[0]?.clientX ?? null;
  };

  const handleTouchEnd = (event: React.TouchEvent<HTMLElement>) => {
    const startX = swipeStartX.current;
    const endX = event.changedTouches[0]?.clientX;
    swipeStartX.current = null;

    // The panel enters from the left, so a deliberate left swipe dismisses it.
    if (onClose && startX !== null && endX !== undefined && startX - endX > 64) {
      onClose();
    }
  };

  return (
    <nav
      className="shrink-0 h-full w-[286px] md:w-[264px] bg-surface-container flex flex-col border-r border-outline-variant/70"
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
    >
      {/* Brand */}
      <div className="px-6 pt-7 pb-6 flex items-center justify-between">
        <Link to="/" className="flex items-center gap-3" onClick={onClose}>
          <BrandMark className="h-10 w-10 shrink-0 drop-shadow-[0_8px_14px_rgba(105,71,244,0.22)]" />
          <div>
            <h1 className="text-[19px] font-bold text-on-surface tracking-tight">CashFlow</h1>
            <p className="text-[10px] text-on-surface-variant font-medium">Shared expenses</p>
          </div>
        </Link>
        {onClose && (
          <button 
            onClick={onClose}
            className="touch-target inline-flex items-center justify-center md:hidden rounded-md text-on-surface-variant hover:bg-surface-variant transition-colors"
          >
            <span className="material-symbols-outlined text-[20px]">close</span>
          </button>
        )}
      </div>

      {/* Navigation */}
      <div className="flex-1 overflow-y-auto px-4 flex flex-col gap-1.5">
        <p className="text-[10px] font-bold tracking-[0.14em] text-on-surface-variant/70 px-2 pb-2">WORKSPACE</p>
        {navItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            onClick={onClose}
            className={({ isActive }) =>
              `flex items-center gap-3 h-11 px-3.5 rounded-xl transition-all duration-150 text-[13px] font-semibold ${
                isActive
                  ? "bg-primary/10 text-primary shadow-[inset_3px_0_0_var(--color-primary)]"
                  : "text-on-surface-variant hover:text-on-surface hover:bg-glass-hover"
              }`
            }
          >
            <span className="material-symbols-outlined text-[18px]">{item.icon}</span>
            {item.label}
          </NavLink>
        ))}
        <div className="mt-6 px-1">
          <Link
            to="/groups?create=1"
            onClick={onClose}
            className="h-11 rounded-xl bg-primary text-on-primary flex items-center justify-center gap-2 text-[12px] font-bold shadow-lg shadow-primary/20 hover:brightness-105 transition-all"
          >
            <span className="material-symbols-outlined text-[18px]">group_add</span>
            New group
          </Link>
        </div>
      </div>

      {/* Footer — User Identity */}
      <div className="px-4 pb-5 flex flex-col gap-2">
        <div className="h-px bg-outline-variant/70 mx-1 mb-3" />

        {/* Signed-in User Profile */}
        {currentUser && (
          <div className="flex items-center gap-1 px-2 py-2 rounded-xl hover:bg-glass-hover transition-colors">
            <Link to="/profile" onClick={onClose} className="flex flex-1 min-w-0 items-center gap-3">
              <div className="avatar avatar-sm avatar-0 !w-8 !h-8 !text-[11px] shrink-0">
                {getInitials(currentUser.name)}
              </div>
              <div className="min-w-0">
                <p className="text-[12px] font-semibold text-on-surface truncate">{currentUser.name}</p>
                <p className="text-[10px] text-on-surface-variant truncate">{currentUser.email}</p>
              </div>
            </Link>
            <button
              onClick={handleSignOut}
              className="shrink-0 p-1 rounded-md text-on-surface-variant hover:text-error hover:bg-error/10 transition-colors"
              title="Sign Out"
            >
              <span className="material-symbols-outlined text-[16px]">logout</span>
            </button>
          </div>
        )}

        <button
          type="button"
          onClick={toggleTheme}
          className="flex items-center justify-between px-2 py-2.5 rounded-xl text-on-surface-variant hover:text-on-surface hover:bg-glass-hover transition-colors"
          title={`Switch to ${theme === "light" ? "dark" : "light"} mode`}
        >
          <span className="flex items-center gap-2 text-[11px] font-medium">
            <span className="material-symbols-outlined text-[17px]">{theme === "light" ? "dark_mode" : "light_mode"}</span>
            {theme === "light" ? "Dark mode" : "Light mode"}
          </span>
          <span className="material-symbols-outlined text-[16px]">chevron_right</span>
        </button>
      </div>
    </nav>
  );
}
