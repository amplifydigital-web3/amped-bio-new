/**
 * Access gating engine contract (Build Board #21, docs/features/access-gating-engine.md
 * section 3.5). Shared by the server engine and, from G3, the client and landing app.
 */
import { z } from "zod";

export const ACCESS_RULE_KINDS = [
  "follower",
  "pool_member",
  "stake_min",
  "paid",
  "member",
  "any",
  "all",
  "reward_points",
  "rns_verified",
] as const;
export type AccessRuleKind = (typeof ACCESS_RULE_KINDS)[number];

// paid joined in G4; member joined in G5
export const LIVE_ACCESS_RULE_KINDS = [
  "follower",
  "pool_member",
  "stake_min",
  "paid",
  "member",
  "any",
  "all",
] as const;
export type LiveAccessRuleKind = (typeof LIVE_ACCESS_RULE_KINDS)[number];

/** Kinds that read a stake. They need the pilot allowlist while counsel reviews (spec 3.11). */
export const STAKE_ACCESS_RULE_KINDS = ["pool_member", "stake_min"] as const;

export const ACCESS_RESOURCE_TYPES = [
  "block",
  "content",
  "broadcast",
  "live_event",
  "dm",
  "telegram_group",
] as const;
export type AccessResourceType = (typeof ACCESS_RESOURCE_TYPES)[number];
// block id, content publicId, etc.
export type AccessResource = { type: AccessResourceType; id: string };

/** Block types a rule can lock. Pool, referral, follow, followers and rnsid are never gated. */
export const GATABLE_BLOCK_TYPES = ["link", "media", "text", "telegram_group"] as const;

export const ACCESS_REASONS = [
  "ok",
  "owner",
  "public",
  "not_found",
  "blocked",
  "age_check_required",
  "not_signed_in",
  "no_wallet",
  "not_follower",
  "follow_pending",
  "not_pool_member",
  "stake_below_min",
  "not_purchased",
  "purchase_pending",
  "not_member",
  "membership_past_due",
  "membership_ended",
  "insufficient_points",
  "kind_unavailable",
  "chain_unavailable",
  "identity_unavailable",
] as const;
export type AccessReason = (typeof ACCESS_REASONS)[number];

export type UnlockHint =
  | { action: "none" }
  | { action: "sign_in" }
  | { action: "verify_age" }
  | { action: "link_wallet" }
  | { action: "confirm_email" }
  | { action: "follow"; creatorHandle: string }
  // never a one tap stake
  | { action: "view_pool"; poolId: number }
  | { action: "buy"; offerId: string; priceDisplay: string }
  // G5: planId is the MembershipPlan id as hex (content spec 3.18, UUID keys)
  | { action: "join_membership"; planId: string; priceMonthlyDisplay: string; pastDue: boolean }
  | { action: "unavailable" };

export type AccessDecision = {
  allowed: boolean;
  reason: AccessReason;
  hint: UnlockHint;
  rule: { id: string; kind: AccessRuleKind; summary: string } | null;
  checkedAt: string;
};

/** Public summaries. No amount ever appears here (spec 3.5 and 3.11). */
export const ACCESS_RULE_SUMMARIES: Record<AccessRuleKind, string> = {
  follower: "Followers",
  pool_member: "Pool fans",
  stake_min: "Fans with a minimum stake",
  paid: "Paid",
  member: "Members",
  any: "Any of these",
  all: "All of these",
  reward_points: "Points",
  rns_verified: "Verified RNS name",
};

const uuidHex = z.string().regex(/^[0-9a-f]{32}$/);
const weiString = z.string().regex(/^[1-9]\d{0,77}$/);

/**
 * Params per kind (spec 3.6). Checked on create, update and read: a stored row
 * that fails to parse refuses (default deny).
 */
