// ──────────────────────────────────────────────
// Layout Component — App Shell v2.1
// ──────────────────────────────────────────────

import { useEffect, useState } from "react";
import { Link, NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { Sidebar } from "./Sidebar";
import { useUser } from "../contexts/UserContext";
import { BrandMark } from "./BrandMark";

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
  const [searchQuery, setSearchQuery] = useState("");
  const location = useLocation();
  const navigate = useNavigate();
  const { currentUser } = useUser();

  const handleSearch = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const query = searchQuery.trim();
    navigate(query ? `/groups?q=${encodeURIComponent(query)}` : "/groups");
  };

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
        <Sidebar onClose={() => setSidebarOpen(false)} />
      </div>

      {/* Main Content Area */}
      <main className="mobile-content-safe flex-1 min-w-0 h-full overflow-hidden flex flex-col relative w-full">
        <header className="hidden md:flex h-[72px] shrink-0 items-center justify-between border-b border-outline-variant/70 bg-surface-container px-7">
          <form onSubmit={handleSearch} className="relative w-full max-w-[360px]">
            <span className="material-symbols-outlined absolute left-3.5 top-1/2 -translate-y-1/2 text-[18px] text-on-surface-variant pointer-events-none">search</span>
            <input
              type="search"
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder="Search groups"
              className="h-10 w-full rounded-xl border border-outline-variant/80 bg-surface-container-low pl-10 pr-20 text-[12px] text-on-surface outline-none transition-colors placeholder:text-on-surface-variant/80 focus:border-primary/60 focus:ring-4 focus:ring-primary/10"
            />
            <span className="absolute right-3 top-1/2 -translate-y-1/2 rounded-md border border-outline-variant bg-surface-container px-1.5 py-0.5 font-mono text-[9px] text-on-surface-variant">ENTER</span>
          </form>
          <div className="flex items-center gap-3">
            <Link to="/ledger?tab=activity" className="touch-target inline-flex items-center justify-center rounded-xl border border-outline-variant/70 bg-surface-container-low text-on-surface-variant hover:text-primary hover:border-primary/30 transition-colors" title="View activity">
              <span className="material-symbols-outlined text-[19px]">history</span>
            </Link>
            <Link to="/profile" className="flex items-center gap-2.5 rounded-xl border border-outline-variant/70 bg-surface-container-low py-1.5 pl-1.5 pr-3 hover:border-primary/30 transition-colors">
              <span className="avatar avatar-sm avatar-0 !w-7 !h-7 !text-[9px]">{getInitials(currentUser?.name || "You")}</span>
              <span className="max-w-[112px] truncate text-[12px] font-semibold text-on-surface">{currentUser?.name || "Your profile"}</span>
              <span className="material-symbols-outlined text-[16px] text-on-surface-variant">chevron_right</span>
            </Link>
          </div>
        </header>
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
            <BrandMark className="h-7 w-7 shrink-0" />
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

function getInitials(name: string): string {
  return name.split(" ").map((part) => part[0]).join("").toUpperCase().slice(0, 2);
}
