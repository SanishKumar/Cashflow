// ──────────────────────────────────────────────
// Socket.io Server — Real-Time Subsystem
// ──────────────────────────────────────────────
// Manages WebSocket connections for real-time
// debt network updates. Uses Redis adapter for
// horizontal scaling.
// ──────────────────────────────────────────────

import { Server as HttpServer } from "http";
import { Server, Socket } from "socket.io";
import type { ServerToClientEvents, ClientToServerEvents } from "../types/api.js";

type TypedServer = Server<ClientToServerEvents, ServerToClientEvents>;
type TypedSocket = Socket<ClientToServerEvents, ServerToClientEvents>;

let io: TypedServer | null = null;

/**
 * Initialize the Socket.io server.
 * Attaches to the existing HTTP server.
 */
export function initSocketServer(httpServer: HttpServer): TypedServer {
  io = new Server<ClientToServerEvents, ServerToClientEvents>(httpServer, {
    cors: {
      origin: process.env.CORS_ORIGIN || "http://localhost:5173",
      credentials: true,
    },
    pingInterval: 10000,
    pingTimeout: 5000,
  });

  // ── Redis Adapter (optional, enabled if REDIS_URL is set) ──
  if (process.env.REDIS_URL) {
    setupRedisAdapter(io).catch((err) => {
      console.warn("[SOCKET] Redis adapter setup failed, using in-memory:", err.message);
    });
  }

  // ── Connection Handler ───────────────────────
  io.on("connection", (socket: TypedSocket) => {
    console.log(`[SOCKET] Client connected: ${socket.id}`);

    // Join a group room
    socket.on("group:join", (groupId: string) => {
      socket.join(`group:${groupId}`);
      console.log(`[SOCKET] ${socket.id} joined group:${groupId}`);
    });

    // Leave a group room
    socket.on("group:leave", (groupId: string) => {
      socket.leave(`group:${groupId}`);
      console.log(`[SOCKET] ${socket.id} left group:${groupId}`);
    });

    socket.on("disconnect", (reason) => {
      console.log(`[SOCKET] Client disconnected: ${socket.id} (${reason})`);
    });
  });

  console.log("[SOCKET] WebSocket server initialized.");
  return io;
}

/**
 * Set up Redis pub/sub adapter for Socket.io.
 * Supports Upstash (TLS required) and standard Redis.
 */
async function setupRedisAdapter(server: TypedServer): Promise<void> {
  const { createAdapter } = await import("@socket.io/redis-adapter");
  const { Redis } = await import("ioredis");

  const redisUrl = process.env.REDIS_URL!;
  const useTls = redisUrl.startsWith("rediss://");

  const connectionOptions = {
    // Required by @socket.io/redis-adapter
    maxRetriesPerRequest: null,
    // Enable TLS for Upstash (rediss:// protocol)
    ...(useTls ? { tls: { rejectUnauthorized: false } } : {}),
    // Connection resilience
    connectTimeout: 10000,
    retryStrategy: (times: number) => {
      if (times > 5) return null; // stop retrying after 5 attempts
      return Math.min(times * 200, 2000);
    },
  };

  const pubClient = new Redis(redisUrl, connectionOptions);
  const subClient = pubClient.duplicate();

  // Wait for initial connection only. Once connected, runtime errors
  // are logged but don't crash the process. The subscriber mode error
  // from ioredis readyCheck is a known issue with Upstash — harmless.
  await Promise.all([
    new Promise<void>((resolve, reject) => {
      let connected = false;
      pubClient.on("connect", () => {
        connected = true;
        console.log("[REDIS] Pub client connected.");
        resolve();
      });
      pubClient.on("error", (err) => {
        if (!connected) {
          reject(err);
        } else {
          console.warn("[REDIS] Pub client runtime error:", err.message);
        }
      });
    }),
    new Promise<void>((resolve, reject) => {
      let connected = false;
      subClient.on("connect", () => {
        connected = true;
        console.log("[REDIS] Sub client connected.");
        resolve();
      });
      subClient.on("error", (err) => {
        if (!connected) {
          reject(err);
        } else {
          console.warn("[REDIS] Sub client runtime error:", err.message);
        }
      });
    }),
  ]);

  server.adapter(createAdapter(pubClient, subClient));
  console.log("[SOCKET] Redis Pub/Sub adapter active — horizontal scaling enabled.");
  console.log(`[SOCKET] Redis endpoint: ${useTls ? "(TLS) " : ""}${redisUrl.replace(/\/\/.*@/, "//***@")}`);
}

/**
 * Get the Socket.io server instance.
 */
export function getIO(): TypedServer {
  if (!io) {
    throw new Error("Socket.io server not initialized. Call initSocketServer() first.");
  }
  return io;
}

/**
 * Broadcast to a specific group room.
 */
export function broadcastToGroup<E extends keyof ServerToClientEvents>(
  groupId: string,
  event: E,
  ...args: Parameters<ServerToClientEvents[E]>
): void {
  if (io) {
    io.to(`group:${groupId}`).emit(event, ...args);
  }
}
