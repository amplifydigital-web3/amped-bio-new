/**
 * Who may see an item in the Fan Library (Build Board #26, spec 3.4).
 *
 * The Library lists only what the fan can open now, and names how. Listing
 * and opening agree: a public item opens through getReadUrl's public rule
 * (services/content/access.ts), and a gated item opens through the gating
 * engine, which this file asks (FL-6). Nothing listed refuses to play.
 *
 * While the accessGating flag is off, only public items are listed, as in
 * FL-2. When it is on, gated items are decided by the engine's checkBatch
 * with intent render; an item the fan passes is listed with the source that
 * opened it (pool or follower), and an item the fan can unlock with a clear
 * next step goes to the creator's Shop (spec 3.4) with that step as its hint.
 */
import type { ContentItem, Prisma } from "@repo/database";
import { prisma } from "@repo/database";
import {
  STAKE_ACCESS_RULE_KINDS,
  pickAccessSource,
  type AccessDecision,
  type LibraryAccessSource,
  type LibraryUnlockHint,
} from "@repo/constants";
import {
  LISTED_ITEM_WHERE,
  PUBLIC_CREATOR_WHERE,
  PUBLIC_ITEM_WHERE,
  isListedItem,
  isPublicItem,
} from "../content/access";
import { checkBatch } from "../access/engine";
import type { Viewer } from "../access/types";
import { isFeatureOn } from "../featureFlags";
import { batchPoolFanCreatorIds } from "../follow/poolFans";

export interface LibraryAccess {
  source: LibraryAccessSource;
  planName: string | null;
}

/** What the Library does with one item: list it, offer it in the Shop, or leave it out. */
export type LibraryDecision = { open: LibraryAccess } | { locked: LibraryUnlockHint } | null;

export type AccessItem = Pick<
  ContentItem,
  | "publicId"
  | "userId"
  | "status"
  | "publishState"
  | "moderationState"
  | "accessRuleId"
  | "adult"
  | "deletedAt"
>;
type AccessCreator = { page_status: string; block: string } | null;

/** A signed in Library viewer, built from the session (never client input). */
export type LibraryViewer = Viewer & { userId: number };

/**
 * The public part of the rule, without asking the engine. A creator's own
 * items are not in their fan Library: they manage them in Content.
 */
export function libraryAccess(
  item: Omit<AccessItem, "publicId">,
  creator: AccessCreator,
  viewerId: number
): LibraryAccess | null {
  if (item.userId === viewerId) return null;
  const sources: LibraryAccessSource[] = [];
  if (isPublicItem(item, creator)) sources.push("public");
  const source = pickAccessSource(sources);
  return source ? { source, planName: null } : null;
}

/** True when the Library asks the engine about gated items. */
export function libraryGating(): boolean {
  return isFeatureOn("accessGating");
}

/** The database side of the listing rule, so lists page over listable items only. */
export function libraryItemWhere(): Prisma.ContentItemWhereInput {
  return libraryGating() ? LISTED_ITEM_WHERE : PUBLIC_ITEM_WHERE;
}

export const LIBRARY_CREATOR_WHERE = PUBLIC_CREATOR_WHERE;

const STAKE_KINDS = STAKE_ACCESS_RULE_KINDS as readonly string[];
const hex = (id: Uint8Array) => Buffer.from(id).toString("hex");

/**
 * The step that unlocks a refused item, when the fan can take it from the
 * Library. Refusals with no step (unavailable kinds, a blocked fan, the 18+
 * check, a missing item) are left out of the Shop entirely.
 */
export function shopHint(decision: AccessDecision): LibraryUnlockHint | null {
  switch (decision.reason) {
    case "not_pool_member":
    case "stake_below_min":
    case "no_wallet":
      return { kind: "pool" };
    case "not_follower":
      return decision.hint.action === "follow" ? { kind: "follow" } : null;
    case "follow_pending":
      return { kind: "confirm_email" };
    default:
      return null;
  }
}

