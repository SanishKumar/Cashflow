// ──────────────────────────────────────────────
// Socket.io Client
// ──────────────────────────────────────────────

import { io, Socket } from "socket.io-client";
import type { Settlement, Transaction } from "../types/index";

interface ServerToClientEvents {
  "transaction:created": (data: {
    transaction: Transaction;
    settlements: Settlement[];
  }) => void;
  "settlements:updated": (settlements: Settlement[]) => void;
  "member:joined": (member: { userId: string; name: string }) => void;
  "member:left": (data: { userId: string }) => void;
}

interface ClientToServerEvents {
  "group:join": (groupId: string) => void;
  "group:leave": (groupId: string) => void;
}

type TypedSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

let socket: TypedSocket | null = null;

export function getSocket(): TypedSocket {
  if (!socket) {
    socket = io({
      autoConnect: true,
      reconnection: true,
      reconnectionAttempts: 10,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
    }) as TypedSocket;

    socket.on("connect", () => {
      console.log("[WS] Connected:", socket?.id);
    });

    socket.on("disconnect", (reason) => {
      console.log("[WS] Disconnected:", reason);
    });
  }

  return socket;
}

export function joinGroup(groupId: string): void {
  getSocket().emit("group:join", groupId);
}

export function leaveGroup(groupId: string): void {
  getSocket().emit("group:leave", groupId);
}
