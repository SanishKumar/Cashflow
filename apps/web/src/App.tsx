import { BrowserRouter, Routes, Route, Navigate, Outlet } from "react-router-dom";
import { lazy, Suspense } from "react";
import { Layout } from "./components/Layout";
import { DashboardPage } from "./pages/DashboardPage";
import { UserProvider, useUser } from "./contexts/UserContext";
import { ThemeProvider } from "./contexts/ThemeContext";

// Keep the dashboard in the first bundle for the fastest authenticated landing
// page. Less frequently visited routes load only when a user navigates to them.
const GroupsPage = lazy(() => import("./pages/GroupsPage").then(({ GroupsPage }) => ({ default: GroupsPage })));
const GroupDetailPage = lazy(() => import("./pages/GroupDetailPage").then(({ GroupDetailPage }) => ({ default: GroupDetailPage })));
const LedgerPage = lazy(() => import("./pages/LedgerPage").then(({ LedgerPage }) => ({ default: LedgerPage })));
const SettingsPage = lazy(() => import("./pages/SettingsPage").then(({ SettingsPage }) => ({ default: SettingsPage })));
const ProfilePage = lazy(() => import("./pages/ProfilePage").then(({ ProfilePage }) => ({ default: ProfilePage })));
const LoginPage = lazy(() => import("./pages/LoginPage").then(({ LoginPage }) => ({ default: LoginPage })));
const DemoPage = lazy(() => import("./pages/DemoPage").then(({ DemoPage }) => ({ default: DemoPage })));

function RouteLoading() {
  return (
    <div className="h-[100dvh] w-full bg-background flex items-center justify-center">
      <div className="flex flex-col items-center gap-3 animate-fade-in">
        <div className="w-10 h-10 rounded-xl bg-surface-variant animate-pulse" />
        <p className="text-[13px] text-on-surface-variant font-medium">Loading page...</p>
      </div>
    </div>
  );
}

function AuthGuard({ children }: { children: React.ReactNode }) {
  const { currentUserId, loading } = useUser();

  if (loading) {
    return (
      <div className="h-[100dvh] w-full bg-background flex items-center justify-center">
        <div className="flex flex-col items-center gap-4 animate-fade-in">
          <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-primary-container to-[#5133db] flex items-center justify-center">
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

function UserScope() {
  return (
    <UserProvider>
      <Outlet />
    </UserProvider>
  );
}

export default function App() {
  return (
    <ThemeProvider>
      <BrowserRouter>
        <Suspense fallback={<RouteLoading />}>
          <Routes>
            <Route path="/demo" element={<DemoPage />} />
            <Route element={<UserScope />}>
              <Route path="/login" element={<LoginPage />} />
              <Route
                element={
                  <AuthGuard>
                    <Layout />
                  </AuthGuard>
                }
              >
                <Route path="/" element={<DashboardPage />} />
                <Route path="/groups" element={<GroupsPage />} />
                <Route path="/groups/:id" element={<GroupDetailPage />} />
                <Route path="/ledger" element={<LedgerPage />} />
                <Route path="/settings" element={<SettingsPage />} />
                <Route path="/profile" element={<ProfilePage />} />
              </Route>
            </Route>
          </Routes>
        </Suspense>
      </BrowserRouter>
    </ThemeProvider>
  );
}

