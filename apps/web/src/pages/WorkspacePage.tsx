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
 *
 * Either way the panels can be put away. The graph is the thing people came
 * to look at, and on a phone the sheet was taking half the screen from it; a
 * handle folds it down to a strip that still switches modes and still says
 * what the plan does. On a wide screen each panel has its own toggle. The
 * choice is remembered, because someone who wants the graph full screen wants
 * it that way next time too.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import type { Obligation } from "@cashflow/clearing";
import { groupApi, obligationApi } from "../lib/api";
import { analyse, fatesUnder, type ViewMode } from "../lib/plans";
import { PEOPLE, SAMPLES, type Nouns } from "../lib/samples";
import { useUser } from "../contexts/UserContext";
import type { Group } from "../types/index";
import { EnginePanel } from "../components/EnginePanel";
import { LedgerPanel } from "../components/LedgerPanel";
import { SheetHandle } from "../components/SheetHandle";
import { useMedia } from "../hooks/useMedia";
import { useStoredFlag } from "../hooks/useStoredFlag";
import {
  MoneyGraph,
  type GraphObligation,
  type GraphParty,
  type StageInset,
} from "../components/MoneyGraph";

type Sheet = "ledger" | "engine";

/** Which network is on the stage: one of the user's groups, or a sample. */
type Source = { kind: "group"; id: string } | { kind: "sample"; id: string };

interface Stage {
  obligations: Obligation[];
  currency: string;
  nouns: Nouns;
  cash?: Map<string, number>;
  lanes?: Map<string, number>;
  laneLabels?: string[];
}

const NO_OBLIGATIONS: Obligation[] = [];
const NO_SHOCKS: ReadonlySet<string> = new Set();

const MODES: Array<{ id: ViewMode; label: string; hint: string }> = [
  { id: "original", label: "As owed", hint: "Every debt as it stands" },
  { id: "cycles", label: "Cancel loops", hint: "Cancels the most. Nobody gains a counterparty" },
  { id: "paths", label: "Simplify all", hint: "Fewest payments, may add strangers" },
  {
    id: "solvent",
    label: "Keep solvent",
    hint: "Cancels only what leaves the most parties able to pay",
  },
];

interface ObligationResponse {
  obligations: Array<{ from: string; to: string; amount: number }>;
  members: Array<{ id: string; name: string }>;
}

