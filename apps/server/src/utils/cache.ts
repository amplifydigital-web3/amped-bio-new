/**
 * Represents a single cache entry with a value and an expiration timestamp.
 * @template T - The type of the cached value.
 * @property {T} value - The cached value of type T.
 * @property {number} expiresAt - The expiration timestamp in milliseconds since the Unix epoch.
 */
interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}

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
}

/**
 * A simple in-memory caching utility with Time-To-Live (TTL) support.
 *
 * This class provides a lightweight caching mechanism that stores key-value pairs
 * in memory with automatic expiration. It's particularly useful for caching
 * frequently accessed data that doesn't change often, such as configuration
 * values, API responses, or computed results.
 *
 * @template T - The type of values to be cached. Defaults to `any` if not specified.
 *
 * @example
 * ```typescript
 * const cache = new SimpleCache<string>(5000); // 5 second TTL
 * cache.set("user:1", "John Doe");
 * const user = cache.get("user:1"); // "John Doe"
 * await sleep(5000);
 * const expired = cache.get("user:1"); // null
 * ```
 */
export class SimpleCache<T = any> {
  /**
   * The internal map that stores all cache entries.
   * Uses a JavaScript Map for O(1) lookups, inserts, and deletions.
   */
  private cache: Map<string, CacheEntry<T>>;

  /**
   * The default Time-To-Live (TTL) for cache entries in milliseconds.
   * This TTL is used when no explicit TTL is provided to the `set` method.
   */
  private defaultTTL: number;

  /**
   * Creates a new SimpleCache instance.
   *
   * @param {number} [defaultTTL=60000] - The default Time-To-Live in milliseconds.
   *                                    Defaults to 60 seconds (60000ms) if not provided.
   */
  constructor(defaultTTL: number = 60000) {
    this.cache = new Map();
    this.defaultTTL = defaultTTL;
  }

  /**
   * Stores a value in the cache with the specified key and optional TTL.
   *
   * If a value with the same key already exists, it will be overwritten with the
   * new value and expiration time.
   *
   * @param {string} key - The unique key to store the value under. Must be a non-empty string.
   * @param {T} value - The value to cache. Can be any type matching the cache's generic type parameter.
   * @param {number} [ttl] - Optional Time-To-Live in milliseconds. If not provided,
   *                        the cache's default TTL is used.
   *
   * @example
   * ```typescript
   * cache.set("config:theme", "dark", 30000); // Expires in 30 seconds
   * cache.set("user:123", { name: "Alice", age: 30 }); // Uses default TTL
   * ```
   */
  set(key: string, value: T, ttl?: number): void {
    const expiresAt = Date.now() + (ttl ?? this.defaultTTL);
    this.cache.set(key, { value, expiresAt });
  }

  /**
   * Retrieves a value from the cache by key.
   *
   * If the entry exists but has expired, it will be automatically removed from the
   * cache and `null` will be returned. This lazy expiration approach ensures that
   * expired entries don't consume memory indefinitely.
   *
   * @param {string} key - The key of the value to retrieve.
   * @returns {T | null} The cached value if it exists and hasn't expired, or `null` otherwise.
   *
   * @example
   * ```typescript
   * cache.set("user:1", "John");
   * const value = cache.get("user:1"); // "John"
   *
   * cache.set("session:abc", "data", 1000);
   * await sleep(1500);
   * const expired = cache.get("session:abc"); // null (expired and removed)
   * ```
   */
  get(key: string): T | null {
    const entry = this.cache.get(key);
    if (!entry) return null;

    if (Date.now() > entry.expiresAt) {
      this.cache.delete(key);
      return null;
    }

    return entry.value;
  }

