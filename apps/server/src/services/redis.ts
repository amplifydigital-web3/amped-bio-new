import Redis from "ioredis";
import { env } from "../env";

// Create a Redis client
const redisClient = new Redis({
  host: env.REDIS_HOST,
  port: env.REDIS_PORT,
  password: env.REDIS_PASSWORD || undefined,
  keyPrefix: env.REDIS_PREFIX,
});

redisClient.on("error", err => {
  console.error("Redis error:", err);
});

redisClient.on("connect", () => {
  console.log("Connected to Redis");
});

/**
 * Key prefix for faucet claims
 * Format: faucet:claim:{userId}
 */
const FAUCET_CLAIM_PREFIX = "faucet:claim:";

/**
 * Get the UTC date string for today (YYYY-MM-DD)
 * This is used as a key to track faucet claims per UTC day
 */
export const getUtcDateString = (): string => {
  const now = new Date();
  return now.toISOString().split("T")[0]; // Returns YYYY-MM-DD
};

/**
 * Record a faucet claim for a user on the current UTC day
 * @param userId The user ID
 * @returns Promise that resolves when the claim is recorded
 */
export const recordFaucetClaim = async (userId: number): Promise<void> => {
  const key = `${FAUCET_CLAIM_PREFIX}${userId}`;
  const currentUtcDay = getUtcDateString();

  // Store the claim with the UTC date and set expiry to 48 hours (to ensure we keep data for next day comparison)
  await redisClient.set(key, currentUtcDay, "EX", 60 * 60 * 48);
};

/**
 * Check if a user has already claimed faucet tokens today (UTC)
 * @param userId The user ID
 * @returns Promise that resolves to true if user has already claimed today, false otherwise
 */
export const hasClaimedToday = async (userId: number): Promise<boolean> => {
  const key = `${FAUCET_CLAIM_PREFIX}${userId}`;
  const lastClaimDate = await redisClient.get(key);
  const currentUtcDay = getUtcDateString();

  // If there's a record and it matches today's UTC date, user has already claimed
  return lastClaimDate === currentUtcDay;
};

/**
 * Get the next claim date (tomorrow in UTC)
 * @returns Date object set to 00:00:00 UTC tomorrow
 */
export const getNextClaimDate = (): Date => {
  const now = new Date();
  const tomorrow = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1, 0, 0, 0, 0)
  );
  return tomorrow;
};

export default redisClient;
