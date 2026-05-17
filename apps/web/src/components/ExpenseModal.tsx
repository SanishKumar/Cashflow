// ──────────────────────────────────────────────
// Expense Entry Modal — v2.1 Fixed & Modernized
// ──────────────────────────────────────────────

import { useState, useMemo, useRef } from "react";
import Tesseract from "tesseract.js";
import { transactionApi } from "../lib/api";
import { useUser } from "../contexts/UserContext";
import type { Group } from "../types/index";

interface ExpenseModalProps {
  group: Group;
  onClose: () => void;
  onCreated: () => void;
}

type SplitMode = "equal" | "exact";

function getInitials(name: string): string {
  return name.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2);
}

export function ExpenseModal({ group, onClose, onCreated }: ExpenseModalProps) {
  const { currentUserId } = useUser();
  const [description, setDescription] = useState("");
  const [paidById, setPaidById] = useState(currentUserId || (group.members[0]?.userId ?? ""));
  const [currency, setCurrency] = useState(group.currency || "USD");
  const [amount, setAmount] = useState("");
  const [splitMode, setSplitMode] = useState<SplitMode>("equal");
  const [selectedMembers, setSelectedMembers] = useState<Set<string>>(
    new Set(group.members.map((m) => m.userId))
  );
  const [exactAmounts, setExactAmounts] = useState<Map<string, string>>(new Map());
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [scanning, setScanning] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const parsedAmount = parseFloat(amount) || 0;

  const shares = useMemo(() => {
    const memberArr = group.members.filter((m) => selectedMembers.has(m.userId));
    if (memberArr.length === 0) return [];

    if (splitMode === "equal") {
      const perPerson = Math.round((parsedAmount / memberArr.length) * 100) / 100;
      const result = memberArr.map((m) => ({
        owedById: m.userId,
        amount: perPerson,
        name: m.user.name,
      }));
      
      const currentTotal = result.reduce((sum, s) => sum + s.amount, 0);
      const diff = Math.round((parsedAmount - currentTotal) * 100) / 100;
      if (diff !== 0 && result.length > 0) {
        result[0].amount = Math.round((result[0].amount + diff) * 100) / 100;
      }
      return result;
    }

    return memberArr.map((m) => ({
      owedById: m.userId,
      amount: parseFloat(exactAmounts.get(m.userId) ?? "0") || 0,
      name: m.user.name,
    }));
  }, [group.members, selectedMembers, splitMode, parsedAmount, exactAmounts]);

  const shareTotal = shares.reduce((sum, s) => sum + s.amount, 0);
  const remaining = parsedAmount - shareTotal;
  const isBalanced = Math.abs(remaining) < 0.01;
  const canSubmit = description.trim() && parsedAmount > 0 && shares.length > 0 && (splitMode === "equal" || isBalanced);

  const toggleMember = (userId: string) => {
    setSelectedMembers((prev) => {
      const next = new Set(prev);
      if (next.has(userId)) {
        if (next.size > 1) next.delete(userId);
      } else {
        next.add(userId);
      }
      return next;
    });
  };

  const distributeEvenly = () => {
    const memberArr = group.members.filter((m) => selectedMembers.has(m.userId));
    if (memberArr.length === 0) return;
    const perPerson = (parsedAmount / memberArr.length).toFixed(2);
    const next = new Map<string, string>();
    memberArr.forEach((m) => next.set(m.userId, perPerson));
    setExactAmounts(next);
  };

  const handleSubmit = async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    setError(null);
    try {
      await transactionApi.create(group.id, {
        paidById,
        amount: parsedAmount,
        currency,
        description: description.trim(),
        shares: shares.map((s) => ({ owedById: s.owedById, amount: s.amount })),
      });
      onCreated();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create expense");
    } finally {
      setSubmitting(false);
    }
  };

  const handleScan = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setScanning(true);
    setError(null);
    try {
      const { data: { text } } = await Tesseract.recognize(file, 'eng');
      
      const matches = text.match(/\$?\s*\d+\.\d{2}/g);
      if (matches && matches.length > 0) {
        const amounts = matches.map((m: string) => parseFloat(m.replace(/[^0-9.]/g, '')));
        const maxAmount = Math.max(...amounts);
        setAmount(maxAmount.toFixed(2));
        setDescription("Scanned Receipt");
      } else {
        setError("Could not extract a valid price from the receipt.");
      }
    } catch (err) {
      setError("Failed to scan receipt. Please enter details manually.");
    } finally {
      setScanning(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-fade-in" onClick={onClose}>
      <div
        className="glass-panel w-[560px] max-h-[85vh] flex flex-col overflow-hidden animate-scale-in"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex justify-between items-center px-6 py-4 border-b border-glass-border shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-primary-container to-[#4f46e5] flex items-center justify-center">
              <span className="material-symbols-outlined text-white text-[18px]">receipt_long</span>
            </div>
            <div>
              <h2 className="text-[15px] font-semibold text-on-surface">Add Expense</h2>
              <p className="text-[11px] text-on-surface-variant">{group.name}</p>
            </div>
          </div>
          <button onClick={onClose} className="btn-ghost !p-1.5 !h-auto hover:bg-surface-variant rounded-full">
            <span className="material-symbols-outlined text-[18px]">close</span>
          </button>
        </div>

        {/* Form */}
        <div className="px-6 py-5 flex flex-col gap-5 overflow-y-auto flex-1">
          {error && (
            <div className="flex items-center gap-2 p-3 rounded-lg bg-glow-error border border-error/20 text-error text-[13px]">
              <span className="material-symbols-outlined text-[16px]">error</span>
              {error}
            </div>
          )}

          {/* Drag & Drop OCR Zone */}
          <div 
            className={`relative w-full shrink-0 min-h-[120px] border-2 border-dashed rounded-xl p-6 flex flex-col items-center justify-center transition-colors cursor-pointer overflow-hidden ${
              scanning 
                ? "border-primary/50 bg-glow-primary" 
                : "border-outline-variant/50 hover:border-primary/50 hover:bg-surface-variant/30"
            }`}
            onClick={() => fileInputRef.current?.click()}
            onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); }}
            onDrop={(e) => {
              e.preventDefault();
              e.stopPropagation();
              const file = e.dataTransfer.files?.[0];
              if (file) handleScan({ target: { files: [file] } } as any);
            }}
          >
            {scanning ? (
              <>
                <span className="material-symbols-outlined text-[32px] text-primary animate-spin mb-2">sync</span>
                <p className="text-[13px] font-medium text-primary">Analyzing receipt via Tesseract.js...</p>
                <div className="absolute bottom-0 left-0 h-1 bg-primary animate-[progress-bar_2s_ease-in-out_infinite] w-full" />
              </>
            ) : (
              <>
                <span className="material-symbols-outlined text-[32px] text-on-surface-variant mb-2">document_scanner</span>
                <p className="text-[13px] font-medium text-on-surface">Drag & Drop receipt image</p>
                <p className="text-[11px] text-on-surface-variant mt-1">or click to browse</p>
              </>
            )}
            <input 
              type="file" 
              accept="image/*" 
              ref={fileInputRef} 
              className="hidden" 
              onChange={handleScan} 
            />
          </div>

          {/* Description */}
          <div className="flex flex-col gap-1.5">
            <label className="text-label">What's this for?</label>
            <input
              className="input-field"
              placeholder="e.g., Dinner, Uber, Groceries, Coffee..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              autoFocus
            />
          </div>

          {/* Amount + Currency + Paid By */}
          <div className="grid grid-cols-[1fr_auto_1fr] gap-4">
            <div className="flex flex-col gap-1.5">
              <label className="text-label">Amount</label>
              <div className="relative">
                <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-on-surface-variant text-[14px] font-medium">
                  {new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(0).replace(/\d|\.|\,/g, '').trim()}
                </span>
                <input
                  className="input-field input-field-mono !pl-8"
                  type="number"
                  step="0.01"
                  min="0"
                  placeholder="0.00"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                />
              </div>
            </div>
            <div className="flex flex-col gap-1.5 w-24">
              <label className="text-label">Currency</label>
              <select
                className="input-field"
                value={currency}
                onChange={(e) => setCurrency(e.target.value)}
              >
                <option value="USD">USD</option>
                <option value="EUR">EUR</option>
                <option value="GBP">GBP</option>
                <option value="CAD">CAD</option>
                <option value="AUD">AUD</option>
                <option value="INR">INR</option>
              </select>
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-label">Paid by</label>
              <select
                className="input-field"
                value={paidById}
                onChange={(e) => setPaidById(e.target.value)}
              >
                {group.members.map((m) => (
                  <option key={m.userId} value={m.userId}>{m.user.name}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Split Mode */}
          <div className="flex flex-col gap-2">
            <label className="text-label">Split method</label>
            <div className="flex gap-2">
              <button
                onClick={() => setSplitMode("equal")}
                className={`chip flex-1 justify-center ${splitMode === "equal" ? "chip-active" : ""}`}
              >
                <span className="material-symbols-outlined text-[14px]">drag_handle</span>
                Equal Split
              </button>
              <button
                onClick={() => setSplitMode("exact")}
                className={`chip flex-1 justify-center ${splitMode === "exact" ? "chip-active" : ""}`}
              >
                <span className="material-symbols-outlined text-[14px]">edit</span>
                Exact Amounts
              </button>
            </div>
          </div>

          {/* Exact mode helper */}
          {splitMode === "exact" && parsedAmount > 0 && (
            <div className="flex items-center justify-between">
              <div className={`text-[12px] font-medium ${isBalanced ? "text-secondary" : Math.abs(remaining) > 0.01 ? "text-warning" : "text-on-surface-variant"}`}>
                {isBalanced
                  ? "✓ Amounts balanced"
                  : `$${remaining.toFixed(2)} remaining to allocate`}
              </div>
              <button onClick={distributeEvenly} className="btn-ghost text-[11px] text-primary">
                Split evenly
              </button>
            </div>
          )}

          {/* Members Table */}
          <div className="rounded-lg border border-outline-variant/50 overflow-hidden flex flex-col min-h-[200px] max-h-[300px]">
            <div className="flex bg-surface-dim px-4 py-2 border-b border-outline-variant/30 shrink-0">
              <div className="flex-1 text-label text-[10px]">Member</div>
              <div className="w-28 text-label text-[10px] text-right">Share</div>
            </div>

            <div className="overflow-y-auto flex-1">
            {group.members.map((member, i) => {
              const isSelected = selectedMembers.has(member.userId);
              const share = shares.find((s) => s.owedById === member.userId);
              const isPayer = member.userId === paidById;

              return (
                <div
                  key={member.userId}
                  className={`flex items-center px-4 py-2.5 border-b border-outline-variant/20 last:border-b-0 transition-colors ${
                    isSelected ? "bg-transparent" : "bg-surface-dim/50 opacity-50"
                  }`}
                >
                  <button onClick={() => toggleMember(member.userId)} className="mr-3 flex items-center">
                    <span className={`material-symbols-outlined text-[18px] ${isSelected ? "text-primary" : "text-outline"}`}>
                      {isSelected ? "check_box" : "check_box_outline_blank"}
                    </span>
                  </button>
                  <div className="flex-1 flex items-center gap-2.5">
                    <div className={`avatar avatar-sm avatar-${i % 6} !w-7 !h-7 !text-[10px]`}>
                      {getInitials(member.user.name)}
                    </div>
                    <span className="text-[13px] font-medium text-on-surface">{member.user.name}</span>
                    {isPayer && (
                      <span className="text-[9px] text-primary bg-glow-primary px-1.5 py-0.5 rounded font-semibold">PAYER</span>
                    )}
                  </div>
                  <div className="w-28 text-right">
                    {splitMode === "exact" && isSelected ? (
                      <input
                        className="input-field input-field-mono !py-1 !px-2 !text-right !text-[13px] !w-24 !rounded-md"
                        type="number"
                        step="0.01"
                        min="0"
                        placeholder="0.00"
                        value={exactAmounts.get(member.userId) ?? ""}
                        onChange={(e) => {
                          const next = new Map(exactAmounts);
                          next.set(member.userId, e.target.value);
                          setExactAmounts(next);
                        }}
                      />
                    ) : (
                      <span className="text-data text-on-surface">
                        {isSelected && share ? `$${share.amount.toFixed(2)}` : "—"}
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-glass-border flex justify-between items-center shrink-0">
          <button onClick={onClose} className="btn-ghost text-on-surface-variant">
            <span className="material-symbols-outlined text-[16px]">close</span>
            Discard
          </button>
          <div className="flex items-center gap-4">
            <div className="text-right">
              <div className="text-[11px] text-on-surface-variant">Total</div>
              <div className="text-data-lg text-on-surface">${parsedAmount.toFixed(2)}</div>
            </div>
            <button onClick={handleSubmit} disabled={!canSubmit || submitting} className="btn-primary">
              {submitting ? "Adding..." : "Add Expense"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
