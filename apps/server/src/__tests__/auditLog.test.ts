/**
 * Audit Log Service Tests
 *
 * Tests the audit logging service: creating entries,
 * pagination, filtering by action type, and date range.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockPrisma } = vi.hoisted(() => ({
  mockPrisma: {
    auditLog: {
      create: vi.fn(),
      findMany: vi.fn(),
      count: vi.fn(),
    },
    groupMember: {
      findMany: vi.fn(),
    },
  } as any,
}));

vi.mock("../lib/prisma.js", () => ({ default: mockPrisma }));

import { auditLogService } from "../services/auditLogService.js";

describe("AuditLogService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("log", () => {
    it("creates an audit log entry with all fields", async () => {
      mockPrisma.auditLog.create.mockResolvedValue({
        id: "log-1",
        userId: "user-1",
        groupId: "group-1",
        action: "EXPENSE_ADDED",
        details: "Added expense: Lunch $25.50",
        metadata: { amount: 25.5 },
        createdAt: new Date(),
      });

      await auditLogService.log({
        userId: "user-1",
        groupId: "group-1",
        action: "EXPENSE_ADDED",
        details: "Added expense: Lunch $25.50",
        metadata: { amount: 25.5 },
      });

      expect(mockPrisma.auditLog.create).toHaveBeenCalledWith({
        data: {
          userId: "user-1",
          groupId: "group-1",
          action: "EXPENSE_ADDED",
          details: "Added expense: Lunch $25.50",
          metadata: { amount: 25.5 },
        },
      });
    });

    it("creates log without optional groupId", async () => {
      mockPrisma.auditLog.create.mockResolvedValue({
        id: "log-2",
        userId: "user-1",
        groupId: null,
        action: "USER_LOGIN",
        details: "User logged in",
        metadata: null,
        createdAt: new Date(),
      });

      await auditLogService.log({
        userId: "user-1",
        action: "USER_LOGIN",
        details: "User logged in",
      });

      expect(mockPrisma.auditLog.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          userId: "user-1",
          action: "USER_LOGIN",
        }),
      });
    });
  });

  describe("findByUser", () => {
    beforeEach(() => {
      // findByUser needs groupMember data to scope audit log queries
      mockPrisma.groupMember.findMany.mockResolvedValue([
        { groupId: "group-1" },
      ]);
    });

    it("returns paginated results", async () => {
      const mockLogs = Array.from({ length: 10 }, (_, i) => ({
        id: `log-${i}`,
        userId: "user-1",
        action: "EXPENSE_ADDED",
        details: `Entry ${i}`,
        createdAt: new Date(),
        user: { id: "user-1", name: "Test", email: "test@test.com", avatarUrl: null },
        group: { id: "group-1", name: "Test Group" },
      }));

      mockPrisma.auditLog.findMany.mockResolvedValue(mockLogs);
      mockPrisma.auditLog.count.mockResolvedValue(25);

      const result = await auditLogService.findByUser("user-1", { page: 1, limit: 10 });

      expect(result.items).toHaveLength(10);
      expect(result.total).toBe(25);
      expect(result.page).toBe(1);
      expect(result.totalPages).toBe(3);
    });

    it("filters by action types", async () => {
      mockPrisma.auditLog.findMany.mockResolvedValue([]);
      mockPrisma.auditLog.count.mockResolvedValue(0);

      await auditLogService.findByUser("user-1", {
        page: 1,
        limit: 10,
        actions: ["EXPENSE_ADDED", "EXPENSE_DELETED"] as any,
      });

      expect(mockPrisma.auditLog.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            action: { in: ["EXPENSE_ADDED", "EXPENSE_DELETED"] },
          }),
        })
      );
    });

    it("filters by date range", async () => {
      mockPrisma.auditLog.findMany.mockResolvedValue([]);
      mockPrisma.auditLog.count.mockResolvedValue(0);

      const startDate = new Date("2026-01-01");
      const endDate = new Date("2026-06-01");

      await auditLogService.findByUser("user-1", {
        page: 1, limit: 10, startDate, endDate,
      });

      expect(mockPrisma.auditLog.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            createdAt: { gte: startDate, lte: endDate },
          }),
        })
      );
    });
  });

  describe("findByGroup", () => {
    it("returns group-scoped audit logs", async () => {
      mockPrisma.auditLog.findMany.mockResolvedValue([{
        id: "log-1", userId: "user-1", groupId: "group-1",
        action: "GROUP_CREATED", details: "Created group",
        createdAt: new Date(),
        user: { id: "user-1", name: "Test", email: "test@test.com", avatarUrl: null },
        group: { id: "group-1", name: "Test Group" },
      }]);
      mockPrisma.auditLog.count.mockResolvedValue(1);

      const result = await auditLogService.findByGroup("group-1", { page: 1, limit: 10 });

      expect(result.items).toHaveLength(1);
      expect(mockPrisma.auditLog.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ groupId: "group-1" }),
        })
      );
    });

    it("calculates correct pagination values", async () => {
      mockPrisma.auditLog.findMany.mockResolvedValue([]);
      mockPrisma.auditLog.count.mockResolvedValue(47);

      const result = await auditLogService.findByGroup("group-1", { page: 3, limit: 10 });

      expect(result.page).toBe(3);
      expect(result.totalPages).toBe(5);
      expect(result.total).toBe(47);
    });
  });
});
