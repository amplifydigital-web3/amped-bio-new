/**
 * New content alerts and the daily email (Build Board #26, FL-6, spec 3.4).
 *
 * Bell: on the first publish of a gated item, every account the rule lets in
 * gets one CONTENT row, collapsing into its unseen row for the creator
 * (groupKey content:{creatorUserId}). Public items create no alert. Accounts
 * that turned new content alerts off (for the creator or for everyone), and
 * accounts that blocked the creator in Messages, get nothing.
 *
 * Email: one job per follower who chose Email me updates (Follow.email_updates,
 * the one email consent per creator), at the next daily slot. A later publish
 * the same day finds the pending job and adds nothing, so a fan gets at most
 * one email a day per creator. The job lists only items the fan can open. It
 * sends nothing while the libraryDigest flag is off or the company postal
 * address (BULK_FOOTER_ADDRESS, CAN-SPAM) is empty.
 */
import crypto from "node:crypto";
import { render } from "@react-email/render";
import { prisma, type ContentItem } from "@repo/database";
import { LIBRARY_LIMITS, type AccessRuleKind } from "@repo/constants";
import { env } from "../../env";
import { deliverEmail } from "../../utils/email/transport";
import LibraryDigestTemplate from "../../utils/email/LibraryDigestTemplate";
import { uuidv7 } from "../../utils/uuid-v7";
import { eligibleUserIds } from "../access/engine";
import { idToHex, loadRule, type LoadedRule } from "../access/rules";
import { fromDbKind } from "../content/ids";
import { isFeatureOn } from "../featureFlags";
import { publish } from "../realtime/bus";
import { trustedEmailWhere } from "../../utils/verificationGrace";
import { LIBRARY_CREATOR_WHERE, libraryDecisions, libraryItemWhere } from "./access";

const DAY = 24 * 60 * 60 * 1000;
const GLOBAL = 0;

export const contentGroupKey = (creatorUserId: number) => `content:${creatorUserId}`;
export const digestDedupeKey = (userId: number, creatorUserId: number) =>
  `digest:${userId}:${creatorUserId}`;

type PublishedItem = Pick<
  ContentItem,
  "id" | "publicId" | "userId" | "accessRuleId" | "adult" | "publishedAt"
>;

// ------------------------------------------------------------------ preferences

/** Global new content alerts: on unless turned off. */
export async function newContentEnabled(userId: number, creatorUserId?: number): Promise<boolean> {
  const rows = await prisma.notificationPreference.findMany({
    where: {
      userId,
      creatorUserId: { in: creatorUserId ? [GLOBAL, creatorUserId] : [GLOBAL] },
    },
    select: { newContentEnabled: true },
  });
  return rows.every(row => row.newContentEnabled !== false);
}

export async function setNewContentEnabled(
  userId: number,
  enabled: boolean,
  creatorUserId: number = GLOBAL
) {
  await prisma.notificationPreference.upsert({
    where: { userId_creatorUserId: { userId, creatorUserId } },
    create: { userId, creatorUserId, newContentEnabled: enabled },
    update: { newContentEnabled: enabled },
  });
  return { enabled };
}

// ------------------------------------------------------------------ who gets the alert

/** A leaf rule's audience, a page at a time. Kinds the engine cannot list give none. */
async function leafAudience(
  rule: { kind: AccessRuleKind; params: Record<string, unknown> },
  ownerUserId: number
) {
  const ids = new Set<number>();
  let cursor: number | null = null;
  try {
    do {
      const page = await eligibleUserIds(rule, ownerUserId, {
        cursor,
        limit: LIBRARY_LIMITS.fanOutChunk,
      });
      page.userIds.forEach(id => ids.add(id));
      cursor = page.nextCursor;
    } while (cursor !== null);
  } catch (error) {
    console.warn("[library] audience skipped:", (error as Error).message);
  }
  return ids;
}

