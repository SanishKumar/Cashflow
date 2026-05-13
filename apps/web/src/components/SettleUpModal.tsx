// ──────────────────────────────────────────────
// Settle Up Modal — v2.1
// Shows minimized settlement plan and allows
// recording settlement payments.
// ──────────────────────────────────────────────

import { useState } from "react";
import { transactionApi } from "../lib/api";
import type { Group, Settlement } from "../types/index";

interface SettleUpModalProps {
  group: Group;
  settlements: Settlement[];
  onClose: () => void;
  onSettled: () => void;
}

function getInitials(name: string): string {
  return name.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2);
}

export function SettleUpModal({ group, settlements, onClose, onSettled }: SettleUpModalProps) {
  const [settlingIndex, setSettlingIndex] = useState<number | null>(null);
  const [settledIndices, setSettledIndices] = useState<Set<number>>(new Set());
  const [error, setError] = useState<string | null>(null);

  const handleSettle = async (settlement: Settlement, index: number) => {
    setSettlingIndex(index);
    setError(null);
    try {
      // Create a reverse transaction: the debtor pays the creditor
      await transactionApi.create(group.id, {
        paidById: settlement.from,
        amount: settlement.amount,
        description: `Settlement: ${settlement.fromName} → ${settlement.toName}`,
        status: "PENDING",
        shares: [{ owedById: settlement.to, amount: settlement.amount }],
      });
      setSettledIndices((prev) => new Set(prev).add(index));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to record settlement");
    } finally {
      setSettlingIndex(null);
    }
  };

  const allSettled = settledIndices.size === settlements.length && settlements.length > 0;

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-fade-in" onClick={onClose}>
      <div className="glass-panel w-[600px] max-h-[80vh] flex flex-col overflow-hidden animate-scale-in" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="flex justify-between items-center px-6 py-4 border-b border-glass-border shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-secondary-container to-secondary flex items-center justify-center">
              <span className="material-symbols-outlined text-white text-[18px]">handshake</span>
            </div>
            <div>
              <h2 className="text-[15px] font-semibold text-on-surface">Settle Up</h2>
              <p className="text-[11px] text-on-surface-variant">
                {settlements.length} optimized settlement{settlements.length !== 1 ? "s" : ""}
              </p>
            </div>
          </div>
          <button onClick={onClose} className="btn-ghost !p-1.5 !h-auto hover:bg-surface-variant rounded-full">
            <span className="material-symbols-outlined text-[18px]">close</span>
          </button>
        </div>

        {/* Body */}
        <div className="px-6 py-5 flex flex-col gap-4 overflow-y-auto flex-1">
          {error && (
            <div className="flex items-center gap-2 p-3 rounded-lg bg-glow-error border border-error/20 text-error text-[13px]">
              <span className="material-symbols-outlined text-[16px]">error</span>
              {error}
            </div>
          )}

          {settlements.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 gap-3">
              <div className="w-14 h-14 rounded-2xl bg-glow-secondary flex items-center justify-center">
                <span className="material-symbols-outlined text-secondary text-[28px]">check_circle</span>
              </div>
              <p className="text-[14px] font-medium text-on-surface">All settled!</p>
              <p className="text-[13px] text-on-surface-variant text-center">
                Everyone in {group.name} is square. No payments needed.
              </p>
            </div>
          ) : (
            <>
              <p className="text-[13px] text-on-surface-variant">
                The algorithm found the minimum number of payments to settle all debts:
              </p>

              {settlements.map((s, i) => {
                const isSettled = settledIndices.has(i);
                const isSettling = settlingIndex === i;

                return (
                  <div
                    key={i}
                    className={`flex items-center gap-4 p-4 rounded-lg border transition-all ${
                      isSettled
                        ? "bg-glow-secondary border-secondary/20 opacity-70"
                        : "bg-surface-dim border-outline-variant/30 hover:border-outline-variant"
                    }`}
                  >
                    {/* From */}
                    <div className="flex items-center gap-2 flex-1 min-w-0">
                      <div className={`avatar avatar-sm avatar-${i % 6}`}>
                        {getInitials(s.fromName)}
                      </div>
                      <span className="text-[13px] font-medium text-on-surface truncate">{s.fromName}</span>
                    </div>

                    {/* Arrow + Amount */}
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="material-symbols-outlined text-on-surface-variant text-[16px]">arrow_forward</span>
                      <span className="text-data font-bold text-secondary">${s.amount.toFixed(2)}</span>
                      <span className="material-symbols-outlined text-on-surface-variant text-[16px]">arrow_forward</span>
                    </div>

                    {/* To */}
                    <div className="flex items-center gap-2 flex-1 min-w-0 justify-end">
                      <span className="text-[13px] font-medium text-on-surface truncate">{s.toName}</span>
                      <div className={`avatar avatar-sm avatar-${(i + 1) % 6}`}>
                        {getInitials(s.toName)}
                      </div>
                    </div>

                    {/* Action */}
                    <button
                      onClick={() => handleSettle(s, i)}
                      disabled={isSettled || isSettling}
                      className={`shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[12px] font-medium transition-colors ${
                        isSettled
                          ? "bg-secondary/10 text-secondary border border-secondary/20 !cursor-default"
                          : "bg-primary/10 text-primary border border-primary/20 hover:bg-primary hover:text-white"
                      }`}
                    >
                      {isSettled ? (
                        <>
                          <span className="material-symbols-outlined text-[14px]">check_circle</span>
                          Settled
                        </>
                      ) : isSettling ? (
                        "Recording..."
                      ) : (
                        <>
                          <span className="material-symbols-outlined text-[14px]">payments</span>
                          Record Payment
                        </>
                      )}
                    </button>
                  </div>
                );
              })}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-glass-border flex justify-between items-center shrink-0">
          <div className="text-[12px] text-on-surface-variant">
            {settledIndices.size}/{settlements.length} recorded
          </div>
          <button onClick={allSettled ? onSettled : onClose} className={allSettled ? "btn-primary" : "btn-secondary"}>
            {allSettled ? "Done" : "Close"}
          </button>
        </div>
      </div>
    </div>
  );
}
