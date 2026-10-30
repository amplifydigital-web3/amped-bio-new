/**
 * Access gating engine core (Build Board #21, docs/features/access-gating-engine.md, PR G1).
 *
 * One function answers every access question; features ask, they never
 * evaluate (spec 3.1). Default deny: an unknown kind, missing data, a chain
 * failure or any thrown error refuses. The secret never leaves the server before
 * a pass: open() runs the feature's reveal only inside a pass.
 *
 * Pipeline (spec 3.2): resolve, preconditions, evaluate, decide, reveal, record.
 */
import { prisma } from "@repo/database";
import {
  ACCESS_RULE_SUMMARIES,
  LIVE_ACCESS_RULE_KINDS,
  STAKE_ACCESS_RULE_KINDS,
  type AccessDecision,
  type AccessReason,
  type AccessResource,
  type AccessResourceType,
  type AccessRuleKind,
  type IdentityCheckResult,
  type UnlockHint,
} from "@repo/constants";
import { env } from "../../env";
import { getRedisClient } from "../../utils/cache";
import { uuidv7 } from "../../utils/uuid-v7";
import { getVisitorHash } from "../analytics/requestContext";
import { checkIdentity } from "../identity/checks";
import { trustedEmailWhere } from "../../utils/verificationGrace";
import { chainStakeWei, followState, loadPool, mirrorStakeWei } from "./facts";
import { hexToId, idToHex, loadRule, type LoadedRule } from "./rules";
import type { Gate, Resolver, Viewer } from "./types";

type Intent = "render" | "open";
export type CheckOptions = { intent?: Intent; fresh?: boolean };

// ── Resolver registry ───────────────────────────────────────────
const resolvers = new Map<AccessResourceType, Resolver>();

export function registerResolver(type: AccessResourceType, resolver: Resolver) {
  resolvers.set(type, resolver);
}

/** For tests only. */
export function clearResolvers() {
  resolvers.clear();
}

// ── Decisions ────────────────────────────────────────────────────
function decision(
  allowed: boolean,
  reason: AccessReason,
  hint: UnlockHint,
  rule: LoadedRule | null
): AccessDecision {
  return {
    allowed,
    reason,
    hint,
    rule: rule ? { id: rule.id, kind: rule.kind, summary: ACCESS_RULE_SUMMARIES[rule.kind] } : null,
    checkedAt: new Date().toISOString(),
  };
}

const refuse = (reason: AccessReason, hint: UnlockHint, rule: LoadedRule | null = null) =>
  decision(false, reason, hint, rule);
const allow = (reason: AccessReason, rule: LoadedRule | null = null) =>
  decision(true, reason, { action: "none" }, rule);

/** checkIdentity results to engine reasons (spec 3.4). Exported for tests. */
export function ageDecision(result: IdentityCheckResult | "signed_out"): AccessDecision | null {
  if (result === "signed_out") return refuse("age_check_required", { action: "sign_in" });
  if (result.pass) return null;
  switch (result.reason) {
    case "under_18":
      // No retry: identity checks spec 4.5 opens a review case
      return refuse("age_check_required", { action: "none" });
    case "unavailable":
      return refuse("identity_unavailable", { action: "unavailable" });
    default:
      return refuse("age_check_required", { action: "verify_age" });
  }
}

/** Stake rules are live only for creators on the pilot allowlist (spec 6, flags). */
export function stakeKindsAllowed(
  ownerUserId: number,
  allowlist = env.ACCESS_STAKE_KINDS_ALLOWLIST
) {
  return allowlist
    .split(",")
    .map(value => value.trim())
    .filter(Boolean)
    .includes(String(ownerUserId));
}

type Owner = { id: number; handle: string | null; block: string; page_status: string };

async function loadOwner(ownerUserId: number): Promise<Owner | null> {
  return prisma.user.findUnique({
    where: { id: ownerUserId },
    select: { id: true, handle: true, block: true, page_status: true },
  });
}

/**
 * The viewer's stake in wei. Render reads the mirror; open always reads the chain,
 * so an open right after a stake or unstake sees it (acceptance 7) without a cache
 * to purge. When the chain cannot be read, open refuses: the mirror may only ever
 * refuse, never pass (spec 3.8).
 */
async function stakeWei(
  poolId: number,
  viewer: Viewer & { userId: number },
  intent: Intent
): Promise<bigint | "chain_unavailable"> {
  if (intent === "render") return mirrorStakeWei(poolId, viewer.userId);
  const pool = await loadPool(poolId);
  if (!pool || !viewer.wallet) return "chain_unavailable";
  try {
    return await chainStakeWei(pool, viewer.wallet);
  } catch (err) {
    console.error("[access] chain stake read failed", {
      poolId,
      message: err instanceof Error ? err.message : String(err),
    });
    return "chain_unavailable";
  }
}