/**
 * Everyone the rule lets in, from the follow and stake mirrors: a leaf's
 * audience, any() the union of its leaves, all() the intersection.
 */
export async function ruleAudience(rule: LoadedRule): Promise<Set<number>> {
  if (rule.kind !== "any" && rule.kind !== "all") return leafAudience(rule, rule.ownerUserId);
  const leaves: LoadedRule[] = [];
  for (const id of (rule.params.ruleIds as string[]) ?? []) {
    const leaf = await loadRule(id);
    if (!leaf || leaf === "invalid" || leaf.ownerUserId !== rule.ownerUserId) {
      return new Set();
    }
    leaves.push(leaf);
  }
  const audiences = await Promise.all(leaves.map(leaf => leafAudience(leaf, rule.ownerUserId)));
  if (!audiences.length) return new Set();
  if (rule.kind === "any") return new Set(audiences.flatMap(set => [...set]));
  const [first, ...rest] = audiences;
  return new Set([...first!].filter(id => rest.every(set => set.has(id))));
}

/** Accounts in this chunk that turned new content alerts off, or blocked the creator. */
async function excluded(userIds: number[], creatorUserId: number): Promise<Set<number>> {
  const [prefs, blocks] = await Promise.all([
    prisma.notificationPreference.findMany({
      where: {
        userId: { in: userIds },
        creatorUserId: { in: [GLOBAL, creatorUserId] },
        newContentEnabled: false,
      },
      select: { userId: true },
    }),
    prisma.conversationMember.findMany({
      where: {
        userId: { in: userIds },
        state: "BLOCKED",
        conversation: { members: { some: { userId: creatorUserId } } },
      },
      select: { userId: true },
    }),
  ]);
  return new Set([...prefs, ...blocks].map(row => row.userId));
}

/** One CONTENT row per account, folded into its unseen row for this creator. */
async function writeAlerts(userIds: number[], item: PublishedItem, now: Date) {
  const groupKey = contentGroupKey(item.userId);
  const unseen = await prisma.notification.findMany({
    where: { userId: { in: userIds }, groupKey, seenAt: null },
    select: { id: true, userId: true },
  });
  const folded = new Set(unseen.map(row => row.userId));
  if (unseen.length) {
    await prisma.notification.updateMany({
      where: { id: { in: unseen.map(row => row.id as Buffer) } },
      data: { count: { increment: 1 }, refId: item.id as Buffer, updatedAt: now },
    });
  }
  const fresh = userIds.filter(id => !folded.has(id));
  if (fresh.length) {
    await prisma.notification.createMany({
      data: fresh.map(userId => ({
        id: uuidv7(),
        userId,
        kind: "CONTENT" as const,
        actorId: item.userId,
        refId: item.id as Buffer,
        groupKey,
        createdAt: now,
      })),
    });
  }
  for (const userId of userIds) await publish(userId, { type: "unread.changed" });
}

/**
 * The bell fan out for one gated item. Returns the accounts written. Never
 * throws: an item publishes whether or not its alerts go out.
 */
export async function fanOutNewContent(item: PublishedItem, now = new Date()): Promise<number> {
  try {
    if (!isFeatureOn("fanLibrary") || !isFeatureOn("accessGating")) return 0;
    if (!item.accessRuleId || item.adult) return 0;
    const rule = await loadRule(idToHex(item.accessRuleId), { fresh: true });
    if (!rule || rule === "invalid" || rule.ownerUserId !== item.userId) return 0;
    const audience = [...(await ruleAudience(rule))].filter(id => id !== item.userId);
    let written = 0;
    for (let start = 0; start < audience.length; start += LIBRARY_LIMITS.fanOutChunk) {
      const chunk = audience.slice(start, start + LIBRARY_LIMITS.fanOutChunk);
      const skip = await excluded(chunk, item.userId);
      const recipients = chunk.filter(id => !skip.has(id));
      if (!recipients.length) continue;
      await writeAlerts(recipients, item, now);
      written += recipients.length;
    }
    return written;
  } catch (error) {
    console.error(`[library] new content alerts for ${item.publicId} failed:`, error);
    return 0;
  }
}

