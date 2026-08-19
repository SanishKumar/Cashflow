import { BrowserRouter, Routes, Route, Navigate, Outlet } from "react-router-dom";
import { lazy, Suspense } from "react";
import { AppFrame } from "./components/AppFrame";
import { WorkspacePage } from "./pages/WorkspacePage";
import { UserProvider, useUser } from "./contexts/UserContext";
import { ThemeProvider } from "./contexts/ThemeContext";

// The graph is the landing surface, so it ships in the first bundle. Everything
// else loads when someone actually navigates to it.
const GroupsPage = lazy(() => import("./pages/GroupsPage").then(({ GroupsPage }) => ({ default: GroupsPage })));
const GroupDetailPage = lazy(() => import("./pages/GroupDetailPage").then(({ GroupDetailPage }) => ({ default: GroupDetailPage })));
const LedgerPage = lazy(() => import("./pages/LedgerPage").then(({ LedgerPage }) => ({ default: LedgerPage })));
const SettingsPage = lazy(() => import("./pages/SettingsPage").then(({ SettingsPage }) => ({ default: SettingsPage })));
const ProfilePage = lazy(() => import("./pages/ProfilePage").then(({ ProfilePage }) => ({ default: ProfilePage })));
const LoginPage = lazy(() => import("./pages/LoginPage").then(({ LoginPage }) => ({ default: LoginPage })));

function RouteLoading() {
  return (
    <div className="flex h-full w-full items-center justify-center">
      <p className="text-label animate-fade-in">Loading</p>
    </div>
  );
}

function SessionLoading() {
  return (
    <div className="flex h-[100dvh] w-full items-center justify-center bg-background">
      <p className="text-label animate-fade-in">Restoring session</p>
    </div>
  );
}

/** Wraps a page in the shared frame and requires a session. */
function Guarded({ children }: { children: React.ReactNode }) {
  const { currentUserId, loading } = useUser();

  if (loading) return <SessionLoading />;
  if (!currentUserId) return <Navigate to="/login" replace />;

  return <AppFrame>{children}</AppFrame>;
}

function UserScope() {
  return (
    <UserProvider>
      <Outlet />
    </UserProvider>
  );
}

/**
 * The graph is public: a visitor sees a sample network rather than a login
 * wall, which is the whole point of leading with the product.
 */
function Home() {
  const { loading } = useUser();
  if (loading) return <SessionLoading />;

  return (
    <AppFrame>
      <WorkspacePage />
    </AppFrame>
  );
}

export default function App() {
  return (
    <ThemeProvider>
      <BrowserRouter>
        <Suspense fallback={<RouteLoading />}>
          <Routes>
            <Route element={<UserScope />}>
              <Route path="/login" element={<LoginPage />} />
              <Route path="/" element={<Home />} />

              {/* Clearing is no longer a destination — it is what the graph does. */}
              <Route path="/clearing" element={<Navigate to="/" replace />} />

              <Route path="/groups" element={<Guarded><GroupsPage /></Guarded>} />
              <Route path="/groups/:id" element={<Guarded><GroupDetailPage /></Guarded>} />
              <Route path="/ledger" element={<Guarded><LedgerPage /></Guarded>} />
              <Route path="/settings" element={<Guarded><SettingsPage /></Guarded>} />
              <Route path="/profile" element={<Guarded><ProfilePage /></Guarded>} />

              <Route path="*" element={<Navigate to="/" replace />} />
            </Route>
          </Routes>
        </Suspense>
      </BrowserRouter>
    </ThemeProvider>
  );
}
