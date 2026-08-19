/**
 * Workspace — the money graph, and the controls that act on it.
 *
 * This is the home screen. There is no dashboard: a dashboard summarises a
 * system you cannot see, and here the system itself is on screen.
 *
 * The layout is two designs sharing one set of panels. On a wide screen the
 * panels float beside the graph as a control room. On a phone that fails
 * completely — there is no room beside anything — so the graph takes the upper
 * area and the same panels become a tabbed sheet below it. An earlier build
 * simply hid the panels under `lg`, which left a phone showing a pretty graph
 * and none of the numbers that give it meaning.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  buildGraph,
  clear,
  grossFloor,
  grossTotal,
  netPositions,
  type ClearingMode,
  type Obligation,
} from "@cashflow/clearing";
import { groupApi, obligationApi } from "../lib/api";
import { useUser } from "../contexts/UserContext";
import type { Group } from "../types/index";
import { MoneyGraph, type GraphObligation, type GraphParty } from "../components/MoneyGraph";

type ViewMode = "original" | ClearingMode;
type Sheet = "ledger" | "engine";

interface Stats {
  grossBefore: number;
  grossAfter: number;
  cleared: number;
  grossFloor: number;
  obligationsBefore: number;
  obligationsAfter: number;
  newPairs: string[];
}

/** Shown before sign-in so the front door is the product, not a login form. */
const SAMPLE: Obligation[] = [
  { from: "Priya", to: "Rahul", amount: 120_000 },
  { from: "Rahul", to: "Sam", amount: 90_000 },
  { from: "Sam", to: "Priya", amount: 70_000 },
  { from: "Dev", to: "Priya", amount: 45_000 },
  { from: "Sam", to: "Dev", amount: 30_000 },
  { from: "Rahul", to: "Dev", amount: 60_000 },
  { from: "Nina", to: "Sam", amount: 25_000 },
  { from: "Dev", to: "Nina", amount: 40_000 },
];

const NO_OBLIGATIONS: Obligation[] = [];

const MODES = [
  { id: "original", label: "As owed", hint: "Every IOU as it stands" },
  { id: "cycles", label: "Cancel loops", hint: "Safe — nobody gains a counterparty" },
  { id: "paths", label: "Simplify all", hint: "Fewest payments, may add strangers" },
] as const;

function pairsOf(obligations: readonly Obligation[]): Map<string, number> {
  const merged = new Map<string, number>();
  for (const { from, to, amount } of obligations) {
    if (from === to || amount <= 0) continue;
    const key = `${from}|${to}`;
    merged.set(key, (merged.get(key) ?? 0) + amount);
  }
  return merged;
}

function useMoney(currency: string) {
  return useMemo(() => {
    const format = new Intl.NumberFormat(currency === "INR" ? "en-IN" : "en-US", {
      style: "currency",
      currency,
      maximumFractionDigits: 0,
    });
    return (minorUnits: number): string => format.format(minorUnits / 100);
  }, [currency]);
}