export const ACCESS_RULE_PARAMS = {
  follower: z.object({}).strict(),
  pool_member: z.object({ poolId: z.number().int().positive() }).strict(),
  stake_min: z.object({ poolId: z.number().int().positive(), minWei: weiString }).strict(),
  paid: z.object({ offerId: uuidHex }).strict(),
  // G5: the creator's MembershipPlan id as hex (content spec 3.18 moved plans to UUID keys)
  member: z.object({ planId: uuidHex }).strict(),
  any: z.object({ ruleIds: z.array(uuidHex).min(2).max(4) }).strict(),
  all: z.object({ ruleIds: z.array(uuidHex).min(2).max(4) }).strict(),
  reward_points: z
    .object({ programId: z.number().int().positive(), minPoints: z.number().int().positive() })
    .strict(),
  rns_verified: z.object({ attribute: z.string().max(40).optional() }).strict(),
} satisfies Record<AccessRuleKind, z.ZodTypeAny>;

export type AccessRuleParams<K extends AccessRuleKind> = z.infer<(typeof ACCESS_RULE_PARAMS)[K]>;

/** What a creator sends to create a rule. stake_min takes whole tREVO and the server stores wei. */
export const accessRuleInputSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("follower"), params: ACCESS_RULE_PARAMS.follower }),
  z.object({ kind: z.literal("pool_member"), params: ACCESS_RULE_PARAMS.pool_member }),
  z.object({
    kind: z.literal("stake_min"),
    params: z
      .object({
        poolId: z.number().int().positive(),
        minTrevo: z.string().regex(/^[1-9]\d{0,20}$/),
      })
      .strict(),
  }),
  // One of the creator's own products (store PR 9). Checked on the server (G4)
  z.object({ kind: z.literal("paid"), params: ACCESS_RULE_PARAMS.paid }),
  z.object({ kind: z.literal("member"), params: ACCESS_RULE_PARAMS.member }),
  z.object({ kind: z.literal("any"), params: ACCESS_RULE_PARAMS.any }),
  z.object({ kind: z.literal("all"), params: ACCESS_RULE_PARAMS.all }),
]);
export type AccessRuleInput = z.infer<typeof accessRuleInputSchema>;

// ── Access insights (G6, spec 3.10 deltas 7 to 9) ───────────────────────────
// Totals only: by rule, by refusal reason and by item. Never a fan's name, handle,
// avatar or wallet, and no per fan rows or times. A bucket of 1 to 4 viewers leaves the
// server as "under_5", so a small count can never point at one fan.

export const ACCESS_STATS_RANGES = ["7d", "30d", "90d"] as const;
export type AccessStatsRange = (typeof ACCESS_STATS_RANGES)[number];
export const ACCESS_STATS_MIN_BUCKET = 5;
/** Items shown in By item, most locked views first */
export const ACCESS_STATS_ITEMS_MAX = 20;

/** Distinct viewers in a bucket. 1 to 4 is "under_5". */
export type AccessStatCount = number | "under_5";

export type AccessStatRow = {
  /** Distinct viewers who saw it locked */
  lockedViewers: AccessStatCount;
  /** Distinct viewers who tried to open it (refused or opened) */
  triedViewers: AccessStatCount;
  /** Distinct viewers who opened it */
  openedViewers: AccessStatCount;
  /** Opened per tried, whole percent. Null when either side is under 5 */
  openRate: number | null;
};

export type AccessRulesStats = {
  range: AccessStatsRange;
  totals: AccessStatRow;
  rules: Array<
    AccessStatRow & {
      ruleId: string;
      kind: AccessRuleKind;
      summary: string;
      /** The creator's name for a saved rule; null for a rule set on one item or block */
      name: string | null;
      /** Items and blocks that use it */
      uses: number;
      opensToAllAt: string | null;
    }
  >;
  reasons: Array<{ reason: AccessReason; viewers: AccessStatCount }>;
  items: Array<
    AccessStatRow & {
      type: "content" | "block";
      id: string;
      /** The item title or the block label, never a fan detail */
      label: string;
    }
  >;
};

/** Suppress small buckets (spec 3.10 delta 8). Zero stays zero. */
export function accessStatCount(viewers: number): AccessStatCount {
  return viewers > 0 && viewers < ACCESS_STATS_MIN_BUCKET ? "under_5" : viewers;
}

/** Opened per tried, only when both are 5 or more. */
export function accessOpenRate(opened: number, tried: number): number | null {
  if (opened < ACCESS_STATS_MIN_BUCKET || tried < ACCESS_STATS_MIN_BUCKET) return null;
  return Math.round((opened / tried) * 100);
}
