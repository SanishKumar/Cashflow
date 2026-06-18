/**
 * Role Manager Component
 *
 * Allows Group ADMINs to change the roles of other members (ADMIN, MEMBER, AUDITOR).
 */

import { useState } from "react";
import { groupApi } from "../lib/api";
import type { Group, GroupMember } from "../types/index";

interface RoleManagerProps {
  group: Group;
  currentUserId: string | null;
  onRoleChanged: () => void;
}

export function RoleManager({ group, currentUserId, onRoleChanged }: RoleManagerProps) {
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  const isAdmin = group.members.some((m) => m.userId === currentUserId && m.role === "ADMIN");

  const handleChangeRole = async (member: GroupMember, newRole: "ADMIN" | "MEMBER" | "AUDITOR") => {
    if (member.role === newRole) return;
    setUpdatingId(member.userId);
    try {
      await groupApi.changeRole(group.id, member.userId, newRole);
      onRoleChanged();
    } catch (err) {
      console.error("Failed to change role", err);
      alert("Failed to change role. Only Admins can do this.");
    } finally {
      setUpdatingId(null);
    }
  };

  return (
    <div className="flex flex-col gap-2">
      {group.members.map((member) => (
        <div key={member.id} className="flex items-center justify-between p-3 bg-surface-container rounded-lg border border-outline-variant/30">
          <div className="flex flex-col">
            <span className="text-[13px] font-medium text-on-surface">
              {member.user?.name || member.userId} {member.userId === currentUserId ? "(You)" : ""}
            </span>
            <span className="text-[11px] text-on-surface-variant">Joined {new Date(member.joinedAt).toLocaleDateString()}</span>
          </div>

          <div className="flex items-center gap-2">
            {isAdmin && member.userId !== currentUserId ? (
              <select
                className="bg-surface-variant border border-outline-variant/50 text-on-surface text-[12px] rounded px-2 py-1 outline-none focus:border-primary disabled:opacity-50"
                value={member.role}
                onChange={(e) => handleChangeRole(member, e.target.value as any)}
                disabled={updatingId === member.userId}
              >
                <option value="ADMIN">Admin</option>
                <option value="MEMBER">Member</option>
                <option value="AUDITOR">Auditor</option>
              </select>
            ) : (
              <span className={`text-[11px] px-2 py-0.5 rounded-full font-semibold tracking-wide ${
                member.role === 'ADMIN' ? 'bg-primary/20 text-primary' :
                member.role === 'AUDITOR' ? 'bg-secondary/20 text-secondary' :
                'bg-surface-variant text-on-surface-variant'
              }`}>
                {member.role}
              </span>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
