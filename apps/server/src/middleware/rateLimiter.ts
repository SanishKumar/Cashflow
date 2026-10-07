import rateLimit, { ipKeyGenerator } from "express-rate-limit";
import Redis from "ioredis";
import { FallbackStore, type SharedCounter } from "../lib/rateLimitStore.js";

const nodeEnv = process.env.NODE_ENV || "development";
const isProduction = nodeEnv === "production";
const useRedisRateLimitStore = isProduction || process.env.RATE_LIMIT_REDIS === "true";

// Reuse the Redis connection URL logic
const redisUrl = process.env.UPSTASH_REDIS_REST_URL
  ? process.env.UPSTASH_REDIS_REST_URL.replace("https", "rediss")
  : process.env.REDIS_URL;

/**
 * The limiter's own Redis connection, or null when there is nothing to
 * connect to. Limits are then counted in memory, per instance.
 */
function connect(): SharedCounter | null {
  if (!useRedisRateLimitStore) return null;

  if (!redisUrl) {
    console.warn("[RATE LIMITER] REDIS_URL is not set. Limits are counted in memory, per instance.");
    return null;
  }

  const client = new Redis(redisUrl, {
    // Let Node verify the Redis provider's certificate chain.
    tls: redisUrl.startsWith("rediss") ? {} : undefined,
    // A limiter must never hold a request up. With the queue on, a command
    // sent while disconnected waits out several reconnection attempts before
    // it fails, and every API call waited with it.
    enableOfflineQueue: false,
    maxRetriesPerRequest: 1,
    commandTimeout: 2000,
    connectTimeout: 10000,
    // Keep trying for as long as it takes, so limits are shared again without
    // a restart, but not more often than twice a minute.
    retryStrategy: (attempt) => Math.min(attempt * 1000, 30000),
  });

  // ioredis reports every failed attempt. One line when Redis goes and one
  // when it comes back is what an operator needs; a line a second is not.
  let state: "unknown" | "up" | "down" = "unknown";

  const down = (reason: string): void => {
    if (state === "down") return;
    state = "down";
    console.warn(
      `[RATE LIMITER] Redis unavailable (${reason}). Counting in memory, per instance, until it returns.`
    );
  };

  client.on("ready", () => {
    if (state !== "up") console.log("[RATE LIMITER] Redis connected. Limits are shared across instances.");
    state = "up";
  });
  client.on("error", (error) => down(error.message));
  client.on("end", () => down("connection closed"));

  return {
    ready: () => client.status === "ready",
    call: (...args: string[]) => client.call(args[0]!, ...args.slice(1)),
  };
}

const redis = connect();

function storeFor(prefix: string): FallbackStore {
  return new FallbackStore(redis, prefix, (error) => {
    const reason = error instanceof Error ? error.message : String(error);
    console.warn(`[RATE LIMITER] ${prefix} counted in memory after a Redis error: ${reason}`);
  });
}

/**
 * Standard API Rate Limiter
 * Limits to 100 requests per 15 minutes per IP.
 */
export const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: isProduction ? 100 : 1000, // Local dev makes many hot-reload/API requests.
  standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
  legacyHeaders: false, // Disable the `X-RateLimit-*` headers
  passOnStoreError: true,
  store: storeFor("rl:api:"),
  message: {
    success: false,
    error: "Too many requests from this IP, please try again after 15 minutes",
    code: "RATE_LIMIT_EXCEEDED",
  },
});

/**
 * Strict Auth Rate Limiter
 * Limits to 10 requests per 15 minutes per IP.
 * Applied to login and registration endpoints to prevent brute force attacks.
 */
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: isProduction ? 10 : 100,
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  // Losing Redis moves the count into memory rather than stopping it, so this
  // only bites if counting fails altogether. Then authentication is refused:
  // an unlimited login endpoint is worse than an unavailable one.
  passOnStoreError: false,
  store: storeFor("rl:auth:"),
  message: {
    success: false,
    error: "Too many authentication attempts, please try again later",
    code: "AUTH_RATE_LIMIT_EXCEEDED",
  },
});

/**
 * Receipt scans are an expensive AI operation. The key is the authenticated
 * user rather than IP, so a shared office or mobile network cannot exhaust a
 * colleague's quota. Premium users are supplied by the billing integration
 * through PREMIUM_RECEIPT_USER_IDS until subscriptions are persisted in-app.
 */
function isPremiumReceiptUser(userId: string | undefined): boolean {
  if (!userId) return false;
  return (process.env.PREMIUM_RECEIPT_USER_IDS || "")
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean)
    .includes(userId);
}

export const receiptScanLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => `receipt:${req.userId || (req.ip ? ipKeyGenerator(req.ip) : "unknown-ip")}`,
  skip: (req) => isPremiumReceiptUser(req.userId),
  passOnStoreError: false,
  store: storeFor("rl:receipt-scan:"),
  message: {
    success: false,
    error: "Free accounts can scan up to 20 receipts per hour. Please try again later.",
    code: "RECEIPT_SCAN_LIMIT_EXCEEDED",
  },
});
