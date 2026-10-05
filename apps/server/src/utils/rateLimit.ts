import { TRPCError } from "@trpc/server";
import { getRedisClient } from "./cache";

/**
 * Fixed window rate limiter shared across server instances through Redis.
 * When Redis is unavailable it falls back to a per-process window, so limits
 * still hold on one instance (the analytics collector's own limiter is
 * per-process only).
 */
const localBuckets = new Map<string, { count: number; resetAt: number }>();
const MAX_LOCAL_KEYS = 50_000;

function hitLocal(key: string, windowSeconds: number): number {
  const now = Date.now();
  const bucket = localBuckets.get(key);
  if (!bucket || bucket.resetAt <= now) {
    if (localBuckets.size > MAX_LOCAL_KEYS) localBuckets.clear();
    localBuckets.set(key, { count: 1, resetAt: now + windowSeconds * 1000 });
    return 1;
  }
  bucket.count += 1;
  return bucket.count;
}

/** Counts one hit for `key` and returns the number of hits in the current window. */
export async function hitRateLimit(key: string, windowSeconds: number): Promise<number> {
  const redis = getRedisClient();
  if (redis) {
    try {
      const redisKey = `ratelimit:${key}:${Math.floor(Date.now() / (windowSeconds * 1000))}`;
      const count = await redis.incr(redisKey);
      if (count === 1) await redis.expire(redisKey, windowSeconds + 5);
      return count;
    } catch {
      // Fall through to the per-process window
    }
  }
  return hitLocal(key, windowSeconds);
}

export type RateLimitRule = { key: string; limit: number; windowSeconds: number };

/** Throws TOO_MANY_REQUESTS with a plain message when any rule is exceeded. */
export async function enforceRateLimits(rules: RateLimitRule[], message: string): Promise<void> {
  for (const rule of rules) {
    const count = await hitRateLimit(rule.key, rule.windowSeconds);
    if (count > rule.limit) {
      throw new TRPCError({ code: "TOO_MANY_REQUESTS", message });
    }
  }
}