/** One leaf rule. Combinators call this for each leaf (depth 1). */
async function evaluateLeaf(
  rule: LoadedRule,
  owner: Owner,
  viewer: Viewer,
  intent: Intent
): Promise<AccessDecision> {
  if (!(LIVE_ACCESS_RULE_KINDS as readonly string[]).includes(rule.kind)) {
    return refuse("kind_unavailable", { action: "unavailable" }, rule);
  }
  if (rule.kind === "any" || rule.kind === "all") {
    // Nested combinators are not allowed (depth 1)
    return refuse("kind_unavailable", { action: "unavailable" }, rule);
  }
  if (viewer.userId === null) return refuse("not_signed_in", { action: "sign_in" }, rule);
  const signedIn = viewer as Viewer & { userId: number };

  if (rule.kind === "follower") {
    const state = await followState(owner.id, signedIn.userId);
    if (state === "active") return allow("ok", rule);
    if (state === "pending") return refuse("follow_pending", { action: "confirm_email" }, rule);
    return owner.handle
      ? refuse("not_follower", { action: "follow", creatorHandle: owner.handle }, rule)
      : refuse("not_follower", { action: "unavailable" }, rule);
  }

  // pool_member and stake_min
  if (!stakeKindsAllowed(owner.id))
    return refuse("kind_unavailable", { action: "unavailable" }, rule);
  const poolId = rule.params.poolId as number;
  const pool = await loadPool(poolId);
  // v1 decision 3: only the owner's own pool counts
  if (!pool || pool.ownerUserId !== owner.id) {
    return refuse("kind_unavailable", { action: "unavailable" }, rule);
  }
  if (!signedIn.wallet) return refuse("no_wallet", { action: "link_wallet" }, rule);
  const stake = await stakeWei(poolId, signedIn, intent);
  if (stake === "chain_unavailable") {
    return refuse("chain_unavailable", { action: "unavailable" }, rule);
  }
  if (rule.kind === "pool_member") {
    return stake > 0n
      ? allow("ok", rule)
      : refuse("not_pool_member", { action: "view_pool", poolId }, rule);
  }
  const minWei = BigInt(rule.params.minWei as string);
  return stake >= minWei
    ? allow("ok", rule)
    : refuse("stake_below_min", { action: "view_pool", poolId }, rule);
}

async function evaluateRule(
  rule: LoadedRule,
  owner: Owner,
  viewer: Viewer,
  intent: Intent,
  fresh: boolean
): Promise<AccessDecision> {
  if (rule.kind !== "any" && rule.kind !== "all") return evaluateLeaf(rule, owner, viewer, intent);
  const leaves: LoadedRule[] = [];
  for (const id of rule.params.ruleIds as string[]) {
    const leaf = await loadRule(id, { fresh });
    if (!leaf || leaf === "invalid" || leaf.ownerUserId !== owner.id) {
      return refuse("kind_unavailable", { action: "unavailable" }, rule);
    }
    leaves.push(leaf);
  }
  const results = await Promise.all(leaves.map(leaf => evaluateLeaf(leaf, owner, viewer, intent)));
  const passed = results.filter(result => result.allowed);
  if (rule.kind === "any" ? passed.length > 0 : passed.length === results.length) {
    return allow("ok", rule);
  }
  // Refuse with the first leaf that failed, under the combinator's summary
  const failed = results.find(result => !result.allowed)!;
  return refuse(failed.reason, failed.hint, rule);
}

// ── Freshness: viewer versions and the decision cache (spec 3.8) ──
async function viewerVersion(userId: number): Promise<string> {
  const redis = getRedisClient();
  if (!redis) return "0";
  try {
    return (await redis.get(`access:vv:${userId}`)) ?? "0";
  } catch {
    return "0";
  }
}

/**
 * The "at least as fresh" step: after a follow, unfollow, block, stake confirm,
 * purchase, membership change or age check, the viewer's next check is fresh.
 */
export async function bumpViewer(userId: number, reason: string): Promise<void> {
  const redis = getRedisClient();
  if (!redis) return;
  try {
    await redis.incr(`access:vv:${userId}`);
  } catch (err) {
    console.warn("[access] bumpViewer failed", { userId, reason, message: String(err) });
  }
}

const DECISION_CACHE_SECONDS = 60;

/**
 * Decisions are cached only in Redis. Without Redis the in-memory fallback is per
 * process, so a bump on one instance would not reach another: no decision cache.
 */
async function cachedDecision(key: string): Promise<AccessDecision | null> {
  const redis = getRedisClient();
  if (!redis) return null;
  try {
    const hit = await redis.get(key);
    return hit ? (JSON.parse(hit) as AccessDecision) : null;
  } catch {
    return null;
  }
}

