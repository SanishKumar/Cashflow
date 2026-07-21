import { beforeEach, describe, expect, it, vi } from "vitest";

const { handlers, mockIo, mockRefreshAccessToken, mockSocket } = vi.hoisted(() => {
  const registeredHandlers = new Map<string, (...args: any[]) => void>();
  const socket = {
    auth: {} as Record<string, string | null>,
    connected: false,
    connect: vi.fn(),
    emit: vi.fn(),
    on: vi.fn((event: string, handler: (...args: any[]) => void) => {
      registeredHandlers.set(event, handler);
      return socket;
    }),
  };

  return {
    handlers: registeredHandlers,
    mockIo: vi.fn(() => socket),
    mockRefreshAccessToken: vi.fn(),
    mockSocket: socket,
  };
});

vi.mock("socket.io-client", () => ({ io: mockIo }));
vi.mock("../lib/api", () => ({
  getAccessToken: vi.fn(() => "current-token"),
  refreshAccessToken: mockRefreshAccessToken,
}));

import { getSocket } from "../lib/socket";

describe("socket client authentication", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    handlers.clear();
    mockSocket.connected = false;
    mockSocket.auth = {};
    mockRefreshAccessToken.mockResolvedValue("fresh-token");
  });

  it("refreshes the access token and reconnects after the server expires a socket", async () => {
    getSocket();
    const handleDisconnect = handlers.get("disconnect");

    expect(handleDisconnect).toBeDefined();
    handleDisconnect?.("io server disconnect");

    await vi.waitFor(() => expect(mockSocket.connect).toHaveBeenCalledOnce());
    expect(mockRefreshAccessToken).toHaveBeenCalledOnce();
    expect(mockSocket.auth).toEqual({ token: "fresh-token" });
  });

  it("explicitly reconnects an existing disconnected socket", () => {
    getSocket();
    mockSocket.connect.mockClear();

    getSocket();

    expect(mockSocket.auth).toEqual({ token: "current-token" });
    expect(mockSocket.connect).toHaveBeenCalledOnce();
  });
});
