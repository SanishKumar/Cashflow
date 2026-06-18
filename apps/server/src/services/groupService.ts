// ──────────────────────────────────────────────
// Group Service — Data Access Layer with RBAC
// ──────────────────────────────────────────────

import prisma from "../lib/prisma.js";
import type { CreateGroupInput, UpdateGroupInput } from "../types/api.js";
import { NotFoundError, ConflictError, AuthorizationError } from "../lib/errors.js";
import { auditLogService } from "./auditLogService.js";

const GROUP_INCLUDE = {
  members: {
    include: {
      user: { select: { id: true, name: true, email: true, avatarUrl: true } },
    },
    orderBy: { joinedAt: "asc" as const },
  },
  _count: { select: { transactions: true } },
};

export class GroupService {
  /**
   * Create a new group. The requesting user is auto-assigned ADMIN.
   */
  async create(data: CreateGroupInput, requestingUserId?: string) {
    const memberCreates: { userId: string; role: "ADMIN" | "MEMBER" }[] = [];

    // The creator is always ADMIN
    if (requestingUserId) {
      memberCreates.push({ userId: requestingUserId, role: "ADMIN" });
    }

    // Additional members are MEMBER
    if (data.memberIds) {
      for (const uid of data.memberIds) {
        if (uid !== requestingUserId) {
          memberCreates.push({ userId: uid, role: "MEMBER" });
        }
      }
    }

    const group = await prisma.group.create({
      data: {
        name: data.name,
        description: data.description,
        currency: data.currency ?? "USD",
        members: memberCreates.length > 0
          ? { create: memberCreates }
          : undefined,
      },
      include: GROUP_INCLUDE,
    });

    // Audit log
    if (requestingUserId) {
      await auditLogService.log({
        userId: requestingUserId,
        groupId: group.id,
        action: "GROUP_CREATED",
        details: `Created group "${data.name}"`,
      });
    }

    return group;
  }