async function storeDecision(key: string, value: AccessDecision) {
  const redis = getRedisClient();
  if (!redis) return;
  try {
    await redis.set(key, JSON.stringify(value), "EX", DECISION_CACHE_SECONDS);
  } catch {
    // not cached, still correct
  }
}

// ── Events (spec 3.2 step 6) ─────────────────────────────────────
export function viewerKey(viewer: Viewer, ownerUserId: number): string {
  if (viewer.userId !== null) return `u:${viewer.userId}`;
  if (!viewer.request) return "v:unknown";
  // The daily salted visitor hash, scoped to the creator; never the IP
  return `v:${getVisitorHash(ownerUserId, viewer.request.ip, viewer.request.userAgent).slice(0, 22)}`;
}

const EVENT_DEDUPE_SECONDS = 600;
const RENDER_SAMPLE_RATE = 0.1;

async function recordEvent(
  resource: AccessResource,
  gate: Gate,
  viewer: Viewer,
  result: AccessDecision,
  intent: Intent,
  revealed: boolean
) {
  try {
    if (intent === "render" && (result.allowed || Math.random() >= RENDER_SAMPLE_RATE)) return;
    const type =
      intent === "render"
        ? "locked_view"
        : revealed
          ? "revealed"
          : result.allowed
            ? "unlocked"
            : "denied";
    const key = viewerKey(viewer, gate.ownerUserId);
    const dedupe = `access:ev:${resource.type}:${resource.id}:${key}:${type}`;
    const redis = getRedisClient();
    if (redis) {
      try {
        const first = await redis.set(dedupe, "1", "EX", EVENT_DEDUPE_SECONDS, "NX");
        if (first === null) return;
      } catch {
        // record without dedupe
      }
    }
    await prisma.accessEvent.create({
      data: {
        id: uuidv7(),
        ruleId: gate.ruleId,
        ownerUserId: gate.ownerUserId,
        resource: `${resource.type}:${resource.id}`.slice(0, 80),
        viewerKey: key,
        type,
        reason: result.reason,
      },
    });
  } catch (err) {
    console.warn("[access] event not recorded", { message: String(err) });
  }
}

// ── Public API (spec 3.7) ────────────────────────────────────────
async function decide(
  viewer: Viewer,
  resource: AccessResource,
  gate: Gate | null,
  intent: Intent,
  fresh: boolean
): Promise<AccessDecision> {
  if (!gate) return refuse("not_found", { action: "none" });

  // Owner always passes, including drafts (preview)
  if (viewer.userId !== null && viewer.userId === gate.ownerUserId) return allow("owner");
  if (!gate.available) return refuse("not_found", { action: "none" });

  const owner = await loadOwner(gate.ownerUserId);
  if (!owner || owner.block !== "no" || owner.page_status !== "PUBLISHED") {
    return refuse("not_found", { action: "none" });
  }

  if (viewer.userId !== null) {
    const [self, followBlock] = await Promise.all([
      prisma.user.findUnique({ where: { id: viewer.userId }, select: { block: true } }),
      prisma.followBlock.findUnique({
        where: { creator_id_user_id: { creator_id: owner.id, user_id: viewer.userId } },
        select: { user_id: true },
      }),
    ]);
    if (!self || self.block !== "no") return refuse("not_found", { action: "none" });
    if (followBlock) return refuse("blocked", { action: "none" });
  }

  if (gate.adult) {
    const age = ageDecision(
      viewer.userId === null ? "signed_out" : await checkIdentity(viewer.userId, "age_over_18")
    );
    if (age) return age;
  }

  if (!gate.ruleId) return allow("public");
  const rule = await loadRule(idToHex(gate.ruleId), { fresh });
  // A missing or invalid rule refuses (default deny)
  if (!rule || rule === "invalid" || rule.ownerUserId !== owner.id) {
    return refuse("kind_unavailable", { action: "unavailable" });
  }
  if (rule.opensToAllAt && rule.opensToAllAt <= new Date()) return allow("public", rule);

  // Only follower decisions are cached: follow, unfollow and block bump the
  // viewer. Stake decisions read the mirror or the chain every time.
  const cacheKey =
    intent === "render" && !fresh && viewer.userId !== null && rule.kind === "follower"
      ? `access:d:${viewer.userId}:${await viewerVersion(viewer.userId)}:${resource.type}:${resource.id}:${rule.id}:${rule.version}`
      : null;
  if (cacheKey) {
    const hit = await cachedDecision(cacheKey);
    if (hit) return hit;
  }
  const result = await evaluateRule(rule, owner, viewer, intent, fresh);
  if (cacheKey) await storeDecision(cacheKey, result);
  return result;
}

