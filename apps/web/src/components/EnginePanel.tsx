/**
 * What the plan on screen does: how much it cancels, what it costs, and who
 * is left unable to pay.
 *
 * The first two have always been here. The third is the part that makes the
 * choice between plans a real one — "nobody gains a counterparty" is only
 * the whole story while everybody can pay.
 */

import type { Obligation } from "@cashflow/clearing";
import type { Analysis, Fate, Plan, ViewMode } from "../lib/plans";
import type { Nouns } from "../lib/samples";

interface EnginePanelProps {
  view: ViewMode;
  plan: Plan;
  analysis: Analysis;
  fates: Map<string, Fate>;
  money: (minorUnits: number) => string;
  myName?: string;
  pending: boolean;
  nouns: Nouns;
  selected: string | null;
  shocked: ReadonlySet<string>;
  onToggleShock: (party: string) => void;
  onReplay: () => void;
  /** True when the network came with balance sheets. */
  hasCash: boolean;
}

function plural(count: number, noun: [string, string]): string {
  return `${count} ${noun[count === 1 ? 0 : 1]}`;
}

function listOf(names: string[]): string {
  if (names.length <= 1) return names.join("");
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

export function EnginePanel({
  view,
  plan,
  analysis,
  fates,
  money,
  myName,
  pending,
  nouns,
  selected,
  shocked,
  onToggleShock,
  onReplay,
  hasCash,
}: EnginePanelProps) {
  const steps = [...plan.remaining].sort((a, b) => b.amount - a.amount);
  const display = (name: string): string => (name === myName ? "You" : name);

  return (
    <>
      <div className="border-b border-outline-variant px-4 py-3">
        <p className="text-section-title hidden lg:block">Engine</p>
        {pending ? (
          <>
            <p className="text-figure mt-2 text-[24px] !text-on-surface-variant">—</p>
            <p className="mt-1 text-[11px] leading-4 text-on-surface-variant">
              Reading this group&rsquo;s obligations…
            </p>
          </>
        ) : view === "original" ? (
          <>
            <p className="text-figure mt-2 text-[24px]">{money(analysis.gross)}</p>
            <p className="mt-1 text-[11px] leading-4 text-on-surface-variant">
              owed in total. Some of it runs in circles.
            </p>
          </>
        ) : (
          <>
            <p className="text-figure mt-2 text-[24px] !text-secondary">{money(plan.cleared)}</p>
            <p className="mt-1 text-[11px] leading-4 text-on-surface-variant">
              cancels out — nobody pays it. {money(plan.grossAfter)} left over{" "}
              {plan.payments} {plan.payments === 1 ? "payment" : "payments"}.
            </p>
          </>
        )}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {/* First, so that picking a party on the graph changes something in
            view. On a phone everything below this is under the fold. */}
        {selected && !pending && (
          <Selected
            party={selected}
            analysis={analysis}
            fate={fates.get(selected)}
            money={money}
            display={display}
            isShocked={shocked.has(selected)}
            onToggleShock={onToggleShock}
            hasCash={hasCash}
          />
        )}

        {view !== "original" && !pending && (
          <dl className="space-y-2 border-b border-outline-variant px-4 py-3">
            <Stat label="Payments" value={`${analysis.payments} → ${plan.payments}`} />
            <Stat
              label="Owing a stranger"
              value={
                plan.newPairs.length === 0 ? "Nobody" : plural(plan.newPairs.length, nouns.party)
              }
              tone={plan.newPairs.length === 0 ? "good" : "bad"}
            />
          </dl>
        )}

        {analysis.stressed && !pending && (
          <Stress
            view={view}
            plan={plan}
            analysis={analysis}
            fates={fates}
            money={money}
            display={display}
            nouns={nouns}
            shocked={shocked}
            onToggleShock={onToggleShock}
            onReplay={onReplay}
            hasCash={hasCash}
          />
        )}

        <div className="px-4 py-3">
          <p className="text-label mb-2">
            {view === "original" ? "Who owes whom" : "Payments that settle it"}
          </p>
          <Steps steps={steps} fates={fates} money={money} myName={myName} />
        </div>
      </div>
    </>
  );
}

/* ── Who can't pay ──────────────────────────────── */

function Stress({
  view,
  plan,
  analysis,
  fates,
  money,
  display,
  nouns,
  shocked,
  onToggleShock,
  onReplay,
  hasCash,
}: {
  view: ViewMode;
  plan: Plan;
  analysis: Analysis;
  fates: Map<string, Fate>;
  money: (minorUnits: number) => string;
  display: (name: string) => string;
  nouns: Nouns;
  shocked: ReadonlySet<string>;
  onToggleShock: (party: string) => void;
  onReplay: () => void;
  hasCash: boolean;
}) {
  const outcome = plan.outcome;
  if (!outcome) return null;

  const failed = outcome.failed.length;
  const firstWave = outcome.waves[0]?.length ?? 0;
  const asOwed = analysis.plans.original?.outcome?.failed.length ?? failed;

  let saved = 0;
  let sunk = 0;
  for (const fate of fates.values()) {
    if (fate.saved) saved += 1;
    if (fate.sunk) sunk += 1;
  }

  // Who is out of pocket, worst first. Exposure this plan created is flagged:
  // it is the concrete form of being handed a stranger.
  const before = analysis.plans.original?.outcome;
  const lostBefore = new Map(
    (before?.parties ?? []).map((party) => [party.party, Math.max(0, party.owed - party.collects)])
  );
  const losers = [...fates]
    .filter(([name, fate]) => fate.loss > 0.5 && !shocked.has(name))
    .sort((a, b) => b[1].loss - a[1].loss);

  return (
    <div className="border-b border-outline-variant px-4 py-3">
      <div className="flex items-baseline justify-between gap-2">
        <p className="text-label">
          {hasCash
            ? "Who can’t pay"
            : `If ${listOf([...shocked].map((name) => (display(name) === "You" ? "you" : name)))} can’t pay`}
        </p>
        {hasCash && failed > 0 && (
          <button type="button" onClick={onReplay} className="btn-ghost !h-5 !px-0 !text-[11px]">
            Replay
          </button>
        )}
      </div>

      {hasCash ? (
        <>
          <p className="text-figure mt-2 text-[20px]">
            {failed === 0 ? "Nobody" : plural(failed, nouns.party)}
          </p>
          <p className="mt-0.5 text-[11px] leading-4 text-on-surface-variant">
            {failed === 0
              ? "Everyone can cover what they owe."
              : view === "original"
                ? `cannot cover what ${failed === 1 ? "it owes" : "they owe"} as things stand.`
                : `${failed === 1 ? "fails" : "fail"} under this plan. As owed it would be ${asOwed}.`}
          </p>

          {failed > 0 && (
            <dl className="mt-3 space-y-2">
              <Stat label="Short of cash themselves" value={String(firstWave)} />
              <Stat label="Dragged down by them" value={String(failed - firstWave)} />
              {view !== "original" && (
                <>
                  <Stat label="Saved by this plan" value={String(saved)} tone={saved > 0 ? "good" : "neutral"} />
                  <Stat label="Sunk by this plan" value={String(sunk)} tone={sunk > 0 ? "bad" : "neutral"} />
                </>
              )}
            </dl>
          )}

          {view === "solvent" && plan.unavoidable && (
            <p className="mt-3 text-[11px] leading-4 text-on-surface-variant">
              {plan.provablyBest ? (
                <>
                  <span className="tag tag-credit mr-1.5 !h-[18px] !px-1.5 !text-[10px]">Proven</span>
                  No way of cancelling debt loses fewer.
                </>
              ) : (
                `At least ${plan.unavoidable.length} fail whatever is cancelled.`
              )}
            </p>
          )}
        </>
      ) : (
        <>
          <p className="text-figure mt-2 text-[20px]">{money(outcome.shortfall)}</p>
          <p className="mt-0.5 text-[11px] leading-4 text-on-surface-variant">
            {view === "original"
              ? "goes unpaid."
              : `goes unpaid under this plan. As owed it would be ${money(before?.shortfall ?? 0)}.`}
          </p>
        </>
      )}

      {losers.length > 0 && (
        <ul className="mt-3 space-y-1">
          {losers.slice(0, hasCash ? 4 : 8).map(([name, fate]) => {
            const fresh = view !== "original" && (lostBefore.get(name) ?? 0) < 0.5;
            return (
              <li key={name} className="flex items-baseline justify-between gap-2 text-[12px]">
                <span className="min-w-0 truncate text-on-surface">
                  <span className="font-medium">{display(name)}</span>
                  <span className="text-on-surface-variant">
                    {display(name) === "You" ? " are out" : " is out"}
                  </span>
                  {fresh && (
                    <span
                      className="tag tag-danger ml-1.5 !h-[18px] !px-1.5 !text-[10px]"
                      title="Not exposed as things stand. This plan created the exposure."
                    >
                      New
                    </span>
                  )}
                </span>
                <span className="text-data shrink-0 !text-[11px]">{money(fate.loss)}</span>
              </li>
            );
          })}
        </ul>
      )}

      {shocked.size > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {[...shocked].map((name) => (
            <button
              key={name}
              type="button"
              onClick={() => onToggleShock(name)}
              title="Let them pay again"
              className="tag cursor-pointer !h-[22px] hover:shadow-[inset_0_0_0_1px_var(--color-on-surface)]"
            >
              {display(name)} can&rsquo;t pay
              <span className="material-symbols-outlined !text-[13px]">close</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/* ── The party under the cursor ─────────────────── */

function Selected({
  party,
  analysis,
  fate,
  money,
  display,
  isShocked,
  onToggleShock,
  hasCash,
}: {
  party: string;
  analysis: Analysis;
  fate: Fate | undefined;
  money: (minorUnits: number) => string;
  display: (name: string) => string;
  isShocked: boolean;
  onToggleShock: (party: string) => void;
  hasCash: boolean;
}) {
  const sheet = analysis.plans.original?.outcome?.parties.find((item) => item.party === party);
  const net = analysis.parties.find((item) => item.id === party)?.net ?? 0;
  const name = display(party);
  const me = name === "You";

  return (
    <div className="border-b border-outline-variant px-4 py-3">
      <p className="text-label">{name}</p>

      {hasCash && sheet ? (
        <dl className="mt-2 space-y-2">
          <Stat label="Holds" value={money(sheet.cash)} />
          <Stat label="Owes" value={money(sheet.owes)} />
          <Stat label="Is owed" value={money(sheet.owed)} />
        </dl>
      ) : (
        <p className="mt-1 text-[12px] text-on-surface-variant">
          {net > 0
            ? `Owed ${money(net)} overall.`
            : net < 0
              ? `Owes ${money(-net)} overall.`
              : "Square overall."}
        </p>
      )}

      {isShocked ? (
        <p className="mt-2 text-[11px] leading-4 text-on-surface-variant">
          {fate?.failed
            ? "Taken as paying nothing of what is still owed."
            : "Taken as unable to pay — but under this plan nothing is left for them to pay."}
        </p>
      ) : fate?.failed ? (
        <p className="mt-2 text-[11px] leading-4 text-on-surface-variant">
          {fate.wave <= 1
            ? "Short of cash: could not pay even if paid in full."
            : `Dragged down in wave ${fate.wave}: solvent on paper, sunk by a debtor that failed.`}
        </p>
      ) : fate?.saved ? (
        <p className="mt-2 text-[11px] leading-4 text-secondary">
          Would have failed as things stand. This plan keeps it paying.
        </p>
      ) : null}

      <button
        type="button"
        onClick={() => onToggleShock(party)}
        className="btn-secondary mt-3 !h-8 w-full !rounded-[4px] !px-3 !text-[12px]"
      >
        {isShocked
          ? `Let ${me ? "yourself" : name} pay again`
          : `What if ${me ? "you" : name} can’t pay?`}
      </button>
    </div>
  );
}

/* ── Pieces ─────────────────────────────────────── */

function Steps({
  steps,
  fates,
  money,
  myName,
}: {
  steps: Obligation[];
  fates: Map<string, Fate>;
  money: (minorUnits: number) => string;
  myName?: string;
}) {
  return (
    <ul className="space-y-1">
      {steps.slice(0, 60).map((item, index) => {
        const unpaid = fates.get(item.from)?.unpaid ?? 0;
        return (
          <li
            key={`${item.from}|${item.to}|${index}`}
            className={`flex items-baseline justify-between gap-2 rounded-[4px] px-1.5 py-1 text-[12px] ${
              item.from === myName || item.to === myName ? "bg-glass-hover" : ""
            }`}
          >
            <span className="min-w-0 truncate text-on-surface">
              <span className="font-medium">{item.from === myName ? "You" : item.from}</span>
              <span className="text-on-surface-variant">
                {item.from === myName ? " pay " : " → "}
              </span>
              <span className="font-medium">{item.to === myName ? "you" : item.to}</span>
            </span>
            <span
              className={`text-data shrink-0 !text-[11px] ${
                unpaid > 0.005 ? "text-on-surface-variant line-through decoration-[0.5px]" : ""
              }`}
              title={
                unpaid > 0.005
                  ? `Only ${money(item.amount * (1 - unpaid))} of this will be paid`
                  : undefined
              }
            >
              {money(item.amount)}
            </span>
          </li>
        );
      })}
    </ul>
  );
}

function Stat({
  label,
  value,
  tone = "neutral",
}: {
  label: string;
  value: string;
  tone?: "neutral" | "good" | "bad";
}) {
  const toneClass =
    tone === "good" ? "text-secondary" : tone === "bad" ? "text-error" : "text-on-surface";
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="text-[12px] text-on-surface-variant">{label}</dt>
      <dd className={`text-[12px] font-medium tabular-nums ${toneClass}`}>{value}</dd>
    </div>
  );
}