/** The leaf kinds of the combinators among these items' rules, keyed by rule id hex. */
async function combinatorLeafKinds(ruleIds: string[]): Promise<Map<string, string[]>> {
  const out = new Map<string, string[]>();
  if (!ruleIds.length) return out;
  const rules = await prisma.accessRule.findMany({
    where: { id: { in: ruleIds.map(id => Buffer.from(id, "hex")) } },
    select: { id: true, params: true },
  });
  const leafIds = new Map<string, string[]>();
  for (const rule of rules) {
    const ids = ((rule.params as { ruleIds?: unknown })?.ruleIds ?? []) as unknown[];
    leafIds.set(
      hex(rule.id),
      ids.filter((id): id is string => typeof id === "string" && /^[0-9a-f]{32}$/.test(id))
    );
  }
  const all = [...new Set([...leafIds.values()].flat())];
  const leaves = all.length
    ? await prisma.accessRule.findMany({
        where: { id: { in: all.map(id => Buffer.from(id, "hex")) } },
        select: { id: true, kind: true },
      })
    : [];
  const kindOf = new Map(leaves.map(leaf => [hex(leaf.id), leaf.kind]));
  for (const [ruleId, ids] of leafIds) {
    out.set(
      ruleId,
      ids.map(id => kindOf.get(id)).filter((kind): kind is string => !!kind)
    );
  }
  return out;
}

/**
 * The source an allowed decision opened the item through (spec 2.1, decision
 * 12). A leaf rule names it. For any and all, the engine says only that the fan
 * passed, so the sources are the leaves the fan holds: a stake in the creator's
 * pool, or a follow (a follower leaf passes only for an active follow).
 */
function sourceOf(
  decision: AccessDecision,
  leafKinds: string[] | undefined,
  poolFan: boolean
): LibraryAccessSource {
  const kind = decision.rule?.kind;
  if (!kind || decision.reason === "public") return "public";
  if (STAKE_KINDS.includes(kind)) return "pool";
  if (kind === "follower") return "follower";
  const leaves = leafKinds ?? [];
  const sources: LibraryAccessSource[] = [];
  if (poolFan && leaves.some(leaf => STAKE_KINDS.includes(leaf))) sources.push("pool");
  if (leaves.includes("follower")) sources.push("follower");
  return pickAccessSource(sources) ?? "follower";
}

/**
 * Decides a page of rows in one engine batch, keyed by publicId. Public items
 * never reach the engine. Library renders are not counted as locked views on
 * the creator's page (record: false): a locked view event is a page visit.
 */
export async function libraryDecisions(
  viewer: LibraryViewer,
  rows: Array<AccessItem & { user: AccessCreator }>
): Promise<Map<string, LibraryDecision>> {
  const out = new Map<string, LibraryDecision>();
  const gated: Array<AccessItem & { user: AccessCreator }> = [];
  const gating = libraryGating();
  for (const row of rows) {
    if (row.userId === viewer.userId) {
      out.set(row.publicId, null);
      continue;
    }
    const open = libraryAccess(row, row.user, viewer.userId);
    if (open) {
      out.set(row.publicId, { open });
    } else if (gating && row.accessRuleId && isListedItem(row, row.user)) {
      gated.push(row);
    } else {
      out.set(row.publicId, null);
    }
  }
  if (!gated.length) return out;

  const decisions = await checkBatch(
    viewer,
    gated.map(row => ({ type: "content" as const, id: row.publicId })),
    { intent: "render", record: false }
  );
  const combinators = [
    ...new Set(
      gated
        .filter(row => {
          const kind = decisions.get(`content:${row.publicId}`)?.rule?.kind;
          return kind === "any" || kind === "all";
        })
        .map(row => hex(row.accessRuleId!))
    ),
  ];
  const [leafKinds, poolFans] = await Promise.all([
    combinatorLeafKinds(combinators),
    combinators.length
      ? batchPoolFanCreatorIds([...new Set(gated.map(row => row.userId))], viewer.userId)
      : Promise.resolve(new Set<number>()),
  ]);
  for (const row of gated) {
    const decision = decisions.get(`content:${row.publicId}`);
    if (!decision) {
      out.set(row.publicId, null);
    } else if (decision.allowed) {
      const source = sourceOf(
        decision,
        leafKinds.get(hex(row.accessRuleId!)),
        poolFans.has(row.userId)
      );
      out.set(row.publicId, { open: { source, planName: null } });
    } else {
      const hint = shopHint(decision);
      out.set(row.publicId, hint ? { locked: hint } : null);
    }
  }
  return out;
}

/** One item, for save and the item menu: the open decision, or null. */
export async function libraryOpenAccess(
  viewer: LibraryViewer,
  row: AccessItem & { user: AccessCreator }
): Promise<LibraryAccess | null> {
  const decision = (await libraryDecisions(viewer, [row])).get(row.publicId);
  return decision && "open" in decision ? decision.open : null;
}