  /**
   * Checks if a key exists in the cache and hasn't expired.
   *
   * This method internally calls `get()` to ensure that expired entries are
   * properly cleaned up. A key will only be reported as present if it exists
   * and is still within its TTL window.
   *
   * @param {string} key - The key to check for existence.
   * @returns {boolean} `true` if the key exists and hasn't expired, `false` otherwise.
   *
   * @example
   * ```typescript
   * cache.set("token:abc", "secret");
   * cache.has("token:abc"); // true
   *
   * cache.set("temp:data", "value", 100);
   * await sleep(150);
   * cache.has("temp:data"); // false (expired)
   * ```
   */
  has(key: string): boolean {
    return this.get(key) !== null;
  }

  /**
   * Removes a specific entry from the cache by key.
   *
   * This method immediately removes the entry regardless of whether it has expired
   * or not. This is useful when you want to invalidate a cache entry before its
   * natural expiration time.
   *
   * @param {string} key - The key of the entry to remove.
   * @returns {boolean} `true` if an entry was found and removed, `false` if the key
   *                    didn't exist in the cache.
   *
   * @example
   * ```typescript
   * cache.set("user:1", "John");
   * cache.has("user:1"); // true
   * cache.delete("user:1"); // true
   * cache.has("user:1"); // false
   * cache.delete("nonexistent"); // false
   * ```
   */
  delete(key: string): boolean {
    return this.cache.delete(key);
  }

  /**
   * Removes all entries from the cache, regardless of expiration status.
   *
   * This method completely empties the cache, clearing all key-value pairs.
   * Use this when you need to reset the entire cache, such as during application
   * shutdown, configuration reload, or to free up memory.
   *
   * After calling this method, the cache will be empty and `get()` will return
   * `null` for any key until new values are set.
   *
   * @example
   * ```typescript
   * cache.set("user:1", "John");
   * cache.set("user:2", "Alice");
   * cache.has("user:1"); // true
   * cache.clear();
   * cache.has("user:1"); // false
   * cache.has("user:2"); // false
   * ```
   */
  clear(): void {
    this.cache.clear();
  }

  /**
   * Removes all expired entries from the cache.
   *
   * This method iterates through all cache entries and removes those that have
   * exceeded their TTL. While the cache implements lazy expiration (entries are
   * removed on access via `get()` or `has()`), this method provides a way to
   * proactively clean up expired entries without accessing them.
   *
   * This is useful for memory management in long-running processes where expired
   * entries might accumulate over time if they're never accessed again. Calling
   * this method periodically can help prevent memory bloat.
   *
   * @example
   * ```typescript
   * cache.set("temp1", "data1", 100);
   * cache.set("temp2", "data2", 100);
   * await sleep(150);
   *
   * cache.cleanExpired(); // Removes both expired entries
   * cache.has("temp1"); // false
   * cache.has("temp2"); // false
   * ```
   */
  cleanExpired(): void {
    const now = Date.now();
    for (const [key, entry] of this.cache.entries()) {
      if (now > entry.expiresAt) {
        this.cache.delete(key);
      }
    }
  }
}

/**
 * A singleton cache instance for storing referral rewards configuration.
 *
 * This cache is used to store reward amounts for both referrers and referees
 * to avoid repeatedly querying the database or external services. The cache
 * expires after 60 seconds to ensure that changes to reward configurations
 * are reflected in a timely manner.
 *
 * @type {SimpleCache<ReferralRewards>}
 *
 * @example
 * ```typescript
 * // Cache the reward configuration
 * rewardCache.set(CacheKeys.REFERRAL_REWARDS, {
 *   referrerReward: 100,
 *   refereeReward: 50
 * });
 *
 * // Retrieve the cached rewards
 * const rewards = rewardCache.get(CacheKeys.REFERRAL_REWARDS);
 * // { referrerReward: 100, refereeReward: 50 }
 * ```
 *
 * @typedef {Object} ReferralRewards
 * @property {number | null} referrerReward - The reward amount for the referrer, or null if not set.
 * @property {number | null} refereeReward - The reward amount for the referee, or null if not set.
 */
export const rewardCache = new SimpleCache<{
  referrerReward: number | null;
  refereeReward: number | null;
}>(60000); // 1 minute
