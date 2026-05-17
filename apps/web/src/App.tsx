// ──────────────────────────────────────────────
// App — Root Component with Auth-Aware Routing
// ──────────────────────────────────────────────

import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { Layout } from "./components/Layout";
import { GroupsPage } from "./pages/GroupsPage";
import { GroupDetailPage } from "./pages/GroupDetailPage";
import { LedgerPage } from "./pages/LedgerPage";
import { SettingsPage } from "./pages/SettingsPage";
import { ProfilePage } from "./pages/ProfilePage";
import { LoginPage } from "./pages/LoginPage";

import { UserProvider, useUser } from "./contexts/UserContext";

function AuthGuard({ children }: { children: React.ReactNode }) {
  const { currentUserId, loading } = useUser();

  if (loading) {
    return (
      <div className="h-[100dvh] w-full bg-background flex items-center justify-center">
        <div className="flex flex-col items-center gap-4 animate-fade-in">
          <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-primary-container to-[#4f46e5] flex items-center justify-center">
            <span className="material-symbols-outlined text-white text-[24px] animate-spin">sync</span>
          </div>
          <p className="text-[13px] text-on-surface-variant font-medium">Loading session...</p>
        </div>
      </div>
    );
  }

  if (!currentUserId) {
    return <Navigate to="/login" replace />;
  }

  return <>{children}</>;
}

export default function App() {
  return (
    <BrowserRouter>
      <UserProvider>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route
            element={
              <AuthGuard>
                <Layout />
              </AuthGuard>
            }
          >
            <Route path="/" element={<GroupsPage />} />
            <Route path="/groups/:id" element={<GroupDetailPage />} />
            <Route path="/ledger" element={<LedgerPage />} />
            <Route path="/settings" element={<SettingsPage />} />
            <Route path="/profile" element={<ProfilePage />} />
          </Route>
        </Routes>
      </UserProvider>
    </BrowserRouter>
  );
}
