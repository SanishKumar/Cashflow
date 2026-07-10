import rateLimit, { ipKeyGenerator } from "express-rate-limit";
import RedisStore from "rate-limit-redis";
import Redis from "ioredis";

const nodeEnv = process.env.NODE_ENV || "development";
const isProduction = nodeEnv === "production";
const useRedisRateLimitStore = isProduction || process.env.RATE_LIMIT_REDIS === "true";

// Reuse the Redis connection URL logic
const redisUrl = process.env.UPSTASH_REDIS_REST_URL
  ? process.env.UPSTASH_REDIS_REST_URL.replace("https", "rediss")
  : process.env.REDIS_URL || "redis://localhost:6379";

const connectionOptions = {
  tls: redisUrl.startsWith("rediss") ? { rejectUnauthorized: false } : undefined,
  maxRetriesPerRequest: 3,
};

// Create a dedicated Redis client for the rate limiter
const redisClient = useRedisRateLimitStore ? new Redis(redisUrl, connectionOptions) : null;

// Prevent crashing if Redis goes down — rate limiting will just be bypassed
redisClient?.on("error", (err) => {
  console.warn("[RATE LIMITER] Redis connection error:", err.message);
});

function redisStoreOptions(prefix: string) {
  if (!redisClient) return {};
  const client = redisClient;

  return {
    store: new RedisStore({
      prefix,
      // @ts-expect-error - Known typing mismatch between rate-limit-redis and ioredis, but it works
      sendCommand: (...args: string[]) => client.call(...args),
    }),
  };
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
  ...redisStoreOptions("rl:api:"),
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
  passOnStoreError: true,
  ...redisStoreOptions("rl:auth:"),
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
  passOnStoreError: true,
  ...redisStoreOptions("rl:receipt-scan:"),
  message: {
    success: false,
    error: "Free accounts can scan up to 20 receipts per hour. Please try again later.",
    code: "RECEIPT_SCAN_LIMIT_EXCEEDED",
  },
});