export function WorkspacePage() {
  const { currentUserId, currentUser } = useUser();

  const [groups, setGroups] = useState<Group[]>([]);
  const [groupId, setGroupId] = useState<string | null>(null);
  const [remote, setRemote] = useState<Obligation[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [view, setView] = useState<ViewMode>("original");
  const [selected, setSelected] = useState<string | null>(null);
  const [sheet, setSheet] = useState<Sheet>("engine");

  useEffect(() => {
    if (!currentUserId) return;
    let active = true;

    groupApi
      .list()
      .then((list) => {
        if (!active) return;
        setGroups(list);
        if (list.length > 0) setGroupId((current) => current ?? list[0]!.id);
      })
      .catch(() => {
        // The sample network keeps the stage populated either way.
      });

    return () => {
      active = false;
    };
  }, [currentUserId]);

  useEffect(() => {
    if (!groupId) {
      setRemote(null);
      return;
    }

    let active = true;
    setLoading(true);

    obligationApi
      .get(groupId)
      .then((data) => {
        if (!active) return;
        const names = new Map(data.members.map((member) => [member.id, member.name]));
        setRemote(
          data.obligations.map((item) => ({
            from: names.get(item.from) ?? item.from,
            to: names.get(item.to) ?? item.to,
            amount: item.amount,
          }))
        );
      })
      .catch(() => {
        if (active) setRemote(NO_OBLIGATIONS);
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [groupId]);

  const group = groups.find((item) => item.id === groupId);
  const isSample = !currentUserId || remote === null;
  const obligations = isSample ? SAMPLE : remote;
  const money = useMoney(isSample ? "INR" : group?.currency ?? "USD");

  const analysis = useMemo(() => {
    const graph = buildGraph(obligations);
    const nets = netPositions(graph);
    const parties: GraphParty[] = graph.nodes.map((label, index) => ({
      id: label,
      label,
      net: nets[index] ?? 0,
    }));

    const before = pairsOf(obligations);
    return {
      parties,
      before,
      gross: grossTotal(graph),
      floor: grossFloor(graph),
      count: before.size,
    };
  }, [obligations]);

  const active = useMemo(
    () => (view === "original" ? null : clear(obligations, { mode: view, preferExistingPairs: true })),
    [obligations, view]
  );

  // Metric surface shared by both states, so the panel does not care whether a
  // solve actually ran.
  const stats: Stats = active
    ? active.metrics
    : {
        grossBefore: analysis.gross,
        grossAfter: analysis.gross,
        cleared: 0,
        grossFloor: analysis.floor,
        obligationsBefore: analysis.count,
        obligationsAfter: analysis.count,
        newPairs: [],
      };

  const graphObligations = useMemo<GraphObligation[]>(() => {
    const { before } = analysis;
    if (!active) {
      return [...before].map(([key, amount]) => {
        const [from, to] = key.split("|") as [string, string];
        return { from, to, amount, state: "live" as const };
      });
    }

    const after = pairsOf(active.remaining);
    const keys = new Set([...before.keys(), ...after.keys()]);

    return [...keys].map((key) => {
      const [from, to] = key.split("|") as [string, string];
      const was = before.get(key) ?? 0;
      const now = after.get(key) ?? 0;
      const state: GraphObligation["state"] =
        was === 0 ? "new" : now === 0 ? "cleared" : now < was ? "reduced" : "live";
      return { from, to, amount: now || was, state };
    });
  }, [analysis, active]);

  const plan = useMemo(
    () => [...(active ? active.remaining : obligations)].sort((a, b) => b.amount - a.amount),
    [active, obligations]
  );

  const myName = currentUser?.name;
  const handleSelect = useCallback((id: string | null) => setSelected(id), []);
  const hasData = analysis.parties.length > 0;

  const ledger = (
    <LedgerPanel
      parties={analysis.parties}
      selected={selected}
      onSelect={setSelected}
      money={money}
      myName={myName}
      count={stats.obligationsBefore}
    />
  );

  const engine = (
    <EnginePanel view={view} stats={stats} plan={plan} money={money} myName={myName} />
  );

  const modeSwitch = (
    <div className="flex items-center gap-1.5">
      {MODES.map((option) => (
        <button
          key={option.id}
          type="button"
          onClick={() => setView(option.id)}
          title={option.hint}
          className={`chip flex-1 justify-center whitespace-nowrap lg:flex-none ${
            view === option.id ? "chip-active" : ""
          }`}
        >
          {option.label}
        </button>
      ))}
    </div>
  );

  return (
    <div className="stage flex h-full w-full flex-col overflow-hidden">
      {/* ── Graph region ─────────────────────────────── */}
      <div className="relative min-h-0 flex-1">
        <MoneyGraph
          parties={analysis.parties}
          obligations={graphObligations}
          quiet={loading}
          selected={selected}
          onSelect={handleSelect}
          className="absolute inset-0"
        />

        {/* Decorative, and it collides with the chip row on narrow screens. */}
        <div className="pointer-events-none absolute inset-x-0 top-16 z-10 hidden justify-between px-5 lg:flex">
          <span className="axis-label axis-label-soft">Tangled</span>
          <span className="axis-label axis-label-soft">Cleared</span>
        </div>

        {/* Which network is plotted */}
        <div className="pointer-events-none absolute inset-x-0 top-0 flex items-start justify-between gap-2 p-3">
          <div className="pointer-events-auto flex min-w-0 flex-1 items-center gap-1.5 no-scrollbar overflow-x-auto pb-1">
            {currentUserId && groups.length > 0 ? (
              groups.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setGroupId(item.id)}
                  className={`chip shrink-0 ${item.id === groupId ? "chip-active" : ""}`}
                >
                  {item.name}
                </button>
              ))
            ) : (
              <span className="chip pointer-events-none shrink-0">Sample</span>
            )}
          </div>

          {!currentUserId && (
            <Link
              to="/login"
              className="btn-primary pointer-events-auto shrink-0 !h-9 !px-3 !text-[12px]"
            >
              Use my group
            </Link>
          )}
        </div>

        {/* Control room — wide screens only */}
        <aside className="layer absolute bottom-6 left-4 top-24 hidden w-[248px] flex-col overflow-hidden lg:flex">
          {ledger}
        </aside>
        <aside className="layer absolute bottom-6 right-4 top-24 hidden w-[300px] flex-col overflow-hidden xl:flex">
          {engine}
        </aside>

        <div className="pointer-events-none absolute inset-x-0 bottom-0 hidden justify-center p-5 lg:flex">
          <div className="layer-lifted pointer-events-auto p-1.5">{modeSwitch}</div>
        </div>
      </div>

      {/* ── Sheet — narrow screens ───────────────────── */}
      <div className="flex shrink-0 flex-col border-t border-outline-variant bg-surface lg:hidden">
        <div className="px-3 pt-3">{modeSwitch}</div>

        <div className="mt-3 flex items-center gap-1 border-b border-outline-variant px-3">
          {(
            [
              { id: "engine", label: "Result" },
              { id: "ledger", label: "People" },
            ] as const
          ).map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setSheet(tab.id)}
              className={`-mb-px border-b-2 px-3 py-2 font-mono text-[11px] font-medium uppercase tracking-[0.14em] transition-colors ${
                sheet === tab.id
                  ? "border-[#85c093] text-on-surface"
                  : "border-transparent text-on-surface-variant"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="flex h-[36vh] min-h-[190px] flex-col overflow-hidden">
          {!hasData ? (
            <p className="px-4 py-8 text-center text-[12px] text-on-surface-variant">
              Nothing outstanding here.
            </p>
          ) : sheet === "ledger" ? (
            ledger
          ) : (
            engine
          )}
        </div>
      </div>
    </div>
  );
}

/* ── Panels ─────────────────────────────────────── */

function LedgerPanel({
  parties,
  selected,
  onSelect,
  money,
  myName,
  count,
}: {
  parties: GraphParty[];
  selected: string | null;
  onSelect: (id: string | null) => void;
  money: (minorUnits: number) => string;
  myName?: string;
  count: number;
}) {
  return (
    <>
      <div className="hidden border-b border-outline-variant px-4 py-3 lg:block">
        <p className="text-section-title">Ledger</p>
        <p className="mt-1 text-[11px] text-on-surface-variant">
          {parties.length} people · {count} IOUs
        </p>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-2">
        {parties.length === 0 ? (
          <p className="px-2 py-6 text-center text-[11px] text-on-surface-variant">
            Nothing outstanding here.
          </p>
        ) : (
          [...parties]
            .sort((a, b) => b.net - a.net)
            .map((party) => (
              <button
                key={party.id}
                type="button"
                onClick={() => onSelect(selected === party.id ? null : party.id)}
                className={`flex w-full items-center justify-between gap-3 rounded-[4px] px-2 py-2 text-left transition-colors ${
                  selected === party.id ? "bg-glass-hover" : ""
                }`}
              >
                <span className="min-w-0 truncate text-[13px] text-on-surface">
                  {party.id === myName ? "You" : party.label}
                </span>
                <span
                  className={`text-data shrink-0 !text-[12px] ${
                    party.net > 0
                      ? "text-secondary"
                      : party.net < 0
                        ? "text-warning"
                        : "text-neutral"
                  }`}
                >
                  {party.net > 0 ? "+" : ""}
                  {money(party.net)}
                </span>
              </button>
            ))
        )}
      </div>

      <p className="hidden border-t border-outline-variant px-4 py-3 text-[11px] leading-4 text-on-surface-variant lg:block">
        A filled point is owed money. A hollow one owes it.
      </p>
    </>
  );
}

function EnginePanel({
  view,
  stats,
  plan,
  money,
  myName,
}: {
  view: ViewMode;
  stats: Stats;
  plan: Obligation[];
  money: (minorUnits: number) => string;
  myName?: string;
}) {
  return (
    <>
      <div className="border-b border-outline-variant px-4 py-3">
        <p className="text-section-title hidden lg:block">Engine</p>
        {view === "original" ? (
          <>
            <p className="text-figure mt-2 text-[24px]">{money(stats.grossBefore)}</p>
            <p className="mt-1 text-[11px] leading-4 text-on-surface-variant">
              owed in total. Some of it runs in circles.
            </p>
          </>
        ) : (
          <>
            <p className="text-figure mt-2 text-[24px] !text-secondary">{money(stats.cleared)}</p>
            <p className="mt-1 text-[11px] leading-4 text-on-surface-variant">
              cancels out — nobody pays it. {money(stats.grossAfter)} left over{" "}
              {stats.obligationsAfter} {stats.obligationsAfter === 1 ? "payment" : "payments"}.
            </p>
          </>
        )}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {view !== "original" && (
          <dl className="space-y-2 border-b border-outline-variant px-4 py-3">
            <Stat
              label="Payments"
              value={`${stats.obligationsBefore} → ${stats.obligationsAfter}`}
            />
            <Stat
              label="Owing a stranger"
              value={stats.newPairs.length === 0 ? "Nobody" : `${stats.newPairs.length} people`}
              tone={stats.newPairs.length === 0 ? "good" : "bad"}
            />
          </dl>
        )}

        <div className="px-4 py-3">
          <p className="text-label mb-2">
            {view === "original" ? "Who owes whom" : "Payments that settle it"}
          </p>
          <ul className="space-y-1">
            {plan.slice(0, 60).map((item, index) => (
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
                <span className="text-data shrink-0 !text-[11px]">{money(item.amount)}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </>
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