// ------------------------------------------------------------------ the daily email

/** The next daily slot at least an hour away, so a burst of publishes lands in one email. */
export function nextDigestAt(now: Date): Date {
  const slot = new Date(
    Date.UTC(
      now.getUTCFullYear(),
      now.getUTCMonth(),
      now.getUTCDate(),
      LIBRARY_LIMITS.digestHourUtc
    )
  );
  while (slot.getTime() - now.getTime() < 60 * 60 * 1000) slot.setTime(slot.getTime() + DAY);
  return slot;
}

type DigestPayload = { type: "library_digest"; creatorUserId: number };

const isUniqueViolation = (error: unknown) => (error as { code?: string } | null)?.code === "P2002";

/**
 * Queues one email job per follower with Email me updates, at the next slot.
 * The pending job's dedupe key keeps it to one per creator per day.
 */
export async function scheduleDigests(item: PublishedItem, now = new Date()): Promise<number> {
  try {
    if (!isFeatureOn("fanLibrary") || !isFeatureOn("libraryDigest") || item.adult) return 0;
    const runAfter = nextDigestAt(now);
    const payload: DigestPayload = { type: "library_digest", creatorUserId: item.userId };
    let queued = 0;
    let cursor = 0;
    for (;;) {
      const rows = await prisma.follow.findMany({
        where: {
          creator_id: item.userId,
          email_updates: true,
          follower_id: { gt: cursor },
          follower: { block: "no", AND: [trustedEmailWhere()] },
        },
        orderBy: { follower_id: "asc" },
        take: LIBRARY_LIMITS.fanOutChunk,
        select: { follower_id: true },
      });
      for (const row of rows) {
        try {
          await prisma.notificationJob.create({
            data: {
              id: uuidv7(),
              channel: "digest",
              userId: row.follower_id,
              payload,
              runAfter,
              dedupeKey: digestDedupeKey(row.follower_id, item.userId),
            },
          });
          queued += 1;
        } catch (error) {
          if (!isUniqueViolation(error)) throw error;
        }
      }
      if (rows.length < LIBRARY_LIMITS.fanOutChunk) break;
      cursor = rows.at(-1)!.follower_id;
    }
    return queued;
  } catch (error) {
    console.error(`[library] daily email scheduling for ${item.publicId} failed:`, error);
    return 0;
  }
}

/** After the first publish of an item: the bell for gated items, the email for both. */
export async function onContentPublished(item: PublishedItem, now = new Date()) {
  const [alerts, emails] = await Promise.all([
    fanOutNewContent(item, now),
    scheduleDigests(item, now),
  ]);
  return { alerts, emails };
}

// ------------------------------------------------------------------ the off link

function sign(payload: string) {
  return crypto
    .createHmac("sha256", env.BETTER_AUTH_SECRET)
    .update(`library-updates-off:${payload}`)
    .digest("base64url");
}

/** A link token that turns Email me updates off for one fan and one creator. */
export function updatesOffToken(userId: number, creatorUserId: number): string {
  const payload = `${userId}-${creatorUserId}`;
  return `${payload}.${sign(payload)}`;
}

export function readUpdatesOffToken(
  token: string
): { userId: number; creatorUserId: number } | null {
  const [payload, signature] = token.split(".");
  if (!payload || !signature || !/^\d+-\d+$/.test(payload)) return null;
  const expected = Buffer.from(sign(payload));
  const given = Buffer.from(signature);
  if (expected.length !== given.length || !crypto.timingSafeEqual(expected, given)) return null;
  const [userId, creatorUserId] = payload.split("-").map(Number) as [number, number];
  return { userId, creatorUserId };
}

