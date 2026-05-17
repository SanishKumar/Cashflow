// ──────────────────────────────────────────────
// Audit Log Service — Immutable Action Tracking
// ──────────────────────────────────────────────

import prisma from "../lib/prisma.js";

export class AuditLogService {
  /**
   * Record an action in the audit log.
   */
  async log(data: {
    userId: string;
    groupId?: string | null;
    action: string;
    details?: string | null;
  }) {
    return prisma.auditLog.create({
      data: {
        userId: data.userId,
        groupId: data.groupId ?? undefined,
        action: data.action,
        details: data.details ?? undefined,
      },
    });
  }

  /**
   * Get all audit logs for a specific group.
   */
  async findByGroup(groupId: string) {
    return prisma.auditLog.findMany({
      where: { groupId },
      orderBy: { createdAt: "desc" },
      include: {
        user: { select: { id: true, name: true, email: true, avatarUrl: true } },
      },
    });
  }

  /**
   * Get all audit logs for a specific user across all their groups.
   */
  async findByUser(userId: string) {
    // Get all groups the user belongs to
    const memberships = await prisma.groupMember.findMany({
      where: { userId },
      select: { groupId: true },
    });

    const groupIds = memberships.map(m => m.groupId);

    return prisma.auditLog.findMany({
      where: {
        OR: [
          { groupId: { in: groupIds } },
          { userId },
        ],
      },
      orderBy: { createdAt: "desc" },
      include: {
        user: { select: { id: true, name: true, email: true, avatarUrl: true } },
        group: { select: { id: true, name: true } },
      },
      take: 200,
    });
  }
}

export const auditLogService = new AuditLogService();
