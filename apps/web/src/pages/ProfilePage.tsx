import { Link } from "react-router-dom";
import { useUser } from "../contexts/UserContext";
import { useTheme } from "../contexts/ThemeContext";

function getInitials(name: string): string {
  return name.split(" ").map((part) => part[0]).join("").toUpperCase().slice(0, 2);
}

export function ProfilePage() {
  const { currentUser, logout } = useUser();
  const { theme, toggleTheme } = useTheme();

  const handleSignOut = async (): Promise<void> => {
    await logout();
    window.location.href = "/";
  };

  return (
    <div className="flex h-full flex-col">
      <header className="shrink-0 px-4 pb-3 pt-5 md:px-8 md:pb-4 md:pt-7">
        <p className="text-label mb-1">Account</p>
        <h2 className="text-[24px] font-medium tracking-tight text-on-surface">Your profile</h2>
        <p className="mt-1 text-[12px] text-on-surface-variant">
          Your account details and privacy boundaries.
        </p>
      </header>

      <div className="mobile-scroll-safe flex-1 overflow-auto px-4 pb-6 md:px-8 md:pb-8">
        <div className="flex max-w-3xl flex-col gap-6">
          {currentUser && (
            <section>
              <h3 className="text-section-title mb-4">Your account</h3>
              <div className="layer flex items-center gap-4 p-5">
                <div className="avatar avatar-lg">{getInitials(currentUser.name)}</div>
                <div className="min-w-0">
                  <p className="truncate text-[15px] font-medium text-on-surface">
                    {currentUser.name}
                  </p>
                  <p className="truncate text-[12px] text-on-surface-variant">
                    {currentUser.email}
                  </p>
                </div>
              </div>
            </section>
          )}

          {/*
            The header only has room for the avatar on a phone, so settings,
            appearance and sign-out live here where they are always reachable.
          */}
          <section>
            <h3 className="text-section-title mb-4">Account actions</h3>
            <div className="layer divide-y divide-outline-variant overflow-hidden">
              <Link
                to="/settings"
                className="flex items-center justify-between gap-3 px-5 py-4 transition-colors hover:bg-glass-hover"
              >
                <span className="flex items-center gap-3">
                  <span className="material-symbols-outlined text-[20px] text-on-surface-variant">
                    tune
                  </span>
                  <span className="text-[14px] text-on-surface">Settings</span>
                </span>
                <span className="material-symbols-outlined text-[18px] text-on-surface-variant">
                  chevron_right
                </span>
              </Link>

              <button
                type="button"
                onClick={toggleTheme}
                className="flex w-full items-center justify-between gap-3 px-5 py-4 text-left transition-colors hover:bg-glass-hover"
              >
                <span className="flex items-center gap-3">
                  <span className="material-symbols-outlined text-[20px] text-on-surface-variant">
                    {theme === "light" ? "dark_mode" : "light_mode"}
                  </span>
                  <span className="text-[14px] text-on-surface">
                    {theme === "light" ? "Switch to dark" : "Switch to light"}
                  </span>
                </span>
              </button>

              <button
                type="button"
                onClick={handleSignOut}
                className="flex w-full items-center gap-3 px-5 py-4 text-left transition-colors hover:bg-glass-hover"
              >
                <span className="material-symbols-outlined text-[20px] text-error">logout</span>
                <span className="text-[14px] text-error">Sign out</span>
              </button>
            </div>
          </section>

          <section>
            <h3 className="text-section-title mb-4">Who can find you</h3>
            <div className="layer p-5">
              <div className="flex items-start gap-3">
                <span className="material-symbols-outlined mt-0.5 text-[20px] text-on-surface-variant">
                  shield_person
                </span>
                <div>
                  <p className="text-[14px] font-medium text-on-surface">
                    No public member directory
                  </p>
                  <p className="mt-1 text-[12px] leading-relaxed text-on-surface-variant">
                    Other people cannot browse registered accounts. Someone must enter your exact
                    email address when adding you to a group.
                  </p>
                </div>
              </div>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
