// ──────────────────────────────────────────────
// Group Service — Data Access Layer
// ──────────────────────────────────────────────

import prisma from "../lib/prisma.js";
import type { CreateGroupInput, UpdateGroupInput } from "../types/api.js";
import { NotFoundError, ConflictError } from "../middleware/errorHandler.js";

export class GroupService {
  /**
   * Create a new group, optionally with initial members.
   */
  async create(data: CreateGroupInput) {
    return prisma.group.create({
      data: {
        name: data.name,
        description: data.description,
        currency: data.currency ?? "USD",
        members: data.memberIds
          ? {
              create: data.memberIds.map((userId) => ({
                userId,
              })),
            }
          : undefined,
      },
      include: {
        members: {
          include: { user: { select: { id: true, name: true, email: true, avatarUrl: true } } },
        },
        _count: { select: { transactions: true } },
      },
    });
  }

  /**
   * Get all groups with member counts.
   */
  async findAll() {
    return prisma.group.findMany({
      orderBy: { createdAt: "desc" },
      include: {
        members: {
          include: {
            user: { select: { id: true, name: true, email: true, avatarUrl: true } },
          },
        },
        _count: { select: { transactions: true } },
      },
    });
  }

  /**
   * Get a single group by ID with full details.
   */
  async findById(id: string) {
    const group = await prisma.group.findUnique({
      where: { id },
      include: {
        members: {
          include: {
            user: { select: { id: true, name: true, email: true, avatarUrl: true } },
          },
          orderBy: { joinedAt: "asc" },
        },
        _count: { select: { transactions: true } },
      },
    });

    if (!group) {
      throw new NotFoundError("Group", id);
    }

    return group;
  }

  /**
   * Update a group by ID.
   */
  async update(id: string, data: UpdateGroupInput) {
    await this.findById(id);

    return prisma.group.update({
      where: { id },
      data,
      include: {
        members: {
          include: {
            user: { select: { id: true, name: true, email: true, avatarUrl: true } },
          },
        },
        _count: { select: { transactions: true } },
      },
    });
  }

  /**
   * Add a member to a group.
   */
  async addMember(groupId: string, userId: string) {
    await this.findById(groupId);

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

    return prisma.groupMember.create({
      data: { userId, groupId },
      include: {
        user: { select: { id: true, name: true, email: true, avatarUrl: true } },
      },
    });
  }

  /**
   * Remove a member from a group.
   */
  async removeMember(groupId: string, userId: string) {
    const membership = await prisma.groupMember.findUnique({
      where: { userId_groupId: { userId, groupId } },
    });

    if (!membership) {
      throw new NotFoundError("Group membership");
    }

    return prisma.groupMember.delete({
      where: { id: membership.id },
    });
  }

  /**
   * Delete a group by ID.
   */
  async delete(id: string) {
    await this.findById(id);
    return prisma.group.delete({ where: { id } });
  }
}

export const groupService = new GroupService();
