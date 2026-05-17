// ──────────────────────────────────────────────
// Login Page — "Who's Watching?" Identity Picker
// ──────────────────────────────────────────────

import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { userApi } from "../lib/api";
import type { User } from "../types/index";

function getInitials(name: string): string {
  return name.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2);
}

export function LoginPage() {
  const navigate = useNavigate();
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // If already logged in, go to dashboard
    const existing = localStorage.getItem("currentUserId");
    if (existing) {
      navigate("/", { replace: true });
      return;
    }

    userApi.list().then((u) => {
      setUsers(u);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, [navigate]);

  const handleSelect = (userId: string) => {
    localStorage.setItem("currentUserId", userId);
    window.location.href = "/";
  };

  const handleCreate = async () => {
    if (!newName.trim() || !newEmail.trim()) return;
    setCreating(true);
    setError(null);
    try {
      const user = await userApi.create({ name: newName.trim(), email: newEmail.trim() });
      localStorage.setItem("currentUserId", user.id);
      window.location.href = "/";
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create user");
      setCreating(false);
    }
  };

  return (
    <div className="h-[100dvh] w-full bg-background flex items-center justify-center overflow-auto">
      <div className="w-full max-w-lg px-6 py-12 flex flex-col items-center animate-fade-in">
        {/* Logo */}
        <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-primary-container to-[#4f46e5] flex items-center justify-center mb-6 shadow-lg shadow-primary/20">
          <span className="material-symbols-outlined text-white text-[28px]">account_balance</span>
        </div>

        <h1 className="text-[28px] font-bold text-on-surface tracking-tight mb-1">
          CashFlow
        </h1>
        <p className="text-[14px] text-on-surface-variant mb-10">
          Who's using this session?
        </p>

        {/* User Grid */}
        {loading ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 w-full">
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <div key={i} className="h-[120px] rounded-xl bg-surface-variant/30 animate-pulse" />
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 w-full">
            {users.map((user, i) => (
              <button
                key={user.id}
                onClick={() => handleSelect(user.id)}
                className="group flex flex-col items-center gap-3 p-5 rounded-xl bg-surface-container border border-outline-variant/30 hover:border-primary/50 hover:bg-glow-primary hover:shadow-lg hover:shadow-primary/10 transition-all duration-200 cursor-pointer animate-slide-up"
                style={{ animationDelay: `${i * 60}ms` }}
              >
                <div className={`avatar avatar-lg avatar-${i % 6} !w-14 !h-14 !text-[18px] group-hover:scale-110 transition-transform duration-200`}>
                  {getInitials(user.name)}
                </div>
                <div className="text-center">
                  <p className="text-[13px] font-semibold text-on-surface group-hover:text-primary transition-colors">{user.name}</p>
                  <p className="text-[10px] text-on-surface-variant mt-0.5 truncate max-w-[120px]">{user.email}</p>
                </div>
              </button>
            ))}

            {/* Create New User */}
            <button
              onClick={() => setShowCreate(true)}
              className="flex flex-col items-center justify-center gap-2 p-5 rounded-xl border-2 border-dashed border-outline-variant/40 hover:border-primary/50 hover:bg-surface-container transition-all duration-200 cursor-pointer min-h-[120px]"
            >
              <span className="material-symbols-outlined text-[28px] text-on-surface-variant">person_add</span>
              <p className="text-[12px] font-medium text-on-surface-variant">New User</p>
            </button>
          </div>
        )}

        {/* Create User Form */}
        {showCreate && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-fade-in" onClick={() => setShowCreate(false)}>
            <div className="glass-panel w-[400px] flex flex-col overflow-hidden animate-scale-in" onClick={(e) => e.stopPropagation()}>
              <div className="flex justify-between items-center px-6 py-4 border-b border-glass-border">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-lg bg-glow-primary flex items-center justify-center">
                    <span className="material-symbols-outlined text-primary text-[18px]">person_add</span>
                  </div>
                  <h2 className="text-[15px] font-semibold text-on-surface">Create Profile</h2>
                </div>
                <button onClick={() => setShowCreate(false)} className="btn-ghost !p-1.5 !h-auto hover:bg-surface-variant rounded-full">
                  <span className="material-symbols-outlined text-[18px]">close</span>
                </button>
              </div>

              <div className="px-6 py-5 flex flex-col gap-4">
                {error && (
                  <div className="flex items-center gap-2 p-3 rounded-lg bg-glow-error border border-error/20 text-error text-[13px]">
                    <span className="material-symbols-outlined text-[16px]">error</span>
                    {error}
                  </div>
                )}
                <div className="flex flex-col gap-1.5">
                  <label className="text-label">Name</label>
                  <input
                    className="input-field"
                    placeholder="e.g., John Doe"
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    autoFocus
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className="text-label">Email</label>
                  <input
                    className="input-field"
                    placeholder="e.g., john@example.com"
                    type="email"
                    value={newEmail}
                    onChange={(e) => setNewEmail(e.target.value)}
                  />
                </div>
              </div>

              <div className="px-6 py-4 border-t border-glass-border flex justify-end gap-3 bg-surface-dim/30">
                <button onClick={() => setShowCreate(false)} className="btn-secondary">Cancel</button>
                <button
                  onClick={handleCreate}
                  disabled={!newName.trim() || !newEmail.trim() || creating}
                  className="btn-primary"
                >
                  {creating ? "Creating..." : "Create & Sign In"}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
