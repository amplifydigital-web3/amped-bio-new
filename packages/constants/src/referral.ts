/**
 * Referral-related constants
 */

export const PROCESSING_TXID = "0x0000000000000000000000000000000000000000";

/**
 * Daily airdrop cooldown in milliseconds (23 hours).
 * Using 23h instead of 24h prevents the claim time from drifting later each day.
 */
export const DAILY_AIRDROP_COOLDOWN_MS = 23 * 60 * 60 * 1000;
