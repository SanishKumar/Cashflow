import { FormEvent, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { BrandMark } from "../components/BrandMark";
import { useTheme } from "../contexts/ThemeContext";

interface DemoPerson {
  id: string;
  name: string;
  initials: string;
  color: string;
}

interface DemoExpense {
  id: string;
  description: string;
  amountCents: number;
  paidBy: string;
  participantIds: string[];
}

interface DemoPayment {
  from: string;
  to: string;
  amountCents: number;
}

const PEOPLE: DemoPerson[] = [
  { id: "maya", name: "Maya", initials: "MA", color: "bg-[#6947f4]" },
  { id: "leo", name: "Leo", initials: "LE", color: "bg-[#087f54]" },
  { id: "priya", name: "Priya", initials: "PR", color: "bg-[#c53452]" },
  { id: "sam", name: "Sam", initials: "SA", color: "bg-[#a65a00]" },
];

const ALL_PERSON_IDS = PEOPLE.map((person) => person.id);

const SEEDED_EXPENSES: DemoExpense[] = [
  { id: "stay", description: "Apartment", amountCents: 36000, paidBy: "leo", participantIds: ALL_PERSON_IDS },
  { id: "dinner", description: "First-night dinner", amountCents: 13200, paidBy: "priya", participantIds: ALL_PERSON_IDS },
  { id: "museum", description: "Museum tickets", amountCents: 7200, paidBy: "sam", participantIds: ALL_PERSON_IDS },
  { id: "groceries", description: "Breakfast groceries", amountCents: 6400, paidBy: "maya", participantIds: ALL_PERSON_IDS },
  { id: "cab", description: "Airport cab", amountCents: 4500, paidBy: "maya", participantIds: ALL_PERSON_IDS },
];

function formatMoney(cents: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
  }).format(cents / 100);
}

function personById(id: string) {
  return PEOPLE.find((person) => person.id === id)!;
}

function calculateBalances(expenses: DemoExpense[]) {
  const balances = new Map(PEOPLE.map((person) => [person.id, 0]));

  for (const expense of expenses) {
    balances.set(expense.paidBy, (balances.get(expense.paidBy) ?? 0) + expense.amountCents);
    const baseShare = Math.floor(expense.amountCents / expense.participantIds.length);
    const remainder = expense.amountCents % expense.participantIds.length;

    expense.participantIds.forEach((personId, index) => {
      const share = baseShare + (index < remainder ? 1 : 0);
      balances.set(personId, (balances.get(personId) ?? 0) - share);
    });
  }

  return balances;
}

function buildSettlementPlan(balances: Map<string, number>): DemoPayment[] {
  const debtors = [...balances.entries()]
    .filter(([, balance]) => balance < 0)
    .map(([id, balance]) => ({ id, amount: -balance }))
    .sort((a, b) => b.amount - a.amount);
  const creditors = [...balances.entries()]
    .filter(([, balance]) => balance > 0)
    .map(([id, balance]) => ({ id, amount: balance }))
    .sort((a, b) => b.amount - a.amount);
  const payments: DemoPayment[] = [];
  let debtorIndex = 0;
  let creditorIndex = 0;

  while (debtorIndex < debtors.length && creditorIndex < creditors.length) {
    const debtor = debtors[debtorIndex];
    const creditor = creditors[creditorIndex];
    const amountCents = Math.min(debtor.amount, creditor.amount);
    payments.push({ from: debtor.id, to: creditor.id, amountCents });
    debtor.amount -= amountCents;
    creditor.amount -= amountCents;
    if (debtor.amount === 0) debtorIndex += 1;
    if (creditor.amount === 0) creditorIndex += 1;
  }

  return payments;
}

