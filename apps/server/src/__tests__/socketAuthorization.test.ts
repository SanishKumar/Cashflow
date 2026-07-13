import { createServer, type Server as HttpServer } from "http";
import { io as createClient, type Socket as ClientSocket } from "socket.io-client";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { AuthorizationError } from "../lib/errors.js";

const { mockVerifyAccessToken, mockRequireRole } = vi.hoisted(() => ({
  mockVerifyAccessToken: vi.fn(),
  mockRequireRole: vi.fn(),
}));

vi.mock("../services/authService.js", () => ({
  authService: { verifyAccessToken: mockVerifyAccessToken },
}));
vi.mock("../services/groupService.js", () => ({
  groupService: { requireRole: mockRequireRole },
}));

import { initSocketServer } from "../socket/socketServer.js";

let httpServer: HttpServer;
let socketServer: ReturnType<typeof initSocketServer>;
let baseUrl: string;
const clients: ClientSocket[] = [];

function connectClient(token?: string): ClientSocket {
  const client = createClient(baseUrl, {
    forceNew: true,
    reconnection: false,
    transports: ["websocket"],
    auth: token ? { token } : {},
  });
  clients.push(client);
  return client;
}

function waitFor<T>(client: ClientSocket, event: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Timed out waiting for ${event}`)), 2000);
    client.once(event, (value: T) => {
      clearTimeout(timer);
      resolve(value);
    });
  });
}

describe("socket authorization", () => {
  beforeAll(async () => {
    vi.stubEnv("REDIS_URL", "");
    httpServer = createServer();
    socketServer = initSocketServer(httpServer);
    await new Promise<void>((resolve) => httpServer.listen(0, "127.0.0.1", resolve));
    const address = httpServer.address();
    if (!address || typeof address === "string") throw new Error("Socket test server failed to bind");
    baseUrl = `http://127.0.0.1:${address.port}`;
  });

  beforeEach(() => {
    vi.clearAllMocks();
    mockVerifyAccessToken.mockReturnValue({
      sub: "user-1",
      email: "alice@example.com",
      exp: Math.floor(Date.now() / 1000) + 60,
    });
    mockRequireRole.mockResolvedValue({ role: "MEMBER" });
  });

  afterAll(async () => {
    clients.forEach((client) => client.close());
    await new Promise<void>((resolve) => socketServer.close(() => resolve()));
  });

  it("rejects a handshake without a bearer token", async () => {
    const client = connectClient();
    const error = await waitFor<Error>(client, "connect_error");

    expect(error.message).toBe("Authentication required");
    expect(client.connected).toBe(false);
  });

  it("does not join a group room when membership is denied", async () => {
    mockRequireRole.mockRejectedValueOnce(new AuthorizationError("Not a member"));
    const client = connectClient("valid-token");
    await waitFor(client, "connect");

    const denied = waitFor<{ code: string; message: string }>(client, "group:error");
    client.emit("group:join", "private-group");
    await expect(denied).resolves.toEqual({
      code: "FORBIDDEN",
      message: "You do not have access to this group",
    });

    expect(await socketServer.in("group:private-group").fetchSockets()).toHaveLength(0);
  });

  it("joins an authorized member to the requested room", async () => {
    const client = connectClient("valid-token");
    await waitFor(client, "connect");

    client.emit("group:join", "group-1");
    await new Promise((resolve) => setTimeout(resolve, 25));

    expect(mockRequireRole).toHaveBeenCalledWith(
      "group-1",
      "user-1",
      ["ADMIN", "MEMBER", "AUDITOR"]
    );
    expect(await socketServer.in("group:group-1").fetchSockets()).toHaveLength(1);
  });
});