export function updatesOffUrl(userId: number, creatorUserId: number): string {
  const host = env.API_HOST.replace(/^https?:\/\//, "").replace(/\/+$/, "");
  const local = /^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/.test(host);
  const url = new URL(`${local ? "http" : "https"}://${host}/email/updates-off`);
  url.searchParams.set("t", updatesOffToken(userId, creatorUserId));
  return url.toString();
}

/** Turns Email me updates off, as the Library status sheet does. */
export async function turnUpdatesOff(userId: number, creatorUserId: number, now = new Date()) {
  await prisma.follow.updateMany({
    where: { follower_id: userId, creator_id: creatorUserId },
    data: { email_updates: false, email_updates_at: now },
  });
}

// ------------------------------------------------------------------ sending

export type DigestOutcome =
  | "sent"
  | "off"
  | "no_address"
  | "no_consent"
  | "no_email"
  | "gone"
  | "empty";

export function isDigestPayload(payload: unknown): payload is DigestPayload {
  return (payload as DigestPayload | null)?.type === "library_digest";
}

/** Runs one daily email job: the creator's items from the last day the fan can open. */
export async function runDigest(
  userId: number,
  payload: DigestPayload,
  now = new Date()
): Promise<DigestOutcome> {
  if (!isFeatureOn("fanLibrary") || !isFeatureOn("libraryDigest")) return "off";
  const postalAddress = env.BULK_FOOTER_ADDRESS.trim();
  if (!postalAddress) return "no_address";
  const creatorUserId = payload.creatorUserId;
  const [follow, user, creator, wallet] = await Promise.all([
    prisma.follow.findUnique({
      where: { follower_id_creator_id: { follower_id: userId, creator_id: creatorUserId } },
      select: { email_updates: true },
    }),
    prisma.user.findUnique({
      where: { id: userId },
      select: { email: true, email_verified: true, block: true },
    }),
    prisma.user.findFirst({
      where: { id: creatorUserId, ...LIBRARY_CREATOR_WHERE },
      select: { handle: true, name: true },
    }),
    prisma.userWallet.findUnique({ where: { userId }, select: { address: true } }),
  ]);
  if (!follow?.email_updates) return "no_consent";
  if (!creator?.handle) return "gone";
  if (!user || user.block !== "no" || !user.email || !user.email_verified) return "no_email";

  const rows = await prisma.contentItem.findMany({
    where: {
      userId: creatorUserId,
      ...libraryItemWhere(),
      adult: false,
      publishedAt: { gt: new Date(now.getTime() - DAY) },
      user: LIBRARY_CREATOR_WHERE,
    },
    include: { user: { select: { page_status: true, block: true } } },
    orderBy: [{ publishedAt: "desc" }, { id: "desc" }],
    take: 50,
  });
  const decisions = await libraryDecisions({ userId, wallet: wallet?.address ?? null }, rows);
  const open = rows.filter(row => {
    const decision = decisions.get(row.publicId);
    return !!decision && "open" in decision;
  });
  if (!open.length) return "empty";

  const handle = creator.handle.toLowerCase();
  const shown = open.slice(0, LIBRARY_LIMITS.digestItemsMax);
  const html = await render(
    LibraryDigestTemplate({
      handle,
      name: creator.name || `@${handle}`,
      items: shown.map(row => ({ title: row.title, kind: fromDbKind(row.kind) })),
      more: open.length - shown.length,
      sectionUrl: new URL(`/library/@${handle}`, env.APP_URL).toString(),
      offUrl: updatesOffUrl(userId, creatorUserId),
      libraryUrl: new URL("/library", env.APP_URL).toString(),
      privacyUrl: new URL("/privacy", env.LANDINGPAGE_URL).toString(),
      postalAddress,
    })
  );
  await deliverEmail({
    to: [user.email],
    subject: open.length > 1 ? `${open.length} new from @${handle}` : `New from @${handle}`,
    html,
  });
  return "sent";
}
