// ──────────────────────────────────────────────
// Delete Group Modal — Danger Zone
// ──────────────────────────────────────────────

import { useState } from "react";
import { groupApi } from "../lib/api";
import type { Group } from "../types/index";
import { useNavigate } from "react-router-dom";

interface DeleteGroupModalProps {
  group: Group;
  onClose: () => void;
}

export function DeleteGroupModal({ group, onClose }: DeleteGroupModalProps) {
  const [confirmName, setConfirmName] = useState("");
  const [isDeleting, setIsDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();

  const handleDelete = async () => {
    if (confirmName !== group.name) return;
    setIsDeleting(true);
    setError(null);
    try {
      await groupApi.delete(group.id);
      navigate("/");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete group");
      setIsDeleting(false);
    }
  };

  const isMatched = confirmName === group.name;

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-fade-in" onClick={onClose}>
      <div className="glass-panel w-[480px] flex flex-col overflow-hidden animate-scale-in" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="flex justify-between items-center px-6 py-4 border-b border-error/20 bg-error/5 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-error/20 flex items-center justify-center">
              <span className="material-symbols-outlined text-error text-[18px]">warning</span>
            </div>
            <div>
              <h2 className="text-[15px] font-semibold text-error">Delete Group</h2>
              <p className="text-[11px] text-error/80">Permanent action</p>
            </div>
          </div>
          <button onClick={onClose} className="btn-ghost !p-1.5 !h-auto hover:bg-surface-variant rounded-full">
            <span className="material-symbols-outlined text-[18px]">close</span>
          </button>
        </div>

        {/* Body */}
        <div className="px-6 py-5 flex flex-col gap-4">
          {error && (
            <div className="flex items-center gap-2 p-3 rounded-lg bg-glow-error border border-error/20 text-error text-[13px]">
              <span className="material-symbols-outlined text-[16px]">error</span>
              {error}
            </div>
          )}

          <div className="text-[14px] text-on-surface-variant leading-relaxed">
            You are about to permanently delete <strong className="text-on-surface">{group.name}</strong>. 
            This action will erase all transactions, settlements, and member associations. 
            <strong> This cannot be undone.</strong>
          </div>

          <div className="flex flex-col gap-2 mt-2">
            <label className="text-[12px] font-medium text-on-surface">
              Please type <span className="font-mono bg-surface-variant px-1 py-0.5 rounded text-error">{group.name}</span> to confirm.
            </label>
            <input
              type="text"
              className="input-field font-mono"
              placeholder={group.name}
              value={confirmName}
              onChange={(e) => setConfirmName(e.target.value)}
              autoFocus
            />
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-glass-border flex justify-end gap-3 bg-surface-dim/30">
          <button onClick={onClose} className="btn-secondary" disabled={isDeleting}>
            Cancel
          </button>
          <button 
            onClick={handleDelete} 
            disabled={!isMatched || isDeleting}
            className={`btn-primary ${!isMatched ? "opacity-50" : "bg-error hover:bg-error/90 text-white border-error/50"}`}
          >
            {isDeleting ? "Deleting..." : "I understand, delete this group"}
          </button>
        </div>
      </div>
    </div>
  );
}
