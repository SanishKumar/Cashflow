import { useMemo, useState } from "react";
import { settlementPaymentApi } from "../lib/api";
import type { SettlementPayment } from "../types/index";

interface SettlementPaymentsPanelProps {
  groupId: string;
  payments: SettlementPayment[];
  currentUserId: string | null;
  pendingOnly: boolean;
  loading: boolean;
  onChanged: () => void;
}

const STATUS_META = {
  PENDING: { label: "Awaiting confirmation", icon: "schedule", color: "text-warning bg-warning/10" },
  CONFIRMED: { label: "Confirmed", icon: "check_circle", color: "text-secondary bg-secondary/10" },
  REJECTED: { label: "Rejected", icon: "cancel", color: "text-error bg-error/10" },
  CANCELLED: { label: "Cancelled", icon: "block", color: "text-on-surface-variant bg-surface-container-high" },
} as const;

function formatCurrency(amount: number, currency: string) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(amount);
}

export function SettlementPaymentsPanel({
  groupId,
  payments,
  currentUserId,
  pendingOnly,
  loading,
  onChanged,
}: SettlementPaymentsPanelProps) {
  const [updating, setUpdating] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const visiblePayments = useMemo(
    () => pendingOnly ? payments.filter((payment) => payment.status === "PENDING") : payments,
    [payments, pendingOnly]
  );

  const updatePayment = async (payment: SettlementPayment, action: "confirm" | "reject" | "cancel") => {
    setUpdating(`${payment.id}:${action}`);
    setError(null);
    try {
      await settlementPaymentApi[action](groupId, payment.id);
      onChanged();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "The payment could not be updated");
    } finally {
      setUpdating(null);
    }
  };

  if (loading) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <div className="flex flex-col items-center gap-3 animate-pulse">
          <div className="h-10 w-10 rounded-xl bg-surface-variant" />
          <div className="h-3 w-32 rounded bg-surface-variant" />
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto p-4 md:p-6">
      <div className="mx-auto max-w-3xl space-y-4">
        <div>
          <p className="text-section-title">Settlement payments</p>
          <h2 className="mt-1 text-[18px] font-bold text-on-surface">Confirm what was actually sent</h2>
          <p className="mt-1 text-[12px] leading-5 text-on-surface-variant">Pending payments do not change balances until the receiving member confirms them.</p>
        </div>

        {error && <p className="rounded-xl border border-error/20 bg-error/10 p-3 text-[12px] font-medium text-error" role="alert">{error}</p>}

        {visiblePayments.length === 0 ? (
          <div className="flex min-h-[260px] flex-col items-center justify-center rounded-3xl border border-dashed border-outline-variant bg-surface-container-low p-6 text-center">
            <span className="material-symbols-outlined text-[32px] text-outline">payments</span>
            <p className="mt-3 text-[13px] font-bold text-on-surface">{pendingOnly ? "No payments need confirmation" : "No settlement payments yet"}</p>
            <p className="mt-1 max-w-sm text-[11px] leading-5 text-on-surface-variant">Use the current settlement plan to mark a payment as sent. Its status will appear here.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {visiblePayments.map((payment) => {
              const status = STATUS_META[payment.status];
              const isRecipient = payment.toUserId === currentUserId;
              const isSender = payment.fromUserId === currentUserId;
              return (
                <article key={payment.id} className="rounded-2xl border border-outline-variant/70 bg-surface-container p-4 shadow-[0_8px_20px_rgba(31,35,54,0.04)] sm:p-5">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className={`flex items-center gap-1 rounded-full px-2 py-1 text-[9px] font-bold uppercase tracking-[0.08em] ${status.color}`}>
                          <span className="material-symbols-outlined text-[13px]">{status.icon}</span>
                          {status.label}
                        </span>
                        <span className="text-[10px] text-on-surface-variant">{new Date(payment.createdAt).toLocaleString()}</span>
                      </div>
                      <p className="mt-3 text-[13px] text-on-surface">
                        <span className="font-bold">{payment.fromUser.name}</span>
                        <span className="text-on-surface-variant"> marked a payment sent to </span>
                        <span className="font-bold">{payment.toUser.name}</span>
                      </p>
                      {payment.note && <p className="mt-1 text-[11px] text-on-surface-variant">“{payment.note}”</p>}
                    </div>
                    <p className="shrink-0 text-[18px] font-bold tabular-nums text-on-surface">{formatCurrency(payment.amount, payment.currency)}</p>
                  </div>

                  {payment.status === "PENDING" && (
                    <div className="mt-4 flex flex-col gap-2 border-t border-outline-variant/60 pt-4 sm:flex-row sm:items-center sm:justify-between">
                      {isRecipient ? (
                        <>
                          <p className="text-[11px] text-on-surface-variant">Confirm only after you receive the money.</p>
                          <div className="flex gap-2">
                            <button type="button" onClick={() => updatePayment(payment, "reject")} disabled={updating !== null} className="btn-secondary h-9 px-3 text-[11px]">
                              {updating === `${payment.id}:reject` ? "Rejecting..." : "Reject"}
                            </button>
                            <button type="button" onClick={() => updatePayment(payment, "confirm")} disabled={updating !== null} className="btn-primary h-9 px-3 text-[11px]">
                              {updating === `${payment.id}:confirm` ? "Confirming..." : "Confirm received"}
                            </button>
                          </div>
                        </>
                      ) : isSender ? (
                        <>
                          <p className="text-[11px] text-on-surface-variant">Waiting for {payment.toUser.name} to confirm receipt.</p>
                          <button type="button" onClick={() => updatePayment(payment, "cancel")} disabled={updating !== null} className="btn-secondary h-9 px-3 text-[11px]">
                            {updating === `${payment.id}:cancel` ? "Cancelling..." : "Cancel record"}
                          </button>
                        </>
                      ) : (
                        <p className="text-[11px] text-on-surface-variant">Waiting for {payment.toUser.name} to confirm receipt.</p>
                      )}
                    </div>
                  )}
                  {payment.decisionNote && <p className="mt-3 text-[11px] text-on-surface-variant">Decision note: {payment.decisionNote}</p>}
                </article>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
