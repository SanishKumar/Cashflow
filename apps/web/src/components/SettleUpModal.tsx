import { useState } from "react";
import { settlementPaymentApi } from "../lib/api";
import type { Group, Settlement, SettlementPayment } from "../types/index";

interface SettleUpModalProps {
  group: Group;
  settlements: Settlement[];
  pendingPayments: SettlementPayment[];
  currentUserId: string | null;
  onClose: () => void;
  onChanged: () => void;
}

function getInitials(name: string): string {
  return name.split(" ").map((part) => part[0]).join("").toUpperCase().slice(0, 2);
}

function formatCurrency(amount: number, currency: string) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(amount);
}

export function SettleUpModal({
  group,
  settlements,
  pendingPayments,
  currentUserId,
  onClose,
  onChanged,
}: SettleUpModalProps) {
  const [sendingKey, setSendingKey] = useState<string | null>(null);
  const [sentPairs, setSentPairs] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);

  const isPending = (settlement: Settlement) =>
    sentPairs.has(`${settlement.from}:${settlement.to}`)
    || pendingPayments.some(
      (payment) => payment.status === "PENDING"
        && payment.fromUserId === settlement.from
        && payment.toUserId === settlement.to
    );

  const markSent = async (settlement: Settlement) => {
    const pairKey = `${settlement.from}:${settlement.to}`;
    setSendingKey(pairKey);
    setError(null);
    try {
      await settlementPaymentApi.create(group.id, {
        toUserId: settlement.to,
        amount: settlement.amount,
      });
      setSentPairs((previous) => new Set(previous).add(pairKey));
      onChanged();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Failed to mark this payment as sent");
    } finally {
      setSendingKey(null);
    }
  };

  const mySettlements = settlements.filter((settlement) => settlement.from === currentUserId);
  const sentCount = mySettlements.filter(isPending).length;
  const allMineSent = mySettlements.length > 0 && sentCount === mySettlements.length;

  return (
    <div className="mobile-sheet-overlay fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm animate-fade-in" onClick={onClose}>
      <div className="mobile-sheet glass-panel flex max-h-[84vh] w-full max-w-[620px] flex-col overflow-hidden animate-scale-in" onClick={(event) => event.stopPropagation()}>
        <div className="mobile-sheet-handle" />
        <div className="flex shrink-0 items-center justify-between border-b border-glass-border px-5 py-4 sm:px-6">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <span className="material-symbols-outlined text-[20px]">route</span>
            </div>
            <div className="min-w-0">
              <h2 className="text-[15px] font-bold text-on-surface">Settlement plan</h2>
              <p className="truncate text-[11px] text-on-surface-variant">{group.name} · {settlements.length} suggested payment{settlements.length === 1 ? "" : "s"}</p>
            </div>
          </div>
          <button type="button" onClick={onClose} className="btn-ghost !h-auto rounded-full !p-1.5" aria-label="Close settlement plan">
            <span className="material-symbols-outlined text-[18px]">close</span>
          </button>
        </div>

        <div className="flex flex-1 flex-col gap-4 overflow-y-auto px-4 py-5 sm:px-6">
          <div className="rounded-2xl border border-outline-variant/70 bg-surface-container-high p-4">
            <p className="text-[12px] font-bold text-on-surface">CashFlow records confirmation; it does not move money.</p>
            <p className="mt-1 text-[11px] leading-5 text-on-surface-variant">Send the payment using your preferred method, then mark it sent here. The receiving member must confirm it before balances change.</p>
          </div>

          {error && <p className="rounded-xl border border-error/20 bg-error/10 p-3 text-[12px] font-medium text-error" role="alert">{error}</p>}

          {settlements.length === 0 ? (
            <div className="flex flex-col items-center py-10 text-center">
              <span className="material-symbols-outlined text-[34px] text-secondary">check_circle</span>
              <p className="mt-2 text-[14px] font-bold">Everyone is settled</p>
              <p className="mt-1 text-[12px] text-on-surface-variant">There are no open balances in this group.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {settlements.map((settlement, index) => {
                const pairKey = `${settlement.from}:${settlement.to}`;
                const canSend = settlement.from === currentUserId;
                const pending = isPending(settlement);
                const sending = sendingKey === pairKey;

                return (
                  <article key={pairKey} className="rounded-2xl border border-outline-variant/70 bg-surface-container p-4">
                    <div className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2 sm:gap-4">
                      <div className="flex min-w-0 items-center gap-2">
                        <div className={`avatar avatar-sm avatar-${index % 6}`}>{getInitials(settlement.fromName)}</div>
                        <span className="truncate text-[12px] font-bold">{settlement.fromName}</span>
                      </div>
                      <div className="text-center">
                        <p className="text-[13px] font-bold tabular-nums text-primary">{formatCurrency(settlement.amount, group.currency)}</p>
                        <span className="material-symbols-outlined text-[16px] text-on-surface-variant">arrow_forward</span>
                      </div>
                      <div className="flex min-w-0 items-center justify-end gap-2">
                        <span className="truncate text-[12px] font-bold">{settlement.toName}</span>
                        <div className={`avatar avatar-sm avatar-${(index + 1) % 6}`}>{getInitials(settlement.toName)}</div>
                      </div>
                    </div>

                    <div className="mt-3 border-t border-outline-variant/60 pt-3">
                      {canSend ? (
                        <button
                          type="button"
                          onClick={() => markSent(settlement)}
                          disabled={pending || sending}
                          aria-label={pending ? `Payment to ${settlement.toName} awaiting confirmation` : `Mark payment to ${settlement.toName} as sent`}
                          className={`flex min-h-10 w-full items-center justify-center gap-2 rounded-xl border px-3 text-[12px] font-bold transition-colors ${
                            pending
                              ? "cursor-default border-warning/20 bg-warning/10 text-warning"
                              : "border-primary/25 bg-primary/10 text-primary hover:bg-primary hover:text-on-primary"
                          }`}
                        >
                          <span className="material-symbols-outlined text-[16px]">{pending ? "hourglass_top" : "outgoing_mail"}</span>
                          {pending ? "Sent · awaiting confirmation" : sending ? "Marking sent..." : "I sent this payment"}
                        </button>
                      ) : (
                        <p className="text-center text-[11px] text-on-surface-variant">Only {settlement.fromName} can mark this payment as sent.</p>
                      )}
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </div>

        <div className="flex shrink-0 items-center justify-between border-t border-glass-border px-4 py-4 sm:px-6">
          <p className="text-[11px] text-on-surface-variant">
            {mySettlements.length === 0 ? "No payments assigned to you" : `${sentCount}/${mySettlements.length} of your payments marked sent`}
          </p>
          <button type="button" onClick={onClose} className={allMineSent ? "btn-primary" : "btn-secondary"}>{allMineSent ? "Done" : "Close"}</button>
        </div>
      </div>
    </div>
  );
}
