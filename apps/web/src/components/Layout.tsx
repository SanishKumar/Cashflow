// ──────────────────────────────────────────────
// Layout Component — App Shell v2.1
// ──────────────────────────────────────────────

import { useState } from "react";
import { Outlet } from "react-router-dom";
import { Sidebar } from "./Sidebar";

export function Layout() {
  const [sidebarOpen, setSidebarOpen] = useState(false);

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
      <main className="flex-1 min-w-0 h-full overflow-hidden flex flex-col relative w-full">
        {/* Mobile Header / Hamburger */}
        <button 
          onClick={() => setSidebarOpen(true)}
          className="md:hidden absolute top-2.5 left-4 z-30 p-1.5 rounded-lg bg-surface-container border border-outline-variant/30 text-on-surface shadow-sm hover:bg-surface-variant transition-colors"
        >
          <span className="material-symbols-outlined text-[20px]">menu</span>
        </button>

        <Outlet />
      </main>
    </div>
  );
}