  /**
   * Get all groups — scoped to the requesting user's memberships.
   */
  async findAll(requestingUserId?: string, page: number = 1, limit: number = 50) {
    const where = requestingUserId
      ? { members: { some: { userId: requestingUserId } } }
      : {};

    return prisma.group.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * limit,
      take: limit,
      include: GROUP_INCLUDE,
    });
  }

  /**
   * Get a single group by ID with full details.
   */
  async findById(id: string) {
    const group = await prisma.group.findUnique({
      where: { id },
      include: GROUP_INCLUDE,
    });

    if (!group) {
      throw new NotFoundError("Group", id);
    }

    return group;
  }

  /**
   * Update a group by ID. Requires ADMIN role.
   */
  async update(id: string, data: UpdateGroupInput, requestingUserId?: string) {
    if (requestingUserId) {
      await this.requireRole(id, requestingUserId, "ADMIN");
    }

    return prisma.group.update({
      where: { id },
      data,
      include: GROUP_INCLUDE,
    });
  }

  /**
   * Add a member to a group. Requires ADMIN role.
   */
  async addMember(groupId: string, userId: string, requestingUserId?: string) {
    await this.findById(groupId);

    if (requestingUserId) {
      await this.requireRole(groupId, requestingUserId, "ADMIN");
    }

    // Check if user exists
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new NotFoundError("User", userId);
    }

    // Check for duplicate membership
    const existing = await prisma.groupMember.findUnique({
      where: { userId_groupId: { userId, groupId } },
    });
    if (existing) {
      throw new ConflictError(`User '${userId}' is already a member of group '${groupId}'`);
    }

    const member = await prisma.groupMember.create({
      data: { userId, groupId, role: "MEMBER" },
      include: {
        user: { select: { id: true, name: true, email: true, avatarUrl: true } },
      },
    });

    // Audit log
    if (requestingUserId) {
      await auditLogService.log({
        userId: requestingUserId,
        groupId,
        action: "MEMBER_ADDED",
        details: `Added ${user.name} to the group`,
      });
    }

    return member;
  }

  /**
   * Remove a member from a group. ADMIN can remove anyone; members can leave themselves.
   */
  async removeMember(groupId: string, userId: string, requestingUserId?: string) {
    const membership = await prisma.groupMember.findUnique({
      where: { userId_groupId: { userId, groupId } },
    });

    if (!membership) {
      throw new NotFoundError("Group membership");
    }

    // If not self-leave, require ADMIN
    if (requestingUserId && requestingUserId !== userId) {
      await this.requireRole(groupId, requestingUserId, "ADMIN");
    }

    const result = await prisma.groupMember.delete({
      where: { id: membership.id },
    });

    // Audit log
    if (requestingUserId) {
      const user = await prisma.user.findUnique({ where: { id: userId } });
      await auditLogService.log({
        userId: requestingUserId,
        groupId,
        action: requestingUserId === userId ? "MEMBER_LEFT" : "MEMBER_REMOVED",
        details: requestingUserId === userId
          ? `Left the group`
          : `Removed ${user?.name ?? userId} from the group`,
      });
    }

    return result;
  }

  /**
   * Delete a group by ID. Requires ADMIN role.
   */
  async delete(id: string, requestingUserId?: string) {
    const group = await this.findById(id);

    if (requestingUserId) {
      await this.requireRole(id, requestingUserId, "ADMIN");
    }

    // Audit log before deletion
    if (requestingUserId) {
      await auditLogService.log({
        userId: requestingUserId,
        groupId: null,
        action: "GROUP_DELETED",
        details: `Deleted group "${group.name}"`,
      });
    }

    return prisma.group.delete({ where: { id } });
  }

  /**
   * Verify a user has one of the required roles in a group.
   * Supports checking against multiple allowed roles.
   */
  async requireRole(
    groupId: string,
    userId: string,
    allowedRoles: ("ADMIN" | "MEMBER" | "AUDITOR")[] | "ADMIN" | "MEMBER" | "AUDITOR"
  ) {
    const roles = Array.isArray(allowedRoles) ? allowedRoles : [allowedRoles];

    const membership = await prisma.groupMember.findUnique({
      where: { userId_groupId: { userId, groupId } },
    });

    if (!membership) {
      throw new AuthorizationError("You are not a member of this group");
    }

    if (!roles.includes(membership.role as any)) {
      throw new AuthorizationError(
        `This action requires one of the following roles: ${roles.join(", ")}`
      );
    }

    return membership;
  }

  /**
   * Change a member's role in a group. Requires ADMIN role.
   */
  async changeRole(
    groupId: string,
    targetUserId: string,
    newRole: "ADMIN" | "MEMBER" | "AUDITOR",
    requestingUserId: string
  ) {
    // Verify requester is ADMIN
    await this.requireRole(groupId, requestingUserId, "ADMIN");

    // Find target membership
    const membership = await prisma.groupMember.findUnique({
      where: { userId_groupId: { userId: targetUserId, groupId } },
      include: { user: { select: { name: true } } },
    });

    if (!membership) {
      throw new NotFoundError("Group membership");
    }

    // Prevent demoting yourself if you're the last admin
    if (targetUserId === requestingUserId && membership.role === "ADMIN" && newRole !== "ADMIN") {
      const adminCount = await prisma.groupMember.count({
        where: { groupId, role: "ADMIN" },
      });
      if (adminCount <= 1) {
        throw new AuthorizationError("Cannot demote yourself — you are the only admin");
      }
    }

    const oldRole = membership.role;
    const updated = await prisma.groupMember.update({
      where: { id: membership.id },
      data: { role: newRole },
      include: {
        user: { select: { id: true, name: true, email: true, avatarUrl: true } },
      },
    });

    // Audit log
    await auditLogService.log({
      userId: requestingUserId,
      groupId,
      action: "ROLE_CHANGED",
      details: `Changed ${membership.user.name}'s role from ${oldRole} to ${newRole}`,
      metadata: { targetUserId, oldRole, newRole },
    });

    return updated;
  }

  /**
   * Get the role of a user in a group.
   */
  async getUserRole(groupId: string, userId: string): Promise<string | null> {
    const membership = await prisma.groupMember.findUnique({
      where: { userId_groupId: { userId, groupId } },
    });
    return membership?.role ?? null;
  }
}

export const groupService = new GroupService();

