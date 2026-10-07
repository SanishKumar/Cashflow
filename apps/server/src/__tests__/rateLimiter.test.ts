import { EventEmitter } from "node:events";
import express from "express";
import rateLimit from "express-rate-limit";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FallbackStore, type SharedCounter } from "../lib/rateLimitStore.js";

const { clients } = vi.hoisted(() => ({ clients: [] as any[] }));

// The limiter module opens a connection when it is imported. This stands in
// for ioredis so the tests decide what Redis is doing, not the network.
vi.mock("ioredis", async () => {
  const { EventEmitter: Emitter } = await import("node:events");

  class FakeRedis extends Emitter {
    status = "connecting";
    call = vi.fn(async () => {
      throw new Error("Stream isn't writeable and enableOfflineQueue options is false");
    });

    constructor(
      public url: string,
      public options: Record<string, unknown>
    ) {
      super();
      clients.push(this);
    }
  }

  return { default: FakeRedis };
});

/** Enough of Redis for the store: loading the scripts, running them, DECR and DEL. */
function fakeRedis() {
  const hits = new Map<string, number>();
  const state = { ready: true, failing: false, calls: 0 };

  const counter: SharedCounter = {
    ready: () => state.ready,
    call: async (...args: string[]) => {
      state.calls += 1;
      if (state.failing) throw new Error("Command timed out");

      const [command, ...rest] = args;
      if (command === "SCRIPT") return rest[1]!.includes("INCR") ? "sha-increment" : "sha-get";
      if (command === "EVALSHA") {
        const key = rest[2]!;
        if (rest[0] !== "sha-increment") return [hits.get(key) ?? false, 60000];
        const next = (hits.get(key) ?? 0) + 1;
        hits.set(key, next);
        return [next, 60000];
      }
      if (command === "DECR") {
        const next = (hits.get(rest[0]!) ?? 0) - 1;
        hits.set(rest[0]!, next);
        return next;
      }
      if (command === "DEL") return hits.delete(rest[0]!) ? 1 : 0;
      throw new Error(`unexpected command ${command}`);
    },
  };

  return { counter, hits, state };
}

function limited(store: FallbackStore) {
  const app = express();
  app.use(rateLimit({ windowMs: 60_000, limit: 2, store, passOnStoreError: false }));
  app.get("/", (_req, res) => {
    res.json({ ok: true });
  });
  return app;
}

async function statuses(app: express.Express, count: number): Promise<number[]> {
  const seen: number[] = [];
  for (let i = 0; i < count; i += 1) seen.push((await request(app).get("/")).status);
  return seen;
}

describe("FallbackStore", () => {
  it("counts in memory when there is no Redis to count in", async () => {
    const store = new FallbackStore(null, "t:none:");

    expect(await statuses(limited(store), 3)).toEqual([200, 200, 429]);
    expect(store.counting).toBe("local");
  });

  it("keeps the limit, and leaves Redis alone, while Redis is not connected", async () => {
    const { counter, state } = fakeRedis();
    state.ready = false;
    const store = new FallbackStore(counter, "t:down:");

    expect(await statuses(limited(store), 3)).toEqual([200, 200, 429]);
    expect(state.calls).toBe(0);
    expect(store.counting).toBe("local");
  });

  it("counts in Redis while it is connected", async () => {
    const { counter, hits } = fakeRedis();
    const store = new FallbackStore(counter, "t:up:");

    expect(await statuses(limited(store), 3)).toEqual([200, 200, 429]);
    expect([...hits.entries()]).toEqual([[expect.stringMatching(/^t:up:/), 3]]);
    expect(store.counting).toBe("shared");
  });

  it("serves the request from memory when a connected Redis fails anyway", async () => {
    const { counter, state } = fakeRedis();
    state.failing = true;
    const failures = vi.fn();
    const store = new FallbackStore(counter, "t:flaky:", failures);

    expect(await statuses(limited(store), 3)).toEqual([200, 200, 429]);
    expect(failures).toHaveBeenCalled();
  });

  it("goes back to Redis once it returns", async () => {
    const { counter, hits, state } = fakeRedis();
    state.ready = false;
    const store = new FallbackStore(counter, "t:back:");
    const app = limited(store);

    expect(await statuses(app, 1)).toEqual([200]);
    expect(hits.size).toBe(0);

    state.ready = true;
    expect(await statuses(app, 3)).toEqual([200, 200, 429]);
    expect([...hits.values()]).toEqual([3]);
  });

  it("clears a client from both stores on a reset", async () => {
    const { counter, hits, state } = fakeRedis();
    const store = new FallbackStore(counter, "t:reset:");
    const app = limited(store);

    state.ready = false;
    await statuses(app, 2);
    state.ready = true;
    await statuses(app, 2);
    const key = [...hits.keys()][0]!.slice("t:reset:".length);

    await store.resetKey(key);

    expect(hits.size).toBe(0);
    state.ready = false;
    expect(await statuses(app, 1)).toEqual([200]);
  });
});

