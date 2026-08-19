// ──────────────────────────────────────────────
// Groups Dashboard — v2.1 Modernized
// ──────────────────────────────────────────────

import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useApi } from "../hooks/useApi";
import { groupApi, userApi } from "../lib/api";
import { useUser } from "../contexts/UserContext";
import type { Group, User } from "../types/index";

type InviteUser = Pick<User, "id" | "name" | "email" | "avatarUrl">;

function getInitials(name: string): string {
  return name.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2);
}

export function GroupsPage() {
  const { currentUserId } = useUser();
  const [searchParams, setSearchParams] = useSearchParams();
  const { data: groups, loading, error, refetch } = useApi<Group[]>(() => groupApi.list());
  const [showCreate, setShowCreate] = useState(false);
  const [newGroupName, setNewGroupName] = useState("");
  const [newGroupDesc, setNewGroupDesc] = useState("");
  const [selectedMembers, setSelectedMembers] = useState<InviteUser[]>([]);
  const [memberEmail, setMemberEmail] = useState("");
  const [memberLookupLoading, setMemberLookupLoading] = useState(false);
  const [memberLookupError, setMemberLookupError] = useState<string | null>(null);
  const [currency, setCurrency] = useState("USD");
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  const searchQuery = searchParams.get("q")?.toLowerCase() || "";
  const createRequested = searchParams.get("create") === "1";

  useEffect(() => {
    setShowCreate(createRequested);
  }, [createRequested]);

  const setCreatePanelOpen = (open: boolean) => {
    setShowCreate(open);
    setCreateError(null);
    const nextParams = new URLSearchParams(searchParams);
    if (open) nextParams.set("create", "1");
    else nextParams.delete("create");
    setSearchParams(nextParams, { replace: true });
  };

  const filteredGroups = groups?.filter(
    (g) => g.name.toLowerCase().includes(searchQuery) || g.description?.toLowerCase().includes(searchQuery)
  );

  const handleCreate = async () => {
    if (!newGroupName.trim()) return;
    setCreating(true);
    setCreateError(null);
    try {
      await groupApi.create({
        name: newGroupName.trim(),
        description: newGroupDesc.trim() || undefined,
        currency,
        memberIds: selectedMembers.length > 0 ? selectedMembers.map((member) => member.id) : undefined,
      });
      setNewGroupName("");
      setNewGroupDesc("");
      setCurrency("USD");
      setSelectedMembers([]);
      setMemberEmail("");
      setCreatePanelOpen(false);
      refetch();
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : "Failed to create group. Please try again.");
    } finally {
      setCreating(false);
    }
  };

  const addMemberByEmail = async () => {
    const email = memberEmail.trim().toLowerCase();
    if (!email) return;

    setMemberLookupLoading(true);
    setMemberLookupError(null);
    try {
      const member = await userApi.lookup(email);
      if (member.id === currentUserId) {
        setMemberLookupError("You are added automatically as the group administrator.");
        return;
      }
      if (selectedMembers.some((selected) => selected.id === member.id)) {
        setMemberLookupError("This person is already selected.");
        return;
      }
      setSelectedMembers((current) => [...current, member]);
      setMemberEmail("");
    } catch (err) {
      setMemberLookupError(err instanceof Error ? err.message : "Could not find that account.");
    } finally {
      setMemberLookupLoading(false);
    }
  };

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <header className="flex shrink-0 flex-col gap-4 px-4 pb-3 pt-5 md:flex-row md:items-end md:justify-between md:px-8 md:pb-4 md:pt-7">
        <div className="flex items-end gap-3">
          <div>
            <p className="mb-1 text-[10px] font-bold uppercase tracking-[0.14em] text-primary">Workspace</p>
            <h2 className="text-[24px] font-bold tracking-tight text-on-surface">Your groups</h2>
            <p className="mt-1 text-[12px] text-on-surface-variant">Every trip, home, and team in one place.</p>
          </div>
          {filteredGroups && (
            <span className="mb-0.5 rounded-full bg-primary/10 px-2.5 py-1 text-[10px] font-bold text-primary">
              {filteredGroups.length}
            </span>
          )}
        </div>
        {!showCreate && (
          <button onClick={() => setCreatePanelOpen(true)} className="btn-primary w-full md:w-auto !h-10 !px-5 !text-[13px]">
            <span className="material-symbols-outlined text-[16px]">add</span>
            New Group
          </button>
        )}
      </header>

      {/* Groups Grid */}
      <div className="mobile-scroll-safe flex-1 overflow-auto px-4 pb-6 md:px-8 md:pb-8">
        {showCreate && (
          <div className="mb-6 rounded-[24px] border border-primary/15 bg-surface-container p-5 shadow-[0_12px_32px_rgba(31,35,54,0.06)] animate-slide-down">
            <div className="max-w-xl flex flex-col gap-4">
              <div className="flex items-center justify-between gap-3">
                <h3 className="text-[14px] font-semibold text-on-surface">Create New Group</h3>
                <button
                  type="button"
                  onClick={() => setCreatePanelOpen(false)}
                  className="touch-target inline-flex items-center justify-center rounded-md text-on-surface-variant hover:bg-surface-variant hover:text-on-surface transition-colors"
                  aria-label="Close create group"
                >
                  <span className="material-symbols-outlined text-[20px]">close</span>
                </button>
              </div>

              {createError && (
                <div className="flex items-center gap-2 p-3 rounded-lg bg-glow-error border border-error/20 text-error text-[13px]">
                  <span className="material-symbols-outlined text-[16px]">error</span>
                  {createError}
                </div>
              )}

              <div className="flex flex-col gap-1.5">
                <label className="text-label">Group Name</label>
                <input
                  className="input-field"
                  placeholder="e.g., Engineering Team, Road Trip, Apartment..."
                  value={newGroupName}
                  onChange={(e) => setNewGroupName(e.target.value)}
                  autoFocus
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-label">Description <span className="text-on-surface-variant">(optional)</span></label>
                <input
                  className="input-field"
                  placeholder="What's this group for?"
                  value={newGroupDesc}
                  onChange={(e) => setNewGroupDesc(e.target.value)}
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-label">Currency</label>
                <select
                  className="input-field"
                  value={currency}
                  onChange={(e) => setCurrency(e.target.value)}
                >
                  <option value="USD">USD</option>
                  <option value="EUR">EUR</option>
                  <option value="GBP">GBP</option>
                  <option value="INR">INR</option>
                  <option value="CAD">CAD</option>
                  <option value="AUD">AUD</option>
                </select>
              </div>

              <div className="flex flex-col gap-2">
                <label className="text-label" htmlFor="member-email">Add members by exact email <span className="text-on-surface-variant">(optional)</span></label>
                <div className="flex flex-col gap-2 sm:flex-row">
                  <input
                    id="member-email"
                    type="email"
                    className="input-field"
                    placeholder="friend@example.com"
                    value={memberEmail}
                    onChange={(event) => {
                      setMemberEmail(event.target.value);
                      setMemberLookupError(null);
                    }}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") {
                        event.preventDefault();
                        void addMemberByEmail();
                      }
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => void addMemberByEmail()}
                    disabled={memberLookupLoading || !memberEmail.trim()}
                    className="btn-secondary shrink-0"
                  >
                    {memberLookupLoading ? "Checking..." : "Add person"}
                  </button>
                </div>
                <p className="text-[11px] text-on-surface-variant">CashFlow does not expose a browsable member directory.</p>
                {memberLookupError && <p className="text-[12px] text-error">{memberLookupError}</p>}
                {selectedMembers.length > 0 && (
                  <div className="flex flex-wrap gap-2 pt-1">
                    {selectedMembers.map((member, index) => (
                      <button
                        type="button"
                        key={member.id}
                        onClick={() => setSelectedMembers((current) => current.filter((item) => item.id !== member.id))}
                        className="chip chip-active"
                        aria-label={`Remove ${member.name}`}
                      >
                        <span className={`avatar avatar-sm avatar-${index % 6} !h-5 !w-5 !text-[9px]`}>{getInitials(member.name)}</span>
                        {member.name}
                        <span className="material-symbols-outlined text-[14px]">close</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <div className="flex flex-col sm:flex-row gap-3 mt-1">
                <button
                  onClick={handleCreate}
                  disabled={creating || !newGroupName.trim()}
                  className="btn-primary"
                >
                  {creating ? "Creating..." : "Create Group"}
                </button>
                <button onClick={() => setCreatePanelOpen(false)} className="btn-secondary">
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}

        {loading && (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className="card-interactive p-5 h-[140px] animate-pulse">
                <div className="h-4 bg-surface-variant rounded w-1/2 mb-3" />
                <div className="h-3 bg-surface-variant rounded w-3/4" />
              </div>
            ))}
          </div>
        )}

        {error && (
          <div className="flex flex-col items-center justify-center h-full gap-4 animate-fade-in">
            <div className="w-16 h-16 rounded-2xl bg-glow-error flex items-center justify-center">
              <span className="material-symbols-outlined text-error text-[32px]">cloud_off</span>
            </div>
            <p className="text-[14px] font-medium text-on-surface">Unable to connect</p>
            <p className="text-[13px] text-on-surface-variant text-center max-w-sm">
              Make sure the backend server is running on port 4000 and the database is accessible.
            </p>
            <button onClick={refetch} className="btn-secondary mt-2">
              <span className="material-symbols-outlined text-[16px]">refresh</span>
              Try Again
            </button>
          </div>
        )}

        {!loading && !error && filteredGroups && (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3 animate-fade-in">
            {filteredGroups.map((group, idx) => (
              <GroupCard key={group.id} group={group} index={idx} currentUserId={currentUserId} />
            ))}
            {filteredGroups.length === 0 && (
              <div className="col-span-full flex flex-col items-center justify-center py-24 gap-4">
                <div className="w-16 h-16 rounded-2xl bg-surface-variant flex items-center justify-center">
                  <span className="material-symbols-outlined text-on-surface-variant text-[32px]">search_off</span>
                </div>
                <p className="text-[14px] font-medium text-on-surface">
                  {searchQuery ? "No groups found" : "No groups yet"}
                </p>
                <p className="text-[13px] text-on-surface-variant">
                  {searchQuery ? `We couldn't find any groups matching "${searchQuery}"` : "Create your first group to start tracking shared expenses."}
                </p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function GroupCard({ group, index, currentUserId }: { group: Group; index: number; currentUserId: string | null }) {
  const myMembership = group.members.find(m => m.userId === currentUserId);
  const myRole = myMembership?.role ?? "MEMBER";

  return (
    <Link to={`/groups/${group.id}`} className="group flex min-h-[190px] cursor-pointer flex-col rounded-[24px] border border-outline-variant/70 bg-surface-container p-5 shadow-[0_10px_28px_rgba(31,35,54,0.05)] transition-all duration-200 hover:-translate-y-1 hover:border-primary/25 hover:shadow-[0_18px_32px_rgba(31,35,54,0.1)]">
      <div className="flex items-start gap-3">
        <div className="avatar avatar-md shrink-0">
          {getInitials(group.name)}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h3 className="truncate text-[15px] font-bold text-on-surface transition-colors group-hover:text-primary">
              {group.name}
            </h3>
            <span className={`text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-full ${
              myRole === "ADMIN"
                ? "bg-primary/15 text-primary border border-primary/30"
                : "bg-surface-variant text-on-surface-variant"
            }`}>
              {myRole}
            </span>
          </div>
          {group.description && (
            <p className="text-[12px] text-on-surface-variant mt-0.5 line-clamp-1">{group.description}</p>
          )}
        </div>
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-surface-container-high text-on-surface-variant transition-colors group-hover:bg-primary/10 group-hover:text-primary">
          <span className="material-symbols-outlined text-[17px]">arrow_forward</span>
        </span>
      </div>

      <div className="mt-auto flex items-center justify-between border-t border-outline-variant/60 pt-4">
        {/* Member avatars */}
        <div className="flex -space-x-1.5">
          {group.members.slice(0, 4).map((member, i) => (
            <div
              key={member.id}
              className={`avatar avatar-sm avatar-${(index + i) % 6} ring-2 ring-surface-container`}
              title={member.user.name}
            >
              {getInitials(member.user.name)}
            </div>
          ))}
          {group.members.length > 4 && (
            <div className="avatar avatar-sm bg-surface-variant text-on-surface-variant ring-2 ring-surface-container">
              +{group.members.length - 4}
            </div>
          )}
        </div>

        <div className="flex items-center gap-3 text-[10px] font-semibold text-on-surface-variant">
          <span>{group.members.length} people</span>
          <span className="w-1 h-1 rounded-full bg-outline-variant" />
          <span>{group._count.transactions} expenses</span>
        </div>
      </div>
    </Link>
  );
}
