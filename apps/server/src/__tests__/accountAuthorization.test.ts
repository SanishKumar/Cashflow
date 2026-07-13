import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockUserService, mockVerifyAccessToken } = vi.hoisted(() => ({
  mockUserService: {
    findByEmail: vi.fn(),
    findById: vi.fn(),
    update: vi.fn(),
  },
  mockVerifyAccessToken: vi.fn(),
}));

vi.mock("../services/userService.js", () => ({ userService: mockUserService }));
vi.mock("../services/authService.js", () => ({
  authService: { verifyAccessToken: mockVerifyAccessToken },
}));

import userRoutes from "../routes/users.js";
import { errorHandler } from "../middleware/errorHandler.js";

const app = express();
app.use(express.json());
app.use("/api/users", userRoutes);
app.use(errorHandler);

const currentUser = {
  id: "user-1",
  name: "Alice",
  email: "alice@example.com",
  avatarUrl: null,
  createdAt: new Date("2026-01-01"),
  updatedAt: new Date("2026-01-01"),
};

describe("account authorization", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockVerifyAccessToken.mockReturnValue({ sub: "user-1", email: "alice@example.com" });
    mockUserService.findById.mockResolvedValue(currentUser);
    mockUserService.update.mockResolvedValue({ ...currentUser, name: "Alice Updated" });
    mockUserService.findByEmail.mockResolvedValue({
      id: "user-2",
      name: "Bob",
      email: "bob@example.com",
      avatarUrl: null,
    });
  });

  it("rejects the removed X-User-Id authentication fallback", async () => {
    const response = await request(app).get("/api/users/me").set("X-User-Id", "user-1");

    expect(response.status).toBe(401);
    expect(mockUserService.findById).not.toHaveBeenCalled();
  });

  it("returns only the authenticated account", async () => {
    const response = await request(app)
      .get("/api/users/me")
      .set("Authorization", "Bearer valid-token");

    expect(response.status).toBe(200);
    expect(mockUserService.findById).toHaveBeenCalledWith("user-1");
  });

  it("updates only the authenticated account", async () => {
    const response = await request(app)
      .patch("/api/users/me")
      .set("Authorization", "Bearer valid-token")
      .send({ name: "Alice Updated" });

    expect(response.status).toBe(200);
    expect(mockUserService.update).toHaveBeenCalledWith("user-1", { name: "Alice Updated" });
  });

  it("does not expose legacy list or arbitrary-user routes", async () => {
    const listResponse = await request(app)
      .get("/api/users")
      .set("Authorization", "Bearer valid-token");
    const readResponse = await request(app)
      .get("/api/users/user-2")
      .set("Authorization", "Bearer valid-token");
    const updateResponse = await request(app)
      .patch("/api/users/user-2")
      .set("Authorization", "Bearer valid-token")
      .send({ name: "Taken over" });
    const deleteResponse = await request(app)
      .delete("/api/users/user-2")
      .set("Authorization", "Bearer valid-token");

    expect([listResponse.status, readResponse.status, updateResponse.status, deleteResponse.status]).toEqual([404, 404, 404, 404]);
    expect(mockUserService.update).not.toHaveBeenCalled();
  });

  it("supports only an exact validated email lookup for invitations", async () => {
    const response = await request(app)
      .post("/api/users/lookup")
      .set("Authorization", "Bearer valid-token")
      .send({ email: "bob@example.com" });

    expect(response.status).toBe(200);
    expect(mockUserService.findByEmail).toHaveBeenCalledWith("bob@example.com");
    expect(response.body.data).toEqual({
      id: "user-2",
      name: "Bob",
      email: "bob@example.com",
      avatarUrl: null,
    });
  });
});
