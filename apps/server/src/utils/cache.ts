import type { Address } from "viem";
import Redis from "ioredis";
import { env } from "../env";

let redisClient: Redis | null = null;

function getRedisClient(): Redis | null {
  if (!redisClient) {
    try {
      redisClient = new Redis({
        host: env.REDIS_HOST,
        port: env.REDIS_PORT,
        password: env.REDIS_PASSWORD || undefined,
        tls: env.REDIS_TLS ? {} : undefined,
        maxRetriesPerRequest: 1,
        retryStrategy: () => null,
        commandTimeout: 3000,
        connectTimeout: 3000,
      });
      console.log("[CACHE] Redis client initialized");
    } catch (error) {
      console.error("[CACHE] Failed to initialize Redis client:", error);
      redisClient = null;
    }
  }
  return redisClient;
}

/**
 * Fallback in-memory cache for when Redis is not available.
 * Used only if Redis is disabled or connection fails.
 */
class FallbackCache {
  private cache = new Map<string, { value: any; expiresAt: number }>();
  private defaultTTL: number;

  constructor(defaultTTL: number = 60000) {
    this.defaultTTL = defaultTTL;
  }

  async set<T>(key: string, value: T, ttl?: number): Promise<void> {
    const ttlMs = ttl ?? this.defaultTTL;
    this.cache.set(key, { value, expiresAt: Date.now() + ttlMs });
  }

  async get<T>(key: string): Promise<T | null> {
    const entry = this.cache.get(key);
    if (!entry) return null;

    if (Date.now() > entry.expiresAt) {
      this.cache.delete(key);
      return null;
    }

    return entry.value as T;
  }

  async has(key: string): Promise<boolean> {
    const entry = this.cache.get(key);
    if (!entry) return false;

    if (Date.now() > entry.expiresAt) {
      this.cache.delete(key);
      return false;
    }

    return true;
  }

  async delete(key: string): Promise<boolean> {
    return this.cache.delete(key);
  }

  async clear(): Promise<void> {
    this.cache.clear();
  }

  async cleanExpired(): Promise<void> {
    const now = Date.now();
    for (const [key, entry] of this.cache.entries()) {
      if (now > entry.expiresAt) {
        this.cache.delete(key);
      }
    }
  }
}

let fallbackCache: FallbackCache | null = null;

function getFallbackCache(): FallbackCache {
  if (!fallbackCache) {
    fallbackCache = new FallbackCache();
    console.log("[CACHE] Fallback in-memory cache initialized");
  }
  return fallbackCache;
}

/**
 * Cache TTL (Time-To-Live) constants in seconds.
 */
export const CACHE_TTL = {
  /**
   * 4 hours - Used for pool APY caching.
   * APY calculation is extremely heavy (multiple contract calls + complex math).
   */
  APY: 14400,
  /**
   * 15 minutes - Used for pool public data caching (totalStake, fans count).
   */
  POOL_DATA: 900,
  /**
   * 15 minutes - Used for system-wide stats caching (total REVO staked/minted).
   */
  SYSTEM_STATS: 900,
  /**
   * 7 days - Used for method signature caching from Openchain.
   * Function signatures rarely change once deployed.
   */
  METHOD_SIGNATURE: 604800,
} as const;

/**
 * Enumeration of cache keys used throughout the application.
 * Each key represents a specific cacheable data type or category.
 * @enum {string}
 */
export enum CacheKeys {
  /**
   * Cache key for storing referral rewards configuration.
   * This cache stores reward amounts for both referrers and referees.
   */
  REFERRAL_REWARDS = "referral_rewards",
  /**
   * Cache key prefix for storing pool APY values.
   * Format: `apy:${chainId}:${poolAddress}`
   */
  APY_PREFIX = "apy",
  /**
   * Cache key prefix for storing pools public data (totalStake, fans count).
   * Format: `pools_public_data:${chainId}:${poolAddress}:${searchTerm}`
   */
  POOLS_PUBLIC_DATA_PREFIX = "pools_public_data",
  /**
   * Cache key prefix for storing method signatures from Openchain.
   * Format: `method_signature:${selector}`
   */
  METHOD_SIGNATURE_PREFIX = "method_signature",
  /**
   * Cache key prefix for storing system-wide statistics.
   * Format: `system_stats:${chainId}`
   */
  SYSTEM_STATS_PREFIX = "system_stats",
}

