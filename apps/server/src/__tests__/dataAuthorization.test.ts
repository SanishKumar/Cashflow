import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AuthorizationError } from "../lib/errors.js";

const { mockPrisma, mockGroupService, mockAuditLogService, mockVerifyAccessToken } = vi.hoisted(() => ({
  mockPrisma: {
    group: { findUnique: vi.fn() },
    transaction: { findMany: vi.fn(), findFirst: vi.fn(), update: vi.fn(), delete: vi.fn(), create: vi.fn() },
    debtShare: { findMany: vi.fn() },
  } as any,
  mockGroupService: {
    requireRole: vi.fn(),
    findById: vi.fn(),
  },
  mockAuditLogService: {
    log: vi.fn(),
    findByUser: vi.fn(),
    findByGroup: vi.fn(),
  },
  mockVerifyAccessToken: vi.fn(),
}));

vi.mock("../lib/prisma.js", () => ({ default: mockPrisma }));
vi.mock("../services/groupService.js", () => ({ groupService: mockGroupService }));
vi.mock("../services/auditLogService.js", () => ({ auditLogService: mockAuditLogService }));
vi.mock("../services/authService.js", () => ({
  authService: { verifyAccessToken: mockVerifyAccessToken },
}));

import { transactionService } from "../services/transactionService.js";
import transactionRoutes from "../routes/transactions.js";
import auditLogRoutes from "../routes/auditLogs.js";
import groupRoutes from "../routes/groups.js";
import { errorHandler } from "../middleware/errorHandler.js";

const app = express();
app.use(express.json());
app.use("/api/groups", groupRoutes);
app.use("/api/groups", transactionRoutes);
app.use("/api/audit-logs", auditLogRoutes);
app.use(errorHandler);

describe("group data authorization", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockVerifyAccessToken.mockReturnValue({ sub: "user-1", email: "alice@example.com" });
    mockGroupService.requireRole.mockResolvedValue({ role: "MEMBER" });
    mockGroupService.findById.mockResolvedValue({ id: "group-1", name: "Trip" });
    mockAuditLogService.findByGroup.mockResolvedValue({ items: [], total: 0, page: 1, totalPages: 0 });
  });

  it("passes the authenticated identity when reading a group", async () => {
    const response = await request(app)
      .get("/api/groups/group-1")
      .set("Authorization", "Bearer valid-token");

    expect(response.status).toBe(200);
    expect(mockGroupService.findById).toHaveBeenCalledWith("group-1", "user-1");
  });

  it("blocks a non-member before reading group transactions", async () => {
    mockGroupService.requireRole.mockRejectedValueOnce(new AuthorizationError("You are not a member of this group"));

    await expect(transactionService.findByGroup("group-1", "attacker")).rejects.toThrow("not a member");
    expect(mockPrisma.transaction.findMany).not.toHaveBeenCalled();
  });

  it("requires a writable role before creating an expense", async () => {
    mockGroupService.requireRole.mockRejectedValueOnce(new AuthorizationError("This action requires a writable role"));

    await expect(transactionService.create("group-1", {} as any, "auditor-1")).rejects.toThrow("writable role");
    expect(mockPrisma.transaction.create).not.toHaveBeenCalled();
    expect(mockGroupService.requireRole).toHaveBeenCalledWith("group-1", "auditor-1", ["ADMIN", "MEMBER"]);
  });

  it("requires an administrator before deleting an expense", async () => {
    mockGroupService.requireRole.mockRejectedValueOnce(new AuthorizationError("This action requires ADMIN"));

    await expect(transactionService.delete("group-1", "tx-1", "member-1")).rejects.toThrow("ADMIN");
    expect(mockPrisma.transaction.delete).not.toHaveBeenCalled();
    expect(mockGroupService.requireRole).toHaveBeenCalledWith("group-1", "member-1", "ADMIN");
  });

  it("passes authenticated identity through the transaction API", async () => {
    mockPrisma.group.findUnique.mockResolvedValue({ id: "group-1" });
    mockPrisma.transaction.findMany.mockResolvedValue([]);

    const response = await request(app)
      .get("/api/groups/group-1/transactions")
      .set("Authorization", "Bearer valid-token");

    expect(response.status).toBe(200);
    expect(mockGroupService.requireRole).toHaveBeenCalledWith(
      "group-1",
      "user-1",
      ["ADMIN", "MEMBER", "AUDITOR"]
    );
  });

  it("blocks group activity when the requester is not a member", async () => {
    mockGroupService.requireRole.mockRejectedValueOnce(new AuthorizationError("You are not a member of this group"));

    const response = await request(app)
      .get("/api/audit-logs/group/group-1")
      .set("Authorization", "Bearer valid-token");

    expect(response.status).toBe(403);
    expect(mockAuditLogService.findByGroup).not.toHaveBeenCalled();
  });
});
