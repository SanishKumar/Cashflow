// ──────────────────────────────────────────────
// Layout Component — App Shell v2.1
// ──────────────────────────────────────────────

import { useEffect, useState } from "react";
import { NavLink, Outlet, useLocation } from "react-router-dom";
import { Sidebar } from "./Sidebar";

const mobileNavItems = [
  { to: "/", icon: "space_dashboard", label: "Dashboard", end: true },
  { to: "/groups", icon: "group", label: "Groups", end: false },
  { to: "/ledger", icon: "receipt_long", label: "Ledger", end: false },
  { to: "/settings", icon: "tune", label: "Settings", end: false },
];

function getPageTitle(pathname: string): string {
  if (pathname === "/") return "Dashboard";
  if (pathname === "/groups") return "Groups";
  if (pathname.startsWith("/groups/")) return "Group";
  if (pathname === "/ledger") return "Ledger";
  if (pathname === "/settings") return "Settings";
  if (pathname === "/profile") return "Profile";
  return "CashFlow";
}

export function Layout() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [keyboardVisible, setKeyboardVisible] = useState(false);
  const location = useLocation();

  useEffect(() => {
    const viewport = window.visualViewport;
    if (!viewport) return;

    const updateKeyboardVisibility = () => {
      setKeyboardVisible(window.innerHeight - viewport.height > 160);
    };

    updateKeyboardVisibility();
    viewport.addEventListener("resize", updateKeyboardVisibility);
    window.addEventListener("resize", updateKeyboardVisibility);
    return () => {
      viewport.removeEventListener("resize", updateKeyboardVisibility);
      window.removeEventListener("resize", updateKeyboardVisibility);
    };
  }, []);

  return (
    <div className="h-[100dvh] w-full overflow-hidden flex bg-background relative">
      {/* Mobile Sidebar Overlay */}
      {sidebarOpen && (
        <div 
          className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40 md:hidden animate-fade-in" 
          onClick={() => setSidebarOpen(false)} 
        />
      )}

      {/* Sidebar - off-canvas on mobile, static on desktop */}
      <div 
        className={`fixed inset-y-0 left-0 z-50 transform ${
          sidebarOpen ? "translate-x-0" : "-translate-x-full"
        } md:relative md:translate-x-0 transition-transform duration-300 ease-[cubic-bezier(0.2,0.8,0.2,1)] flex`}
      >
        <Sidebar syncActive={true} onClose={() => setSidebarOpen(false)} />
      </div>

      {/* Main Content Area */}
      <main className="mobile-content-safe flex-1 min-w-0 h-full overflow-hidden flex flex-col relative w-full">
        {/* Mobile top bar replaces the former floating menu button. */}
        <header className="mobile-top-bar md:hidden shrink-0">
          <button
            type="button"
            onClick={() => setSidebarOpen(true)}
            aria-label="Open navigation"
            className="touch-target inline-flex items-center justify-center rounded-xl text-on-surface-variant hover:bg-surface-variant hover:text-on-surface transition-colors"
          >
            <span className="material-symbols-outlined text-[22px]">menu</span>
          </button>
          <div className="flex items-center gap-2 min-w-0">
            <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-primary-container to-[#4f46e5] flex items-center justify-center shrink-0">
              <span className="material-symbols-outlined text-white text-[16px]">account_balance</span>
            </div>
            <span className="text-[12px] font-bold text-on-surface-variant">CashFlow</span>
          </div>
          <h1 className="flex-1 min-w-0 text-right truncate text-[15px] font-semibold text-on-surface">
            {getPageTitle(location.pathname)}
          </h1>
        </header>
        <div className="flex-1 min-h-0 overflow-hidden">
          <Outlet />
        </div>
      </main>

      <nav
        aria-label="Mobile navigation"
        className={`mobile-bottom-nav md:hidden ${keyboardVisible ? "mobile-bottom-nav--hidden" : ""}`}
      >
        {mobileNavItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            className={({ isActive }) => `mobile-bottom-nav__item ${isActive ? "mobile-bottom-nav__item--active" : ""}`}
          >
            <span className="material-symbols-outlined text-[22px]">{item.icon}</span>
            <span>{item.label}</span>
          </NavLink>
        ))}
      </nav>
    </div>
  );
}