/**
 * A singleton cache utility.
 * Uses Redis when available, falls back to in-memory cache when Redis is disabled or unavailable.
 * All operations return gracefully even if caching is completely unavailable.
 */
class Cache {
  /**
   * Stores a value in Redis or fallback cache with specified key and TTL.
   *
   * @param {string} key - The unique key to store the value under.
   * @param {T} value - The value to cache.
   * @param {number} [ttl] - Optional Time-To-Live in seconds. Defaults to 60 seconds.
   */
  async set<T>(key: string, value: T, ttl?: number): Promise<void> {
    const redis = getRedisClient();
    if (redis) {
      try {
        const ttlInSeconds = ttl ?? 60;
        const serializedValue = JSON.stringify(value);
        await redis.set(key, serializedValue, "EX", ttlInSeconds);
        return;
      } catch (error) {
        console.warn(`[CACHE] Redis set failed for key "${key}", using fallback`);
      }
    }
    const fallback = getFallbackCache();
    const ttlMs = (ttl ?? 60) * 1000;
    await fallback.set(key, value, ttlMs);
  }

  /**
   * Retrieves a value from Redis or fallback cache by key.
   *
   * @param {string} key - The key of the value to retrieve.
   * @returns {Promise<T | null>} The cached value if it exists and hasn't expired, or `null` otherwise.
   */
  async get<T>(key: string): Promise<T | null> {
    const redis = getRedisClient();
    if (redis) {
      try {
        const value = await redis.get(key);
        if (value === null) return null;

        try {
          return JSON.parse(value) as T;
        } catch {
          return null;
        }
      } catch (error) {
        console.warn(`[CACHE] Redis get failed for key "${key}", using fallback`);
      }
    }

    const fallback = getFallbackCache();
    return await fallback.get(key);
  }

  /**
   * Checks if a key exists in Redis or fallback cache.
   *
   * @param {string} key - The key to check for existence.
   * @returns {Promise<boolean>} `true` if the key exists, `false` otherwise.
   */
  async has(key: string): Promise<boolean> {
    const redis = getRedisClient();
    if (redis) {
      try {
        const exists = await redis.exists(key);
        return exists === 1;
      } catch (error) {
        console.warn(`[CACHE] Redis has failed for key "${key}", using fallback`);
      }
    }

    const fallback = getFallbackCache();
    return await fallback.has(key);
  }

  async delete(key: string): Promise<boolean> {
    const redis = getRedisClient();
    let deleted = false;

    if (redis) {
      try {
        const result = await redis.del(key);
        deleted = result === 1;
      } catch (error) {
        console.warn(`[CACHE] Redis delete failed for key "${key}", using fallback`);
      }
    }

    const fallback = getFallbackCache();
    return (await fallback.delete(key)) || deleted;
  }

  async clear(): Promise<void> {
    const redis = getRedisClient();
    if (redis) {
      try {
        await redis.flushdb();
      } catch (error) {
        console.warn("[CACHE] Redis clear failed, using fallback");
      }
    }

    const fallback = getFallbackCache();
    await fallback.clear();
  }

  /**
   * Removes all expired entries from the cache.
   * This method is a no-op for Redis since it handles expiration automatically.
   */
  async cleanExpired(): Promise<void> {
    const redis = getRedisClient();
    if (!redis) {
      const fallback = getFallbackCache();
      await fallback.cleanExpired();
    }
  }
}

/**
 * Singleton cache instance.
 * All caching operations use this single instance with specific keys for each data type.
 */
export const cache = new Cache();

export function getAPYCacheKey(chainId: number, poolAddress: Address): string {
  return `${CacheKeys.APY_PREFIX}:${chainId}:${poolAddress}`;
}

export function getPoolsCacheKey(
  chainId: number,
  poolAddress: Address,
  search: string = ""
): string {
  return `${CacheKeys.POOLS_PUBLIC_DATA_PREFIX}:${chainId}:${poolAddress}:${search.toLowerCase()}`;
}

export function getMethodSignatureCacheKey(selector: string): string {
  return `${CacheKeys.METHOD_SIGNATURE_PREFIX}:${selector}`;
}

export function getSystemStatsCacheKey(chainId: number): string {
  return `${CacheKeys.SYSTEM_STATS_PREFIX}:${chainId}`;
}
