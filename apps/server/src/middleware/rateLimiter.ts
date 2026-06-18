import rateLimit from "express-rate-limit";
import RedisStore from "rate-limit-redis";
import Redis from "ioredis";

// Reuse the Redis connection URL logic
const redisUrl = process.env.UPSTASH_REDIS_REST_URL
  ? process.env.UPSTASH_REDIS_REST_URL.replace("https", "rediss")
  : process.env.REDIS_URL || "redis://localhost:6379";

const connectionOptions = {
  tls: redisUrl.startsWith("rediss") ? { rejectUnauthorized: false } : undefined,
  maxRetriesPerRequest: 3,
};

// Create a dedicated Redis client for the rate limiter
const redisClient = new Redis(redisUrl, connectionOptions);

// Prevent crashing if Redis goes down — rate limiting will just be bypassed
redisClient.on("error", (err) => {
  console.warn("[RATE LIMITER] Redis connection error:", err.message);
});

/**
 * Standard API Rate Limiter
 * Limits to 100 requests per 15 minutes per IP.
 */
export const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Limit each IP to 100 requests per `window`
  standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
  legacyHeaders: false, // Disable the `X-RateLimit-*` headers
  store: new RedisStore({
    // @ts-expect-error - Known typing mismatch between rate-limit-redis and ioredis, but it works
    sendCommand: (...args: string[]) => redisClient.call(...args),
  }),
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
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  store: new RedisStore({
    // @ts-expect-error
    sendCommand: (...args: string[]) => redisClient.call(...args),
  }),
  message: {
    success: false,
    error: "Too many authentication attempts, please try again later",
    code: "AUTH_RATE_LIMIT_EXCEEDED",
  },
});