describe("limiters when the Redis host is gone", () => {
  const original = { ...process.env };
  let warn: ReturnType<typeof vi.spyOn>;
  let log: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.resetModules();
    clients.length = 0;
    process.env.NODE_ENV = "production";
    process.env.REDIS_URL = "rediss://default:secret@reclaimed.upstash.invalid:6379";
    delete process.env.UPSTASH_REDIS_REST_URL;
    warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    log = vi.spyOn(console, "log").mockImplementation(() => {});
  });

  afterEach(() => {
    process.env = { ...original };
    vi.restoreAllMocks();
  });

  function notFound(client: EventEmitter): void {
    client.emit("error", new Error("getaddrinfo ENOTFOUND reclaimed.upstash.invalid"));
  }

  it("still lets people sign in, and still stops a brute force", async () => {
    const { authLimiter } = await import("../middleware/rateLimiter.js");
    notFound(clients[0]);

    const app = express();
    app.post("/login", authLimiter, (_req, res) => {
      res.status(401).json({ success: false });
    });

    const seen: number[] = [];
    for (let i = 0; i < 11; i += 1) seen.push((await request(app).post("/login")).status);

    // Ten wrong passwords are answered as wrong passwords. The eleventh is refused.
    expect(seen).toEqual([...Array(10).fill(401), 429]);
    expect(clients[0].call).not.toHaveBeenCalled();
  });

  it("does not hold a request up waiting for a connection", async () => {
    const { apiLimiter } = await import("../middleware/rateLimiter.js");
    notFound(clients[0]);

    expect(clients[0].options).toMatchObject({ enableOfflineQueue: false, maxRetriesPerRequest: 1 });

    const app = express();
    app.use(apiLimiter);
    app.get("/", (_req, res) => {
      res.json({ ok: true });
    });

    const started = Date.now();
    const response = await request(app).get("/");

    expect(response.status).toBe(200);
    expect(response.headers["ratelimit-remaining"]).toBe("99");
    expect(Date.now() - started).toBeLessThan(1000);
  });

  it("keeps retrying, but backs off to twice a minute", async () => {
    await import("../middleware/rateLimiter.js");
    const retry = clients[0].options.retryStrategy as (attempt: number) => number;

    expect(retry(1)).toBe(1000);
    expect(retry(10)).toBe(10000);
    expect(retry(5000)).toBe(30000);
  });

  it("says so once when Redis goes, and once when it comes back", async () => {
    await import("../middleware/rateLimiter.js");
    const client = clients[0];

    for (let i = 0; i < 50; i += 1) notFound(client);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0]![0]).toContain("ENOTFOUND");

    client.status = "ready";
    client.emit("ready");
    client.emit("ready");
    expect(log).toHaveBeenCalledTimes(1);

    client.status = "reconnecting";
    notFound(client);
    notFound(client);
    expect(warn).toHaveBeenCalledTimes(2);
  });

  it("does not write a line per request while a connected Redis keeps failing", async () => {
    const { apiLimiter } = await import("../middleware/rateLimiter.js");
    const client = clients[0];
    client.status = "ready";
    client.emit("ready");

    const app = express();
    app.use(apiLimiter);
    app.get("/", (_req, res) => {
      res.json({ ok: true });
    });

    const seen: number[] = [];
    for (let i = 0; i < 6; i += 1) seen.push((await request(app).get("/")).status);

    expect(seen).toEqual(Array(6).fill(200));
    expect(client.call).toHaveBeenCalled();
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0]![0]).toContain("Redis command failed");
  });

  it("counts in memory without a connection when no Redis is configured", async () => {
    delete process.env.REDIS_URL;
    const { apiLimiter } = await import("../middleware/rateLimiter.js");

    expect(clients).toHaveLength(0);
    expect(warn).toHaveBeenCalledTimes(1);

    const app = express();
    app.use(apiLimiter);
    app.get("/", (_req, res) => {
      res.json({ ok: true });
    });
    expect((await request(app).get("/")).status).toBe(200);
  });
});
