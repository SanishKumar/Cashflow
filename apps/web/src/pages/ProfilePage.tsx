import { useUser } from "../contexts/UserContext";

function getInitials(name: string): string {
  return name.split(" ").map((part) => part[0]).join("").toUpperCase().slice(0, 2);
}

export function ProfilePage() {
  const { currentUser } = useUser();

  return (
    <div className="flex h-full flex-col">
      <header className="shrink-0 px-4 pb-3 pt-5 md:px-8 md:pb-4 md:pt-7">
        <p className="mb-1 text-[10px] font-bold uppercase tracking-[0.14em] text-primary">Account</p>
        <h2 className="text-[24px] font-bold tracking-tight text-on-surface">Your profile</h2>
        <p className="mt-1 text-[12px] text-on-surface-variant">Your account details and privacy boundaries.</p>
      </header>

      <div className="mobile-scroll-safe flex-1 overflow-auto px-4 pb-6 md:px-8 md:pb-8">
        <div className="flex max-w-3xl flex-col gap-6">
          {currentUser && (
            <section>
              <h3 className="text-section-title mb-4">Your account</h3>
              <div className="flex items-center gap-4 rounded-2xl border border-primary/15 bg-surface-container p-5 shadow-[0_8px_20px_rgba(31,35,54,0.04)]">
                <div className="avatar avatar-lg avatar-0 !h-12 !w-12 !text-[14px]">{getInitials(currentUser.name)}</div>
                <div className="min-w-0">
                  <p className="truncate text-[15px] font-bold text-on-surface">{currentUser.name}</p>
                  <p className="truncate text-[12px] text-on-surface-variant">{currentUser.email}</p>
                </div>
              </div>
            </section>
          )}

          <section>
            <h3 className="text-section-title mb-4">Who can find you</h3>
            <div className="rounded-2xl border border-outline-variant/70 bg-surface-container p-5 shadow-[0_8px_20px_rgba(31,35,54,0.04)]">
              <div className="flex items-start gap-3">
                <span className="material-symbols-outlined mt-0.5 text-[20px] text-primary">shield_person</span>
                <div>
                  <p className="text-[14px] font-semibold text-on-surface">No public member directory</p>
                  <p className="mt-1 text-[12px] leading-relaxed text-on-surface-variant">
                    Other people cannot browse registered accounts. Someone must enter your exact email address when adding you to a group.
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
