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

// paid joins in G4, member in G5
export const LIVE_ACCESS_RULE_KINDS = [
  "follower",
  "pool_member",
  "stake_min",
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
  | { action: "join_membership"; planId: number; priceMonthlyDisplay: string; pastDue: boolean }
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
  member: z.object({ planId: z.number().int().positive() }).strict(),
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
  z.object({ kind: z.literal("any"), params: ACCESS_RULE_PARAMS.any }),
  z.object({ kind: z.literal("all"), params: ACCESS_RULE_PARAMS.all }),
]);
export type AccessRuleInput = z.infer<typeof accessRuleInputSchema>;
