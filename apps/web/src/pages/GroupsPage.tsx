// ──────────────────────────────────────────────
// Groups Dashboard — v2.1 Modernized
// ──────────────────────────────────────────────

import { useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useApi } from "../hooks/useApi";
import { groupApi, userApi } from "../lib/api";
import type { Group } from "../types/index";

function getInitials(name: string): string {
  return name.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2);
}

export function GroupsPage() {
  const { data: groups, loading, error, refetch } = useApi<Group[]>(() => groupApi.list());
  const { data: users } = useApi(() => userApi.list());
  const [showCreate, setShowCreate] = useState(false);
  const [newGroupName, setNewGroupName] = useState("");
  const [newGroupDesc, setNewGroupDesc] = useState("");
  const [selectedMembers, setSelectedMembers] = useState<string[]>([]);
  const [currency, setCurrency] = useState("USD");
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  const [searchParams] = useSearchParams();
  const searchQuery = searchParams.get("q")?.toLowerCase() || "";

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
        memberIds: selectedMembers.length > 0 ? selectedMembers : undefined,
      });
      setNewGroupName("");
      setNewGroupDesc("");
      setCurrency("USD");
      setSelectedMembers([]);
      setShowCreate(false);
      refetch();
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : "Failed to create group. Please try again.");
    } finally {
      setCreating(false);
    }
  };

  const toggleMember = (userId: string) => {
    setSelectedMembers((prev) =>
      prev.includes(userId) ? prev.filter((id) => id !== userId) : [...prev, userId]
    );
  };

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <header className="h-14 border-b border-outline-variant/30 flex items-center pl-14 md:px-6 pr-6 justify-between shrink-0 bg-surface-container/50">
        <div className="flex items-center gap-3">
          <span className="material-symbols-outlined text-on-surface-variant text-[20px]">dashboard</span>
          <h2 className="text-[15px] font-semibold text-on-surface">Groups</h2>
          {filteredGroups && (
            <span className="text-[11px] text-on-surface-variant bg-surface-variant px-2 py-0.5 rounded-full font-medium">
              {filteredGroups.length}
            </span>
          )}
        </div>
        <button onClick={() => setShowCreate(!showCreate)} className="btn-primary">
          <span className="material-symbols-outlined text-[16px]">add</span>
          New Group
        </button>
      </header>

      {/* Create Group Panel */}
      {showCreate && (
        <div className="border-b border-outline-variant/30 p-6 bg-surface-container/30 animate-slide-down">
          <div className="max-w-xl flex flex-col gap-4">
            <h3 className="text-[14px] font-semibold text-on-surface">Create New Group</h3>

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
              <label className="text-label">Description <span className="text-outline">(optional)</span></label>
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
                <option value="USD">USD ($)</option>
                <option value="EUR">EUR (€)</option>
                <option value="GBP">GBP (£)</option>
                <option value="INR">INR (₹)</option>
                <option value="CAD">CAD ($)</option>
                <option value="AUD">AUD ($)</option>
              </select>
            </div>

            {users && users.length > 0 && (
              <div className="flex flex-col gap-2">
                <label className="text-label">Add Members</label>
                <div className="flex flex-wrap gap-2">
                  {users.map((user) => (
                    <button
                      key={user.id}
                      onClick={() => toggleMember(user.id)}
                      className={`chip ${selectedMembers.includes(user.id) ? "chip-active" : ""}`}
                    >
                      <span className={`avatar avatar-sm avatar-${users.indexOf(user) % 6} !w-5 !h-5 !text-[9px]`}>
                        {getInitials(user.name)}
                      </span>
                      {user.name}
                      {selectedMembers.includes(user.id) && (
                        <span className="material-symbols-outlined text-[14px]">check</span>
                      )}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div className="flex gap-3 mt-1">
              <button
                onClick={handleCreate}
                disabled={creating || !newGroupName.trim()}
                className="btn-primary"
              >
                {creating ? "Creating..." : "Create Group"}
              </button>
              <button onClick={() => { setShowCreate(false); setCreateError(null); }} className="btn-secondary">
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Groups Grid */}
      <div className="flex-1 overflow-auto p-6">
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
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 animate-fade-in">
            {filteredGroups.map((group, idx) => (
              <GroupCard key={group.id} group={group} index={idx} />
            ))}
            {filteredGroups.length === 0 && (
              <div className="col-span-full flex flex-col items-center justify-center py-24 gap-4">
                <div className="w-16 h-16 rounded-2xl bg-surface-variant flex items-center justify-center">
                  <span className="material-symbols-outlined text-outline text-[32px]">search_off</span>
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

function GroupCard({ group, index }: { group: Group; index: number }) {
  return (
    <Link to={`/groups/${group.id}`} className="card-interactive p-5 flex flex-col gap-3 cursor-pointer group">
      <div className="flex justify-between items-start">
        <div className="flex-1 min-w-0">
          <h3 className="text-[14px] font-semibold text-on-surface group-hover:text-primary transition-colors truncate">
            {group.name}
          </h3>
          {group.description && (
            <p className="text-[12px] text-on-surface-variant mt-0.5 line-clamp-1">{group.description}</p>
          )}
        </div>
        <span className="material-symbols-outlined text-outline-variant text-[18px] group-hover:text-primary transition-colors">
          arrow_forward
        </span>
      </div>

      <div className="flex items-center justify-between mt-auto pt-2 border-t border-outline-variant/30">
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

        <div className="flex items-center gap-3 text-[11px] text-on-surface-variant font-medium">
          <span>{group.members.length} members</span>
          <span className="w-1 h-1 rounded-full bg-outline-variant" />
          <span>{group._count.transactions} txns</span>
        </div>
      </div>
    </Link>
  );
}