/** May this viewer open this resource right now. Never throws; an error refuses. */
export async function check(
  viewer: Viewer,
  resource: AccessResource,
  opts: CheckOptions = {}
): Promise<AccessDecision> {
  const intent = opts.intent ?? "render";
  const fresh = opts.fresh ?? intent === "open";
  let gate: Gate | null = null;
  let result: AccessDecision;
  try {
    const resolver = resolvers.get(resource.type);
    gate = resolver ? await resolver.get(resource.id) : null;
    result = await decide(viewer, resource, gate, intent, fresh);
  } catch (err) {
    console.error("[access] check failed", {
      resource: `${resource.type}:${resource.id}`,
      message: err instanceof Error ? err.message : String(err),
    });
    result = refuse("kind_unavailable", { action: "unavailable" });
  }
  if (gate && result.reason !== "owner") {
    void recordEvent(resource, gate, viewer, result, intent, false);
  }
  return result;
}

export async function checkBatch(
  viewer: Viewer,
  resources: AccessResource[],
  opts: CheckOptions = {}
): Promise<Map<string, AccessDecision>> {
  const unique = Array.from(new Map(resources.map(r => [`${r.type}:${r.id}`, r])).values());
  const results = await Promise.all(unique.map(r => check(viewer, r, opts)));
  return new Map(unique.map((r, i) => [`${r.type}:${r.id}`, results[i]!]));
}

/**
 * Checks fresh with intent open and runs reveal only on a pass (spec 3.7). The
 * reveal is the feature's own: sign a media token, return a URL, return text.
 */
export async function open<T>(
  viewer: Viewer,
  resource: AccessResource,
  reveal: (decision: AccessDecision) => Promise<T>
): Promise<{ decision: AccessDecision; value?: T }> {
  const resolver = resolvers.get(resource.type);
  let gate: Gate | null = null;
  let result: AccessDecision;
  try {
    gate = resolver ? await resolver.get(resource.id) : null;
    result = await decide(viewer, resource, gate, "open", true);
  } catch (err) {
    console.error("[access] open failed", {
      message: err instanceof Error ? err.message : String(err),
    });
    result = refuse("kind_unavailable", { action: "unavailable" });
  }
  if (!result.allowed) {
    if (gate) void recordEvent(resource, gate, viewer, result, "open", false);
    return { decision: result };
  }
  const value = await reveal(result);
  if (gate && result.reason !== "owner")
    void recordEvent(resource, gate, viewer, result, "open", true);
  return { decision: result, value };
}

/**
 * Users who pass a leaf rule for the owner, a page at a time, for broadcast
 * audiences and the Telegram group sweep (G2). Reads the mirror and Follow
 * tables; it never grants. Combinators are not supported here yet.
 */
export async function eligibleUserIds(
  rule: { kind: AccessRuleKind; params: Record<string, unknown> },
  ownerUserId: number,
  page: { cursor?: number | null; limit?: number } = {}
): Promise<{ userIds: number[]; nextCursor: number | null }> {
  const limit = Math.min(Math.max(page.limit ?? 500, 1), 1000);
  const after = page.cursor ?? 0;
  let userIds: number[] = [];
  if (rule.kind === "follower") {
    const rows = await prisma.follow.findMany({
      where: {
        creator_id: ownerUserId,
        follower_id: { gt: after },
        follower: { block: "no", AND: [trustedEmailWhere()] },
      },
      orderBy: { follower_id: "asc" },
      take: limit,
      select: { follower_id: true },
    });
    userIds = rows.map(row => row.follower_id);
  } else if ((STAKE_ACCESS_RULE_KINDS as readonly string[]).includes(rule.kind)) {
    const poolId = rule.params.poolId as number;
    const pool = await loadPool(poolId);
    if (!pool || pool.ownerUserId !== ownerUserId) return { userIds: [], nextCursor: null };
    const minWei = rule.kind === "stake_min" ? BigInt(rule.params.minWei as string) : 1n;
    const rows = await prisma.stakedPool.findMany({
      where: { poolId, userWallet: { userId: { gt: after }, user: { block: "no" } } },
      orderBy: { userWallet: { userId: "asc" } },
      take: limit,
      select: { stakeAmount: true, userWallet: { select: { userId: true } } },
    });
    userIds = rows
      .filter(row => /^\d+$/.test(row.stakeAmount) && BigInt(row.stakeAmount) >= minWei)
      .map(row => row.userWallet.userId);
    const last = rows.at(-1)?.userWallet.userId ?? null;
    return { userIds, nextCursor: rows.length === limit ? last : null };
  } else {
    throw new Error(`eligibleUserIds does not support ${rule.kind}`);
  }
  return { userIds, nextCursor: userIds.length === limit ? userIds.at(-1)! : null };
}

export { hexToId, idToHex };