export function DemoPage() {
  const { theme, toggleTheme } = useTheme();
  const [expenses, setExpenses] = useState<DemoExpense[]>(SEEDED_EXPENSES);
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  const [paidBy, setPaidBy] = useState(PEOPLE[0].id);
  const [participantIds, setParticipantIds] = useState<string[]>(ALL_PERSON_IDS);
  const [formError, setFormError] = useState<string | null>(null);

  const balances = useMemo(() => calculateBalances(expenses), [expenses]);
  const payments = useMemo(() => buildSettlementPlan(balances), [balances]);
  const totalCents = expenses.reduce((total, expense) => total + expense.amountCents, 0);

  const toggleParticipant = (personId: string) => {
    setParticipantIds((current) =>
      current.includes(personId) ? current.filter((id) => id !== personId) : [...current, personId]
    );
  };

  const addExpense = (event: FormEvent) => {
    event.preventDefault();
    const normalizedAmount = amount.trim();
    if (!description.trim()) {
      setFormError("Give the expense a short description.");
      return;
    }
    if (!/^\d+(\.\d{1,2})?$/.test(normalizedAmount) || Number(normalizedAmount) <= 0) {
      setFormError("Enter a positive amount with no more than two decimal places.");
      return;
    }
    if (participantIds.length < 2) {
      setFormError("Choose at least two people to split this expense.");
      return;
    }

    const amountCents = Math.round(Number(normalizedAmount) * 100);
    setExpenses((current) => [
      ...current,
      {
        id: `local-${current.length + 1}-${description.trim().toLowerCase().replace(/\s+/g, "-")}`,
        description: description.trim(),
        amountCents,
        paidBy,
        participantIds,
      },
    ]);
    setDescription("");
    setAmount("");
    setFormError(null);
  };

  const resetDemo = () => {
    setExpenses(SEEDED_EXPENSES);
    setDescription("");
    setAmount("");
    setPaidBy(PEOPLE[0].id);
    setParticipantIds(ALL_PERSON_IDS);
    setFormError(null);
  };

  return (
    <div className="h-[100dvh] overflow-y-auto overflow-x-hidden bg-background text-on-surface">
      <header className="sticky top-0 z-20 border-b border-outline-variant/70 bg-glass backdrop-blur-xl">
        <div className="mx-auto flex min-h-16 max-w-[1180px] items-center justify-between gap-4 px-4 sm:px-6">
          <Link to="/login" className="flex items-center gap-2.5" aria-label="CashFlow sign in">
            <BrandMark className="h-9 w-9" />
            <span className="text-[16px] font-bold tracking-tight">CashFlow</span>
            <span className="rounded-full bg-primary-fixed px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.12em] text-on-primary-fixed">
              Demo
            </span>
          </Link>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={toggleTheme}
              className="flex h-9 w-9 items-center justify-center rounded-xl border border-outline-variant bg-surface-container text-on-surface-variant transition-colors hover:text-on-surface"
              aria-label={`Switch to ${theme === "light" ? "dark" : "light"} mode`}
            >
              <span className="material-symbols-outlined text-[18px]">
                {theme === "light" ? "dark_mode" : "light_mode"}
              </span>
            </button>
            <Link to="/login" className="btn-primary h-9 whitespace-nowrap px-3 text-[12px] sm:px-4">
              <span className="sm:hidden">Sign up</span>
              <span className="hidden sm:inline">Create account</span>
            </Link>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-[1180px] px-4 py-5 sm:px-6 sm:py-8">
        <div className="mb-6 flex items-start gap-3 rounded-2xl border border-primary/20 bg-primary/5 p-4" role="status">
          <span className="material-symbols-outlined mt-0.5 text-[19px] text-primary">shield_lock</span>
          <div>
            <p className="text-[13px] font-bold text-on-surface">Demo workspace — nothing is saved</p>
            <p className="mt-0.5 text-[12px] leading-5 text-on-surface-variant">
              These fictional expenses stay only in this tab and reset on reload. This page cannot read or change a CashFlow account.
            </p>
          </div>
        </div>

        <section className="mb-6 grid gap-5 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
          <div>
            <p className="text-section-title text-primary">Lisbon weekend · 4 friends</p>
            <h1 className="mt-2 max-w-[680px] text-[28px] font-bold leading-[1.15] tracking-[-0.03em] sm:text-[36px]">
              Turn a messy group bill into a clear way to settle.
            </h1>
            <p className="mt-3 max-w-[650px] text-[14px] leading-6 text-on-surface-variant">
              Add one expense below. CashFlow recalculates who owes whom without changing the original spending history.
            </p>
          </div>
          <button type="button" onClick={resetDemo} className="btn-secondary h-10 w-fit px-4" aria-label="Reset sample">
            <span className="material-symbols-outlined text-[17px]" aria-hidden="true">restart_alt</span>
            Reset sample
          </button>
        </section>

        <section className="mb-5 grid grid-cols-2 gap-2 sm:grid-cols-3 sm:gap-3" aria-label="Trip summary">
          <SummaryCard className="col-span-2 sm:col-span-1" label="Shared spending" value={formatMoney(totalCents)} icon="receipt_long" />
          <SummaryCard label="Expenses" value={String(expenses.length)} icon="list_alt" />
          <SummaryCard label="Payments to settle" value={String(payments.length)} icon="route" />
        </section>

        <div className="grid min-w-0 gap-5 lg:grid-cols-[minmax(0,1.35fr)_minmax(330px,0.65fr)]">
          <div className="min-w-0 space-y-5">
            <section className="rounded-3xl border border-outline-variant/80 bg-surface-container p-4 shadow-[var(--shadow-card)] sm:p-5">
              <div className="mb-4">
                <p className="text-section-title">Try it</p>
                <h2 className="mt-1 text-[18px] font-bold">Add a shared expense</h2>
              </div>
              <form onSubmit={addExpense} className="space-y-4">
                <div className="grid min-w-0 gap-3 sm:grid-cols-[minmax(0,1fr)_140px_150px]">
                  <label className="min-w-0">
                    <span className="text-label mb-1.5 block">Description</span>
                    <input
                      className="input-field min-w-0"
                      value={description}
                      onChange={(event) => setDescription(event.target.value)}
                      placeholder="e.g. Ferry tickets"
                    />
                  </label>
                  <label className="min-w-0">
                    <span className="text-label mb-1.5 block">Amount (USD)</span>
                    <input
                      className="input-field min-w-0"
                      value={amount}
                      onChange={(event) => setAmount(event.target.value)}
                      inputMode="decimal"
                      placeholder="0.00"
                      aria-label="Amount in USD"
                    />
                  </label>
                  <label className="min-w-0">
                    <span className="text-label mb-1.5 block">Paid by</span>
                    <select className="input-field min-w-0" value={paidBy} onChange={(event) => setPaidBy(event.target.value)}>
                      {PEOPLE.map((person) => (
                        <option key={person.id} value={person.id}>{person.name}</option>
                      ))}
                    </select>
                  </label>
                </div>
                <fieldset>
                  <legend className="text-label mb-2">Split between</legend>
                  <div className="flex flex-wrap gap-2">
                    {PEOPLE.map((person) => {
                      const checked = participantIds.includes(person.id);
                      return (
                        <label
                          key={person.id}
                          className={`flex cursor-pointer items-center gap-2 rounded-xl border px-3 py-2 text-[12px] font-semibold transition-colors ${
                            checked
                              ? "border-primary/30 bg-primary/10 text-primary"
                              : "border-outline-variant bg-surface-container-low text-on-surface-variant"
                          }`}
                        >
                          <input
                            type="checkbox"
                            className="sr-only"
                            checked={checked}
                            onChange={() => toggleParticipant(person.id)}
                          />
                          <span className={`h-2 w-2 rounded-full ${person.color}`} />
                          {person.name}
                          {checked && <span className="material-symbols-outlined text-[14px]">check</span>}
                        </label>
                      );
                    })}
                  </div>
                </fieldset>
                {formError && <p className="text-[12px] font-medium text-error" role="alert">{formError}</p>}
                <button type="submit" className="btn-primary h-10 px-5" aria-label="Add to this demo">
                  <span className="material-symbols-outlined text-[17px]" aria-hidden="true">add</span>
                  Add to this demo
                </button>
              </form>
            </section>

            <section className="rounded-3xl border border-outline-variant/80 bg-surface-container shadow-[var(--shadow-card)]">
              <div className="flex items-center justify-between border-b border-outline-variant/70 px-4 py-4 sm:px-5">
                <div>
                  <p className="text-section-title">Spending history</p>
                  <h2 className="mt-1 text-[17px] font-bold">What the group paid for</h2>
                </div>
                <span className="text-[11px] text-on-surface-variant">Equal splits</span>
              </div>
              <div className="divide-y divide-outline-variant/60">
                {[...expenses].reverse().map((expense) => {
                  const payer = personById(expense.paidBy);
                  return (
                    <article key={expense.id} className="grid min-w-0 grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 px-4 py-3.5 sm:px-5">
                      <span className={`flex h-9 w-9 items-center justify-center rounded-xl text-[10px] font-bold text-white ${payer.color}`}>
                        {payer.initials}
                      </span>
                      <div className="min-w-0">
                        <p className="truncate text-[13px] font-bold">{expense.description}</p>
                        <p className="truncate text-[11px] text-on-surface-variant">
                          {payer.name} paid · split {expense.participantIds.length} ways
                        </p>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <span className="text-[13px] font-bold tabular-nums">{formatMoney(expense.amountCents)}</span>
                        <button
                          type="button"
                          onClick={() => setExpenses((current) => current.filter((item) => item.id !== expense.id))}
                          className="flex h-8 w-8 items-center justify-center rounded-lg text-on-surface-variant transition-colors hover:bg-error/10 hover:text-error"
                          aria-label={`Remove ${expense.description}`}
                        >
                          <span className="material-symbols-outlined text-[16px]">close</span>
                        </button>
                      </div>
                    </article>
                  );
                })}
                {expenses.length === 0 && (
                  <p className="px-5 py-8 text-center text-[12px] text-on-surface-variant">Add an expense to create a settlement plan.</p>
                )}
              </div>
            </section>
          </div>

          <aside className="min-w-0 space-y-5">
            <section className="overflow-hidden rounded-3xl border border-primary/20 bg-surface-container shadow-[var(--shadow-card)]">
              <div className="bg-gradient-to-br from-[#7558f4] to-[#5634df] p-5 text-white">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-[0.13em] text-white/75">Suggested settlement</p>
                    <h2 className="mt-1 text-[20px] font-bold">{payments.length} payments, then done</h2>
                  </div>
                  <span className="material-symbols-outlined rounded-xl bg-white/15 p-2 text-[19px]">route</span>
                </div>
                <p className="mt-3 text-[11px] leading-5 text-white/75">
                  A simple plan computed from the current balances. CashFlow never moves money.
                </p>
              </div>
              <div className="space-y-2 p-4">
                {payments.map((payment, index) => {
                  const from = personById(payment.from);
                  const to = personById(payment.to);
                  return (
                    <div key={`${payment.from}-${payment.to}-${index}`} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 rounded-2xl bg-surface-container-high p-3">
                      <div className="min-w-0">
                        <p className="truncate text-[12px] font-bold">{from.name} <span className="font-normal text-on-surface-variant">pays</span> {to.name}</p>
                        <p className="mt-0.5 text-[10px] text-on-surface-variant">One direct payment</p>
                      </div>
                      <span className="text-[13px] font-bold tabular-nums text-primary">{formatMoney(payment.amountCents)}</span>
                    </div>
                  );
                })}
                {payments.length === 0 && (
                  <div className="rounded-2xl bg-secondary/10 p-4 text-center">
                    <span className="material-symbols-outlined text-[22px] text-secondary">check_circle</span>
                    <p className="mt-1 text-[12px] font-bold">Everyone is settled</p>
                  </div>
                )}
              </div>
            </section>

            <section className="rounded-3xl border border-outline-variant/80 bg-surface-container p-4 shadow-[var(--shadow-card)]">
              <div className="mb-3 flex items-center justify-between">
                <div>
                  <p className="text-section-title">Balances</p>
                  <h2 className="mt-1 text-[16px] font-bold">Before settling</h2>
                </div>
                <span className="text-[10px] text-on-surface-variant">must net to $0</span>
              </div>
              <div className="space-y-2.5">
                {PEOPLE.map((person) => {
                  const balance = balances.get(person.id) ?? 0;
                  return (
                    <div key={person.id} className="flex items-center justify-between gap-3">
                      <div className="flex min-w-0 items-center gap-2.5">
                        <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-xl text-[9px] font-bold text-white ${person.color}`}>
                          {person.initials}
                        </span>
                        <span className="truncate text-[12px] font-semibold">{person.name}</span>
                      </div>
                      <span className={`text-[12px] font-bold tabular-nums ${balance >= 0 ? "text-secondary" : "text-error"}`}>
                        {balance >= 0 ? "+" : "−"}{formatMoney(Math.abs(balance))}
                      </span>
                    </div>
                  );
                })}
              </div>
            </section>

            <section className="rounded-3xl border border-outline-variant/80 bg-surface-container p-5 text-center shadow-[var(--shadow-card)]">
              <p className="text-[15px] font-bold">Ready to use your own group?</p>
              <p className="mt-1 text-[11px] leading-5 text-on-surface-variant">Create a private account when you’re ready. None of this sample data comes with you.</p>
              <Link to="/login" className="btn-primary mt-4 h-10 w-full">Create an account</Link>
            </section>
          </aside>
        </div>
      </main>
    </div>
  );
}

function SummaryCard({ label, value, icon, className = "" }: { label: string; value: string; icon: string; className?: string }) {
  return (
    <article className={`min-w-0 rounded-2xl border border-outline-variant/80 bg-surface-container p-3 shadow-[var(--shadow-card)] sm:p-4 ${className}`}>
      <div className="flex items-center gap-2 text-on-surface-variant">
        <span className="material-symbols-outlined text-[16px] text-primary">{icon}</span>
        <span className="truncate text-[10px] font-semibold uppercase tracking-[0.06em]">{label}</span>
      </div>
      <p className="mt-2 truncate text-[17px] font-bold tabular-nums sm:text-[22px]" aria-label={`${label}: ${value}`}>{value}</p>
    </article>
  );
}
