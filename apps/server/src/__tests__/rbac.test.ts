/**
 * RBAC Tests — Role-Based Access Control
 *
 * Tests groupService role enforcement: requireRole, changeRole,
 * and authorization checks for various operations.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockPrisma } = vi.hoisted(() => ({
  mockPrisma: {
    group: {
      findUnique: vi.fn(),
      create: vi.fn(),
      findMany: vi.fn(),
    },
    groupMember: {
      findUnique: vi.fn(),
      create: vi.fn(),
      delete: vi.fn(),
      update: vi.fn(),
      findMany: vi.fn(),
      count: vi.fn(),
    },
    auditLog: {
      create: vi.fn(),
    },
    $transaction: vi.fn((fn: any) => fn(mockPrisma)),
  } as any,
}));

vi.mock("../lib/prisma.js", () => ({ default: mockPrisma }));
vi.mock("../services/auditLogService.js", () => ({
  auditLogService: { log: vi.fn() },
}));

import { groupService } from "../services/groupService.js";

describe("GroupService RBAC", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("requireRole", () => {
    it("allows access for matching single role", async () => {
      mockPrisma.groupMember.findUnique.mockResolvedValue({
        id: "member-1", userId: "user-1", groupId: "group-1", role: "ADMIN",
      });
      const result = await groupService.requireRole("group-1", "user-1", "ADMIN");
      expect(result.role).toBe("ADMIN");
    });

    it("allows access for matching role in array", async () => {
      mockPrisma.groupMember.findUnique.mockResolvedValue({
        id: "member-1", userId: "user-1", groupId: "group-1", role: "MEMBER",
      });
      const result = await groupService.requireRole("group-1", "user-1", ["ADMIN", "MEMBER"]);
      expect(result.role).toBe("MEMBER");
    });

    it("throws AuthorizationError for non-member", async () => {
      mockPrisma.groupMember.findUnique.mockResolvedValue(null);
      await expect(
        groupService.requireRole("group-1", "user-1", "ADMIN")
      ).rejects.toThrow("not a member");
    });

    it("throws AuthorizationError for wrong role", async () => {
      mockPrisma.groupMember.findUnique.mockResolvedValue({
        id: "member-1", userId: "user-1", groupId: "group-1", role: "MEMBER",
      });
      await expect(
        groupService.requireRole("group-1", "user-1", "ADMIN")
      ).rejects.toThrow("requires");
    });

    it("AUDITOR cannot access ADMIN-only operations", async () => {
      mockPrisma.groupMember.findUnique.mockResolvedValue({
        id: "member-1", userId: "auditor-1", groupId: "group-1", role: "AUDITOR",
      });
      await expect(
        groupService.requireRole("group-1", "auditor-1", ["ADMIN", "MEMBER"])
      ).rejects.toThrow("requires");
    });

    it("AUDITOR can access when AUDITOR is in allowed roles", async () => {
      mockPrisma.groupMember.findUnique.mockResolvedValue({
        id: "member-1", userId: "auditor-1", groupId: "group-1", role: "AUDITOR",
      });
      const result = await groupService.requireRole("group-1", "auditor-1", ["ADMIN", "MEMBER", "AUDITOR"]);
      expect(result.role).toBe("AUDITOR");
    });
  });

  describe("changeRole", () => {
    it("ADMIN can change member role to AUDITOR", async () => {
      mockPrisma.groupMember.findUnique
        .mockResolvedValueOnce({ id: "m-admin", userId: "admin-1", groupId: "group-1", role: "ADMIN" })
        .mockResolvedValueOnce({ id: "m-target", userId: "member-1", groupId: "group-1", role: "MEMBER", user: { name: "Test Member" } });
      mockPrisma.groupMember.update.mockResolvedValue({
        id: "m-target", userId: "member-1", groupId: "group-1", role: "AUDITOR",
        user: { id: "member-1", name: "Test Member", email: "member@test.com", avatarUrl: null },
      });

      const result = await groupService.changeRole("group-1", "member-1", "AUDITOR", "admin-1");
      expect(result.role).toBe("AUDITOR");
    });

    it("MEMBER cannot change roles — throws AuthorizationError", async () => {
      mockPrisma.groupMember.findUnique.mockResolvedValue({
        id: "m-1", userId: "member-1", groupId: "group-1", role: "MEMBER",
      });
      await expect(
        groupService.changeRole("group-1", "target-1", "ADMIN", "member-1")
      ).rejects.toThrow("requires");
    });

    it("AUDITOR cannot change roles — throws AuthorizationError", async () => {
      mockPrisma.groupMember.findUnique.mockResolvedValue({
        id: "m-1", userId: "auditor-1", groupId: "group-1", role: "AUDITOR",
      });
      await expect(
        groupService.changeRole("group-1", "target-1", "ADMIN", "auditor-1")
      ).rejects.toThrow("requires");
    });

    it("throws for non-existent target member", async () => {
      mockPrisma.groupMember.findUnique
        .mockResolvedValueOnce({ id: "m-admin", userId: "admin-1", groupId: "group-1", role: "ADMIN" })
        .mockResolvedValueOnce(null);
      await expect(
        groupService.changeRole("group-1", "nonexistent", "MEMBER", "admin-1")
      ).rejects.toThrow();
    });
  });
});
