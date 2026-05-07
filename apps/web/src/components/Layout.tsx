// ──────────────────────────────────────────────
// Layout Component — App Shell v2.1
// ──────────────────────────────────────────────

import { Outlet } from "react-router-dom";
import { Sidebar } from "./Sidebar";

export function Layout() {
  return (
    <div className="h-screen w-full overflow-hidden flex bg-background">
      <Sidebar syncActive={true} />
      <main className="flex-1 min-w-0 h-full overflow-hidden flex flex-col">
        <Outlet />
      </main>
    </div>
  );
}
