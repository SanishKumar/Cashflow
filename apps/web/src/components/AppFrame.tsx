/**
 * The single application frame.
 *
 * Every signed-in screen sits inside this one chrome, so navigating never
 * changes the furniture — the earlier build had three separate shells and
 * leaving the graph dropped you into an unrelated sidebar with no way back.
 *
 * Every page owns the full content region and its own scrolling, because each
 * screen is a full-height app surface rather than a document — the graph needs
 * the whole area, and the list screens already manage internal scroll.
 */

import type { ReactNode } from "react";
import { Link, NavLink } from "react-router-dom";
import { useUser } from "../contexts/UserContext";
import { useTheme } from "../contexts/ThemeContext";
import { BrandMark } from "./BrandMark";

interface AppFrameProps {
  children: ReactNode;
}

const NAV = [
  { to: "/", label: "Graph", end: true },
  { to: "/groups", label: "Groups", end: false },
  { to: "/ledger", label: "Ledger", end: false },
];

function initials(name: string): string {
  return name
    .split(" ")
    .map((part) => part[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

export function AppFrame({ children }: AppFrameProps) {
  const { currentUser, currentUserId, logout } = useUser();
  const { theme, toggleTheme } = useTheme();

  const handleSignOut = async (): Promise<void> => {
    await logout();
    window.location.href = "/";
  };

  return (
    <div className="flex h-full w-full flex-col overflow-hidden bg-background">
      <header className="flex h-14 shrink-0 items-center gap-2 border-b border-outline-variant px-3 sm:gap-4 sm:px-6">
        <Link to="/" className="flex shrink-0 items-center gap-2.5">
          <BrandMark className="h-7 w-7 text-on-surface" />
          <span className="hidden text-[15px] font-medium tracking-tight text-on-surface sm:block">
            CashFlow
          </span>
        </Link>

        <nav className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto">
          {NAV.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                `shrink-0 rounded-[4px] px-3 py-1.5 font-mono text-[11px] font-medium uppercase tracking-[0.14em] transition-colors ${
                  isActive
                    ? "bg-[#85c093] text-[#09352e]"
                    : "text-on-surface-variant hover:text-on-surface"
                }`
              }
            >
              {item.label}
            </NavLink>
          ))}
        </nav>

        <div className="flex shrink-0 items-center gap-1">
          <button
            type="button"
            onClick={toggleTheme}
            title={theme === "light" ? "Switch to dark" : "Switch to light"}
            className="flex h-8 w-8 items-center justify-center rounded-[4px] text-on-surface-variant transition-colors hover:text-on-surface"
          >
            <span className="material-symbols-outlined text-[18px]">
              {theme === "light" ? "dark_mode" : "light_mode"}
            </span>
          </button>

          {currentUserId && currentUser ? (
            <>
              <Link
                to="/settings"
                title="Settings"
                className="hidden h-8 w-8 items-center justify-center rounded-[4px] text-on-surface-variant transition-colors hover:text-on-surface sm:flex"
              >
                <span className="material-symbols-outlined text-[18px]">tune</span>
              </Link>
              <Link to="/profile" className="avatar avatar-sm ml-1" title={currentUser.name}>
                {initials(currentUser.name)}
              </Link>
              <button
                type="button"
                onClick={handleSignOut}
                title="Sign out"
                className="hidden h-8 w-8 items-center justify-center rounded-[4px] text-on-surface-variant transition-colors hover:text-on-surface sm:flex"
              >
                <span className="material-symbols-outlined text-[18px]">logout</span>
              </button>
            </>
          ) : (
            <Link to="/login" className="btn-primary !h-8 !px-3 !text-[12px] sm:!px-4 sm:!text-[13px]">
              Sign in
            </Link>
          )}
        </div>
      </header>

      <main className="min-h-0 flex-1 overflow-hidden">{children}</main>
    </div>
  );
}
