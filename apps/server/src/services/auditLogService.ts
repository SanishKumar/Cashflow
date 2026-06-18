/**
 * Audit Log Service — Immutable Action Tracking
 *
 * Records all significant actions in an append-only audit trail.
 * Uses the AuditAction enum for machine-readable categorization and
 * optional JSON metadata for structured context.
 *
 * Supports paginated queries with filtering by action type and date range.
 */

import prisma from "../lib/prisma.js";
import type { AuditAction, Prisma } from "@prisma/client";

export interface AuditLogInput {
  userId: string;
  groupId?: string | null;
  action: AuditAction | string;
  details?: string | null;
  metadata?: Record<string, unknown> | null;
}

export interface AuditQueryOptions {
  page?: number;
  limit?: number;
  actions?: AuditAction[];
  startDate?: Date;
  endDate?: Date;
}

const DEFAULT_PAGE_SIZE = 50;
const MAX_PAGE_SIZE = 200;

export class AuditLogService {
  /**
   * Record an action in the audit log.
   * Silently catches errors to prevent audit failures from blocking
   * the primary operation.
   */
  async log(data: AuditLogInput) {
    try {
      return await prisma.auditLog.create({
        data: {
          userId: data.userId,
          groupId: data.groupId ?? undefined,
          action: data.action as AuditAction,
          details: data.details ?? undefined,
          metadata: data.metadata as Prisma.InputJsonValue ?? undefined,
        },
      });
    } catch (err) {
      // Never let audit logging failures propagate to the caller.
      // Log the error for observability but don't crash the operation.
      console.error("[AUDIT] Failed to write audit log:", err);
      return null;
    }
  }

  /**
   * Get paginated audit logs for a specific group.
   */
  async findByGroup(groupId: string, options: AuditQueryOptions = {}) {
    const { page = 1, limit = DEFAULT_PAGE_SIZE, actions, startDate, endDate } = options;
    const take = Math.min(limit, MAX_PAGE_SIZE);
    const skip = (page - 1) * take;

    const where: Prisma.AuditLogWhereInput = {
      groupId,
      ...(actions?.length ? { action: { in: actions } } : {}),
      ...(startDate || endDate
        ? {
            createdAt: {
              ...(startDate ? { gte: startDate } : {}),
              ...(endDate ? { lte: endDate } : {}),
            },
          }
        : {}),
    };

    const [items, total] = await Promise.all([
      prisma.auditLog.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip,
        take,
        include: {
          user: { select: { id: true, name: true, email: true, avatarUrl: true } },
        },
      }),
      prisma.auditLog.count({ where }),
    ]);

    return {
      items,
      total,
      page,
      limit: take,
      totalPages: Math.ceil(total / take),
    };
  }

  /**
   * Get paginated audit logs for a specific user across all their groups.
   */
  async findByUser(userId: string, options: AuditQueryOptions = {}) {
    const { page = 1, limit = DEFAULT_PAGE_SIZE, actions, startDate, endDate } = options;
    const take = Math.min(limit, MAX_PAGE_SIZE);
    const skip = (page - 1) * take;

    // Get all groups the user belongs to
    const memberships = await prisma.groupMember.findMany({
      where: { userId },
      select: { groupId: true },
    });
    const groupIds = memberships.map((m) => m.groupId);

    const where: Prisma.AuditLogWhereInput = {
      OR: [{ groupId: { in: groupIds } }, { userId }],
      ...(actions?.length ? { action: { in: actions } } : {}),
      ...(startDate || endDate
        ? {
            createdAt: {
              ...(startDate ? { gte: startDate } : {}),
              ...(endDate ? { lte: endDate } : {}),
            },
          }
        : {}),
    };

    const [items, total] = await Promise.all([
      prisma.auditLog.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip,
        take,
        include: {
          user: { select: { id: true, name: true, email: true, avatarUrl: true } },
          group: { select: { id: true, name: true } },
        },
      }),
      prisma.auditLog.count({ where }),
    ]);

    return {
      items,
      total,
      page,
      limit: take,
      totalPages: Math.ceil(total / take),
    };
  }
}

export const auditLogService = new AuditLogService();
