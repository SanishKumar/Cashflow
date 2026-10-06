/**
 * Everyone on the stage, by what they are owed.
 *
 * Doubles as the index for the graph: on a crowded network it is easier to
 * find a party here than to hunt for its plate.
 */

import type { Fate } from "../lib/plans";
import type { Nouns } from "../lib/samples";

export interface LedgerParty {
  id: string;
  label: string;
  net: number;
}

interface LedgerPanelProps {
  parties: LedgerParty[];
  fates: Map<string, Fate>;
  selected: string | null;
  onSelect: (id: string | null) => void;
  money: (minorUnits: number) => string;
  myName?: string;
  count: number;
  pending: boolean;
  nouns: Nouns;
}

function Marker({ fate }: { fate: Fate | undefined }) {
  if (!fate) return null;

  // Same vocabulary as the plates on the graph: inked in for a failure, moss
  // for a rescue, the alarm hue for a party this plan sank.
  const style = fate.sunk
    ? "bg-tertiary"
    : fate.failed
      ? "bg-on-surface"
      : fate.saved
        ? "bg-[#85c093]"
        : "bg-transparent shadow-[inset_0_0_0_1px_var(--color-outline-variant)]";
  const title = fate.sunk
    ? "Sunk by this plan"
    : fate.failed
      ? "Cannot pay"
      : fate.saved
        ? "Saved by this plan"
        : "Pays in full";

  return <span title={title} className={`h-[7px] w-[7px] shrink-0 rounded-[1px] ${style}`} />;
}

export function LedgerPanel({
  parties,
  fates,
  selected,
  onSelect,
  money,
  myName,
  count,
  pending,
  nouns,
}: LedgerPanelProps) {
  const stressed = fates.size > 0;

  return (
    <>
      <div className="hidden border-b border-outline-variant px-4 py-3 lg:block">
        <p className="text-section-title">Ledger</p>
        <p className="mt-1 text-[11px] text-on-surface-variant">
          {pending
            ? "Loading"
            : `${parties.length} ${nouns.party[parties.length === 1 ? 0 : 1]} · ${count} ${nouns.debt[count === 1 ? 0 : 1]}`}
        </p>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-2">
        {parties.length === 0 ? (
          <p className="px-2 py-6 text-center text-[11px] text-on-surface-variant">
            {pending ? "Loading obligations…" : "Nothing outstanding here."}
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
                <span className="flex min-w-0 items-center gap-2">
                  {stressed && <Marker fate={fates.get(party.id)} />}
                  <span className="min-w-0 truncate text-[13px] text-on-surface">
                    {party.id === myName ? "You" : party.label}
                  </span>
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
        {stressed
          ? "Inked in cannot pay. A green ring was saved by this plan; an indigo one was sunk by it."
          : "A filled point is owed money. A hollow one owes it."}
      </p>
    </>
  );
}
