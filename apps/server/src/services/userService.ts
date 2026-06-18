/**
 * User Service — Data Access Layer
 *
 * Handles user CRUD operations. All queries explicitly exclude
 * the passwordHash field to prevent accidental leakage.
 */

import prisma from "../lib/prisma.js";
import type { UpdateUserInput } from "../types/api.js";
import { NotFoundError } from "../lib/errors.js";

// Safe user fields — never include passwordHash in responses
const SAFE_USER_SELECT = {
  id: true,
  name: true,
  email: true,
  avatarUrl: true,
  createdAt: true,
  updatedAt: true,
} as const;

export class UserService {
  /**
   * Get all users (safe fields only).
   */
  async findAll() {
    return prisma.user.findMany({
      orderBy: { createdAt: "desc" },
      select: SAFE_USER_SELECT,
    });
  }

  /**
   * Get a user by ID with their group memberships.
   */
  async findById(id: string) {
    const user = await prisma.user.findUnique({
      where: { id },
      select: {
        ...SAFE_USER_SELECT,
        memberships: {
          include: {
            group: {
              select: { id: true, name: true },
            },
          },
        },
      },
    });

    if (!user) {
      throw new NotFoundError("User", id);
    }

    return user;
  }

  /**
   * Update a user by ID.
   */
  async update(id: string, data: UpdateUserInput) {
    await this.findById(id); // throws if not found

    return prisma.user.update({
      where: { id },
      data,
      select: SAFE_USER_SELECT,
    });
  }

  /**
   * Delete a user by ID.
   */
  async delete(id: string) {
    await this.findById(id); // throws if not found

    return prisma.user.delete({ where: { id } });
  }
}

export const userService = new UserService();