/** Names read better on the graph than user ids, and stay stable as labels. */
function toObligations(data: ObligationResponse): Obligation[] {
  const names = new Map(data.members.map((member) => [member.id, member.name]));
  return data.obligations.map((item) => ({
    from: names.get(item.from) ?? item.from,
    to: names.get(item.to) ?? item.to,
    amount: item.amount,
  }));
}

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
  const [source, setSource] = useState<Source>({ kind: "sample", id: SAMPLES[0]!.id });
  const [remote, setRemote] = useState<Obligation[] | null>(null);
  const [loading, setLoading] = useState(false);
  // Obligations per group. Switching back to a group already seen should be
  // instant rather than another round trip.
  const cache = useRef(new Map<string, Obligation[]>());
  const [view, setView] = useState<ViewMode>("original");
  const [selected, setSelected] = useState<string | null>(null);
  const [sheet, setSheet] = useState<Sheet>("engine");
  const [shocked, setShocked] = useState<ReadonlySet<string>>(NO_SHOCKS);
  const [replay, setReplay] = useState(0);

  const wide = useMedia("(min-width: 1024px)");
  const widest = useMedia("(min-width: 1280px)");
  const tall = useMedia("(min-height: 900px)");

  // Which panels are out. Until someone chooses: on a phone the sheet starts
  // folded, because open it leaves the graph half a screen; a tablet has the
  // height for both. On a desk the ledger is out, and the engine panel only
  // where there is room for it beside the ledger without squeezing the graph.
  const [sheetChoice, setSheetOpen] = useStoredFlag("cashflow.workspace.sheet");
  const [ledgerChoice, setLedgerOpen] = useStoredFlag("cashflow.workspace.ledger");
  const [engineChoice, setEngineOpen] = useStoredFlag("cashflow.workspace.engine");
  const sheetOpen = sheetChoice ?? tall;
  const ledgerOpen = ledgerChoice ?? true;
  const engineOpen = engineChoice ?? widest;

  useEffect(() => {
    if (!currentUserId) return;
    let active = true;
    let warmUp = 0;

    groupApi
      .list()
      .then((list) => {
        if (!active) return;
        setGroups(list);
        // Someone with groups came for their own money, not the sample.
        if (list.length > 0) {
          setSource((current) =>
            current.kind === "group" ? current : { kind: "group", id: list[0]!.id }
          );
        }

        // Warm the other groups only once the selected one has had a clear
        // run at the network. Firing all of them at once made the group you
        // are actually looking at queue behind its own siblings.
        warmUp = window.setTimeout(() => {
          for (const item of list) {
            if (cache.current.has(item.id)) continue;
            obligationApi
              .get(item.id)
              .then((data) => {
                cache.current.set(item.id, toObligations(data));
              })
              .catch(() => {
                // A failed warm-up just means that group loads on demand.
              });
          }
        }, 1200);
      })
      .catch(() => {
        // The sample network keeps the stage populated either way.
      });

    return () => {
      active = false;
      window.clearTimeout(warmUp);
    };
  }, [currentUserId]);

  const groupId = source.kind === "group" ? source.id : null;

  useEffect(() => {
    if (!groupId) {
      setRemote(null);
      setLoading(false);
      return;
    }

    let active = true;

    // Paint from cache immediately; the request below only refreshes it.
    const cached = cache.current.get(groupId);
    if (cached) {
      setRemote(cached);
      setLoading(false);
    } else {
      setRemote(null);
      setLoading(true);
    }

    obligationApi
      .get(groupId)
      .then((data) => {
        const next = toObligations(data);
        cache.current.set(groupId, next);
        if (active) setRemote(next);
      })
      .catch(() => {
        if (active && !cached) setRemote(NO_OBLIGATIONS);
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [groupId]);

  const group = groups.find((item) => item.id === groupId);

  const stage = useMemo<Stage>(() => {
    if (source.kind === "sample") {
      const sample = SAMPLES.find((item) => item.id === source.id) ?? SAMPLES[0]!;
      return sample;
    }
    return {
      obligations: remote ?? NO_OBLIGATIONS,
      currency: group?.currency ?? "USD",
      nouns: PEOPLE,
    };
  }, [source, remote, group?.currency]);

  const money = useMoney(stage.currency);
  const hasCash = stage.cash !== undefined;

  // A different network is a different question: nobody on the new one has
  // been knocked over, and it may not have the balance sheets a mode needs.
  const pick = useCallback((next: Source): void => {
    setSource(next);
    setShocked(NO_SHOCKS);
    setSelected(null);
  }, []);

  const mode: ViewMode = view === "solvent" && !hasCash ? "cycles" : view;

  // Folded, the modes are a strip that scrolls sideways, and the one in force
  // may have been chosen while the sheet was open. Bring it back into view.
  const stripRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const strip = stripRef.current;
    const active = strip?.querySelector<HTMLElement>(".chip-active");
    if (!strip || !active) return;
    const box = strip.getBoundingClientRect();
    const chip = active.getBoundingClientRect();
    if (chip.left < box.left) strip.scrollLeft += chip.left - box.left - 12;
    else if (chip.right > box.right) strip.scrollLeft += chip.right - box.right + 12;
  }, [mode, sheetOpen, hasCash]);

  const analysis = useMemo(
    () => analyse(stage.obligations, stage.cash, shocked),
    [stage.obligations, stage.cash, shocked]
  );
  const plan = analysis.plans[mode] ?? analysis.plans.original!;
  const fates = useMemo(() => fatesUnder(analysis, mode), [analysis, mode]);

  const parties = useMemo<GraphParty[]>(
    () =>
      analysis.parties.map(({ id, net }) => {
        const fate = fates.get(id);
        return {
          id,
          label: id,
          net,
          lane: stage.lanes?.get(id),
          fate: fate
            ? { failed: fate.failed, wave: fate.wave, saved: fate.saved, sunk: fate.sunk }
            : undefined,
        };
      }),
    [analysis.parties, fates, stage.lanes]
  );

  const graphObligations = useMemo<GraphObligation[]>(() => {
    const before = pairsOf(analysis.plans.original!.remaining);
    const after = pairsOf(plan.remaining);
    const keys = new Set([...before.keys(), ...after.keys()]);

    return [...keys].map((key) => {
      const [from, to] = key.split("|") as [string, string];
      const was = before.get(key) ?? 0;
      const now = after.get(key) ?? 0;
      const state: GraphObligation["state"] =
        mode === "original"
          ? "live"
          : was === 0
            ? "new"
            : now === 0
              ? "cleared"
              : now < was
                ? "reduced"
                : "live";
      return { from, to, amount: now || was, state, unpaid: fates.get(from)?.unpaid ?? 0 };
    });
  }, [analysis.plans.original, plan.remaining, mode, fates]);

  const toggleShock = useCallback((party: string): void => {
    setShocked((current) => {
      const next = new Set(current);
      if (next.has(party)) next.delete(party);
      else next.add(party);
      return next;
    });
  }, []);

  // True only before the first response for the selected group arrives.
  const pending = loading && remote === null && source.kind === "group";
  const myName = source.kind === "group" ? currentUser?.name : undefined;
  const handleSelect = useCallback((id: string | null) => setSelected(id), []);
  const hasData = analysis.parties.length > 0;

  // Room the floating panels take from the stage, so nothing is laid out
  // underneath them.
  const inset = useMemo<StageInset>(
    () =>
      wide
        ? { top: 92, left: ledgerOpen ? 276 : 16, right: engineOpen ? 328 : 16, bottom: 76 }
        : { top: 54, left: 8, right: 8, bottom: 8 },
    [wide, ledgerOpen, engineOpen]
  );

  const ledger = (
    <LedgerPanel
      parties={parties}
      fates={fates}
      selected={selected}
      onSelect={setSelected}
      money={money}
      myName={myName}
      count={analysis.payments}
      pending={pending}
      nouns={stage.nouns}
    />
  );

  const engine = (
    <EnginePanel
      view={mode}
      plan={plan}
      analysis={analysis}
      fates={fates}
      money={money}
      myName={myName}
      pending={pending}
      nouns={stage.nouns}
      selected={selected}
      shocked={shocked}
      onToggleShock={toggleShock}
      onReplay={() => setReplay((count) => count + 1)}
      hasCash={hasCash}
    />
  );

  const modes = MODES.filter((option) => option.id !== "solvent" || hasCash);

  const modeButtons = modes.map((option) => {
    const failing = analysis.plans[option.id]?.outcome?.failed.length;
    return (
      <button
        key={option.id}
        type="button"
        onClick={() => setView(option.id)}
        title={option.hint}
        className={`chip shrink-0 justify-center whitespace-nowrap ${
          mode === option.id ? "chip-active" : ""
        }`}
      >
        {option.label}
        {/* How many cannot pay under each plan, so the comparison is on
            the control that makes it. */}
        {hasCash && failing !== undefined && (
          <span
            className={`font-mono text-[11px] tabular-nums tracking-normal ${
              mode === option.id ? "opacity-70" : "text-on-surface-variant"
            }`}
          >
            {failing}
          </span>
        )}
      </button>
    );
  });

  const modeSwitch = (
    <div
      className={`grid gap-1.5 lg:flex lg:items-center ${
        modes.length > 3 ? "grid-cols-2" : "grid-cols-3"
      }`}
    >
      {modeButtons}
    </div>
  );

  // With the sheet folded away the modes sit in one line that scrolls
  // sideways, so the strip stays a strip however many modes there are.
  const modeStrip = (
    <div ref={stripRef} className="no-scrollbar flex gap-1.5 overflow-x-auto">
      {modeButtons}
    </div>
  );

  // What the folded sheet says in place of the panels: enough to know what
  // the plan on screen does without opening anything.
  const unable = plan.outcome?.failed.length;
  const chosen = analysis.parties.find((party) => party.id === selected);
  const chosenFate = chosen ? fates.get(chosen.id) : undefined;
  const summary = pending
    ? "Loading obligations…"
    : !hasData
      ? "Nothing outstanding here."
      : chosen
        ? [
            chosen.id === myName ? "You" : chosen.id,
            `${chosen.net > 0 ? "+" : ""}${money(chosen.net)} net`,
            chosenFate?.failed ? "can’t pay" : chosenFate?.saved ? "saved by this plan" : "",
          ]
            .filter(Boolean)
            .join(" · ")
        : [
            mode === "original"
              ? `${money(analysis.gross)} over ${analysis.payments} ${
                  stage.nouns.debt[analysis.payments === 1 ? 0 : 1]
                }`
              : `${money(plan.cleared)} cancelled, ${plan.payments} ${
                  plan.payments === 1 ? "payment" : "payments"
                } left`,
            unable !== undefined && (hasCash || unable > 0) ? `${unable} can’t pay` : "",
          ]
            .filter(Boolean)
            .join(" · ");

  const panelToggle =
    "pointer-events-auto hidden h-[30px] w-[30px] shrink-0 items-center justify-center rounded-[4px] text-on-surface-variant shadow-[inset_0_0_0_1px_var(--color-outline-variant)] transition-colors hover:text-on-surface hover:shadow-[inset_0_0_0_1px_var(--color-on-surface)] lg:flex";

  return (
    <div className="stage flex h-full w-full flex-col overflow-hidden">
      {/* ── Graph region ─────────────────────────────── */}
      <div className="relative min-h-0 flex-1">
        <MoneyGraph
          parties={parties}
          obligations={graphObligations}
          quiet={loading}
          selected={selected}
          onSelect={handleSelect}
          laneLabels={stage.laneLabels}
          inset={inset}
          replay={replay}
          className="absolute inset-0"
        />

        {/* Decorative, and it collides with the chip row on narrow screens.
            A network with lanes labels its own axis instead. */}
        {!stage.lanes && (
          <div className="pointer-events-none absolute inset-x-0 top-16 z-10 hidden justify-between px-5 lg:flex">
            <span className="axis-label axis-label-soft">Tangled</span>
            <span className="axis-label axis-label-soft">Cleared</span>
          </div>
        )}

        {/* Which network is plotted, and on a wide screen, which panels are out */}
        <div className="pointer-events-none absolute inset-x-0 top-0 flex items-start justify-between gap-2 p-3">
          <button
            type="button"
            onClick={() => setLedgerOpen(!ledgerOpen)}
            aria-pressed={ledgerOpen}
            aria-label={ledgerOpen ? "Hide the ledger" : "Show the ledger"}
            title={ledgerOpen ? "Hide the ledger" : "Show the ledger"}
            className={panelToggle}
          >
            <span className="material-symbols-outlined text-[18px]">
              {ledgerOpen ? "left_panel_close" : "left_panel_open"}
            </span>
          </button>

          <div className="pointer-events-auto flex min-w-0 flex-1 items-center gap-1.5 no-scrollbar overflow-x-auto pb-1">
            {currentUserId &&
              groups.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => pick({ kind: "group", id: item.id })}
                  className={`chip shrink-0 ${
                    source.kind === "group" && item.id === source.id ? "chip-active" : ""
                  }`}
                >
                  {item.name}
                </button>
              ))}

            <span className="text-label shrink-0 px-1.5">
              {currentUserId && groups.length > 0 ? "Samples" : "Sample"}
            </span>
            {SAMPLES.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => pick({ kind: "sample", id: item.id })}
                className={`chip shrink-0 ${
                  source.kind === "sample" && item.id === source.id ? "chip-active" : ""
                }`}
              >
                {item.label}
              </button>
            ))}
          </div>

          {!currentUserId && (
            <Link
              to="/login"
              className="btn-primary pointer-events-auto shrink-0 !h-9 !px-3 !text-[12px]"
            >
              Use my group
            </Link>
          )}

          <button
            type="button"
            onClick={() => setEngineOpen(!engineOpen)}
            aria-pressed={engineOpen}
            aria-label={engineOpen ? "Hide the engine panel" : "Show the engine panel"}
            title={engineOpen ? "Hide the engine panel" : "Show the engine panel"}
            className={panelToggle}
          >
            <span className="material-symbols-outlined text-[18px]">
              {engineOpen ? "right_panel_close" : "right_panel_open"}
            </span>
          </button>
        </div>

        {/* Control room — wide screens only, and only the panels that are out */}
        {ledgerOpen && (
          <aside className="layer absolute bottom-6 left-4 top-24 hidden w-[248px] flex-col overflow-hidden lg:flex">
            {ledger}
          </aside>
        )}
        {engineOpen && (
          <aside className="layer absolute bottom-6 right-4 top-24 hidden w-[300px] flex-col overflow-hidden lg:flex">
            {engine}
          </aside>
        )}

        <div className="pointer-events-none absolute inset-x-0 bottom-0 hidden justify-center p-5 lg:flex">
          <div className="layer-lifted pointer-events-auto p-1.5">{modeSwitch}</div>
        </div>
      </div>

      {/* ── Sheet — narrow screens ───────────────────── */}
      <div className="flex shrink-0 flex-col border-t border-outline-variant bg-surface pb-[env(safe-area-inset-bottom)] lg:hidden">
        <SheetHandle open={sheetOpen} onChange={setSheetOpen} label="details" />

        <div className="px-3">{sheetOpen ? modeSwitch : modeStrip}</div>

        {sheetOpen ? (
          <>
            <div className="mt-3 flex items-center gap-1 border-b border-outline-variant px-3">
              {(
                [
                  { id: "engine", label: "Result" },
                  { id: "ledger", label: stage.nouns.party[1] },
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

            <div className="flex h-[34vh] min-h-[190px] flex-col overflow-hidden">
              {!hasData ? (
                <p className="px-4 py-8 text-center text-[12px] text-on-surface-variant">
                  {pending ? "Loading obligations…" : "Nothing outstanding here."}
                </p>
              ) : sheet === "ledger" ? (
                ledger
              ) : (
                engine
              )}
            </div>
          </>
        ) : (
          <button
            type="button"
            onClick={() => setSheetOpen(true)}
            className="flex min-h-[44px] items-center justify-between gap-3 px-4 py-2 text-left"
          >
            <span className="min-w-0 truncate text-[12px] text-on-surface">{summary}</span>
            <span className="material-symbols-outlined shrink-0 text-[18px] text-on-surface-variant">
              expand_less
            </span>
          </button>
        )}
      </div>
    </div>
  );
}
