/**
 * Socket.io Client — JWT-Authenticated
 *
 * Establishes a WebSocket connection with the server,
 * passing the JWT access token for authentication.
 */

import { io, Socket } from "socket.io-client";
import type { Settlement, Transaction } from "../types/index";
import { getAccessToken, refreshAccessToken } from "./api";

interface ServerToClientEvents {
  "transaction:created": (data: {
    transaction: Transaction;
    settlements: Settlement[];
  }) => void;
  "settlements:updated": (settlements: Settlement[]) => void;
  "member:joined": (member: { userId: string; name: string }) => void;
  "member:left": (data: { userId: string }) => void;
  "group:error": (data: { code: "FORBIDDEN"; message: string }) => void;
  "server:pong": (sentAt: number) => void;
}

interface ClientToServerEvents {
  "group:join": (groupId: string) => void;
  "group:leave": (groupId: string) => void;
  "client:ping": (sentAt: number) => void;
}

type TypedSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

let socket: TypedSocket | null = null;
let refreshingSocketToken = false;
const debugSocket = import.meta.env.VITE_DEBUG_SOCKET === "true";

async function reconnectWithFreshToken(): Promise<void> {
  if (!socket || socket.connected || refreshingSocketToken) return;

  refreshingSocketToken = true;
  try {
    const token = await refreshAccessToken();
    if (token && socket && !socket.connected) {
      socket.auth = { token };
      socket.connect();
    }
  } finally {
    refreshingSocketToken = false;
  }
}

export function getSocket(): TypedSocket {
  if (!socket) {
    const socketUrl = import.meta.env.VITE_SOCKET_URL || import.meta.env.VITE_API_URL || undefined;
    socket = io(socketUrl, {
      autoConnect: true,
      reconnection: true,
      reconnectionAttempts: 10,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      auth: {
        token: getAccessToken(),
      },
    }) as TypedSocket;

    socket.on("connect", () => {
      if (debugSocket) console.log("[WS] Connected:", socket?.id);
    });

    socket.on("disconnect", (reason) => {
      if (debugSocket) console.log("[WS] Disconnected:", reason);
      if (reason === "io server disconnect") {
        void reconnectWithFreshToken();
      }
    });

    socket.on("connect_error", (error) => {
      if (debugSocket) console.log("[WS] Connection error:", error.message);
      if (error.message === "Authentication required") {
        void reconnectWithFreshToken();
      }
    });
  } else if (!socket.connected) {
    socket.auth = { token: getAccessToken() };
    socket.connect();
  }

  return socket;
}

export function joinGroup(groupId: string): void {
  getSocket().emit("group:join", groupId);
}

export function leaveGroup(groupId: string): void {
  getSocket().emit("group:leave", groupId);
}
