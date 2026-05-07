// ──────────────────────────────────────────────
// User Service — Data Access Layer
// ──────────────────────────────────────────────

import prisma from "../lib/prisma.js";
import type { CreateUserInput, UpdateUserInput } from "../types/api.js";
import { NotFoundError, ConflictError } from "../middleware/errorHandler.js";

export class UserService {
  /**
   * Create a new user.
   */
  async create(data: CreateUserInput) {
    const existing = await prisma.user.findUnique({ where: { email: data.email } });
    if (existing) {
      throw new ConflictError(`User with email '${data.email}' already exists`);
    }

    return prisma.user.create({
      data: {
        name: data.name,
        email: data.email,
        avatarUrl: data.avatarUrl,
      },
    });
  }

  /**
   * Get all users.
   */
  async findAll() {
    return prisma.user.findMany({
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        name: true,
        email: true,
        avatarUrl: true,
        createdAt: true,
      },
    });
  }

  /**
   * Get a user by ID.
   */
  async findById(id: string) {
    const user = await prisma.user.findUnique({
      where: { id },
      include: {
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
