import { useTheme } from "../contexts/ThemeContext";

export function SettingsPage() {
  const { theme, setTheme } = useTheme();

  return (
    <div className="h-full flex flex-col">
      <header className="shrink-0 px-4 pb-3 pt-5 md:px-8 md:pb-4 md:pt-7">
        <p className="mb-1 text-[10px] font-bold uppercase tracking-[0.14em] text-primary">Preferences</p>
        <h2 className="text-[24px] font-bold tracking-tight text-on-surface">Settings</h2>
        <p className="mt-1 text-[12px] text-on-surface-variant">Choose how CashFlow looks and understand how it handles shared expenses.</p>
      </header>

      <div className="mobile-scroll-safe flex-1 overflow-auto px-4 pb-6 md:px-8 md:pb-8">
        <div className="max-w-3xl flex flex-col gap-7">
          <section>
            <h3 className="text-section-title mb-4">Appearance</h3>
            <div className="rounded-2xl border border-outline-variant/70 bg-surface-container p-4 shadow-[0_8px_20px_rgba(31,35,54,0.04)] sm:flex sm:items-center sm:justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center">
                  <span className="material-symbols-outlined text-[20px]">{theme === "dark" ? "dark_mode" : "light_mode"}</span>
                </div>
                <div>
                  <p className="text-[13px] font-bold text-on-surface">Theme</p>
                  <p className="text-[11px] text-on-surface-variant">Your choice is saved on this device.</p>
                </div>
              </div>
              <div className="mt-4 flex gap-1 rounded-xl bg-surface-container-high p-1 sm:mt-0">
                <ThemeButton active={theme === "light"} icon="light_mode" label="Light" onClick={() => setTheme("light")} />
                <ThemeButton active={theme === "dark"} icon="dark_mode" label="Dark" onClick={() => setTheme("dark")} />
              </div>
            </div>
          </section>

          <section>
            <h3 className="text-section-title mb-4">Privacy and payments</h3>
            <div className="grid gap-4 md:grid-cols-2">
              <InfoCard
                icon="account_balance"
                crossed
                title="No bank connection"
                body="CashFlow records shared expenses and balances. It does not connect to your bank account or move money for you."
              />
              <InfoCard
                icon="group"
                title="Group-based records"
                body="Expenses, balances, and settlement plans stay organized inside the groups where they were created."
              />
            </div>
          </section>

          <section>
            <h3 className="text-section-title mb-4">How settling up works</h3>
            <div className="rounded-2xl border border-outline-variant/70 bg-surface-container p-5 shadow-[0_8px_20px_rgba(31,35,54,0.04)]">
              <div className="flex items-start gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-secondary/10 text-secondary">
                  <span className="material-symbols-outlined text-[20px]">route</span>
                </div>
                <div>
                  <p className="text-[13px] font-bold text-on-surface">CashFlow suggests; your group confirms</p>
                  <p className="mt-1 text-[12px] leading-relaxed text-on-surface-variant">CashFlow turns recorded balances into a shorter payment plan. A settlement payment stays pending until the receiving member confirms it.</p>
                </div>
              </div>
            </div>
          </section>

          <section>
            <h3 className="text-section-title mb-4">About</h3>
            <div className="rounded-2xl border border-outline-variant/70 bg-surface-container p-5 shadow-[0_8px_20px_rgba(31,35,54,0.04)]">
              <p className="text-[13px] leading-relaxed text-on-surface"><strong>CashFlow</strong> is an open-source group-expense tracker for trips, homes, and teams. It keeps the record understandable and gives the group a practical way to settle up.</p>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}

function ThemeButton({ active, icon, label, onClick }: { active: boolean; icon: string; label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`flex h-8 flex-1 items-center justify-center gap-1.5 rounded-lg px-3 text-[11px] font-bold transition-all sm:flex-none ${active ? "bg-surface-container text-on-surface shadow-sm" : "text-on-surface-variant hover:text-on-surface"}`}
    >
      <span className="material-symbols-outlined text-[15px]">{icon}</span>
      {label}
    </button>
  );
}

function InfoCard({ icon, title, body, crossed = false }: { icon: string; title: string; body: string; crossed?: boolean }) {
  return (
    <div className="rounded-2xl border border-outline-variant/70 bg-surface-container p-5 shadow-[0_8px_20px_rgba(31,35,54,0.04)]">
      <div className="relative flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
        <span className="material-symbols-outlined text-[20px]">{icon}</span>
        {crossed && <span className="absolute h-[2px] w-7 rotate-45 rounded-full bg-primary ring-2 ring-surface-container" aria-hidden="true" />}
      </div>
      <p className="mt-4 text-[13px] font-bold text-on-surface">{title}</p>
      <p className="mt-1 text-[11px] leading-relaxed text-on-surface-variant">{body}</p>
    </div>
  );
}
