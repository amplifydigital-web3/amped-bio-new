import crypto from "node:crypto";
import { prisma } from "@repo/database";
import { MESSAGE_LIMITS, graceDay } from "@repo/constants";
import { env } from "../../env";
import { idToHex } from "../analytics/ids";
import { personOut, type Person } from "../messaging/direct";

/**
 * The bell (Build Board #2 r4, PR M4, spec 7.4 item 1). One row per thing to see;
 * repeats collapse into the unseen row for the same groupKey. Opening a conversation
 * marks its rows seen (markRead in services/messaging/direct.ts).
 */

export type BellItem = {
  id: string;
  kind:
    | "MESSAGE"
    | "REQUEST"
    | "BROADCAST"
    | "MEMBERSHIP_RENEWAL"
    | "PROMOTER_CODE"
    | "CONTENT";
  count: number;
  seen: boolean;
  /** conversation id (hex) for MESSAGE and REQUEST */
  conversationId: string | null;
  /** broadcast id for BROADCAST */
  broadcastId: number | null;
  /** MEMBERSHIP_RENEWAL (MB-1, CK-D3): the charge, for Add USDC prefilled, and the grace day */
  renewal: { need: string; graceDay: number | null } | null;
  actor: Person | null;
  /**
   * CONTENT (Fan Library, FL-6): the newest item's title, or null when it is no
   * longer listed. Never an 18+ title.
   */
  content: { publicId: string; title: string | null } | null;
  at: Date;
};

export async function listBell(
  userId: number,
  limit = MESSAGE_LIMITS.bellItems
): Promise<BellItem[]> {
  const rows = await prisma.notification.findMany({
    where: { userId },
    orderBy: [{ updatedAt: "desc" }],
    take: Math.min(limit, MESSAGE_LIMITS.bellItems),
  });
  const actorIds = [...new Set(rows.map(r => r.actorId).filter((id): id is number => id !== null))];
  const actors = actorIds.length
    ? await prisma.user.findMany({
        where: { id: { in: actorIds } },
        select: { id: true, name: true, handle: true, image: true, image_file_id: true },
      })
    : [];
  const byId = new Map(
    (await Promise.all(actors.map(a => personOut(a)))).map(person => [person.id, person])
  );
  const contentIds = rows
    .filter(row => row.kind === "CONTENT" && row.refId)
    .map(row => Buffer.from(row.refId!));
  const items = contentIds.length
    ? await prisma.contentItem.findMany({
        where: { id: { in: contentIds } },
        select: {
          id: true,
          publicId: true,
          title: true,
          adult: true,
          deletedAt: true,
          publishState: true,
        },
      })
    : [];
  const contentOut = contentOutFor(new Map(items.map(item => [idToHex(item.id), item])));
  // Renewal rows carry the charge so Add USDC opens prefilled with it
  const renewalIds = rows
    .filter(r => r.kind === "MEMBERSHIP_RENEWAL" && r.refId)
    .map(r => Buffer.from(r.refId!));
  const renewals = renewalIds.length
    ? await prisma.membership.findMany({
        where: { id: { in: renewalIds } },
        select: { id: true, pricePerPeriod: true, status: true, pastDueSince: true },
      })
    : [];
  const renewalById = new Map(renewals.map(m => [idToHex(m.id), m]));
  return rows.map(row => {
    const renewal =
      row.kind === "MEMBERSHIP_RENEWAL" && row.refId
        ? renewalById.get(idToHex(row.refId))
        : undefined;
    const broadcast = row.groupKey.startsWith("broadcast:")
      ? Number(row.groupKey.slice("broadcast:".length))
      : null;
    return {
      id: idToHex(row.id),
      kind: row.kind,
      count: row.count,
      seen: !!row.seenAt,
      conversationId:
        (row.kind === "MESSAGE" || row.kind === "REQUEST") && row.refId ? idToHex(row.refId) : null,
      broadcastId: Number.isInteger(broadcast) ? broadcast : null,
      renewal: renewal
        ? {
            need: renewal.pricePerPeriod.toString(),
            graceDay:
              renewal.status === "past_due" && renewal.pastDueSince
                ? graceDay(renewal.pastDueSince, new Date())
                : null,
          }
        : null,
      actor: row.actorId !== null ? (byId.get(row.actorId) ?? null) : null,
      content: row.kind === "CONTENT" ? contentOut(row.refId) : null,
      at: row.updatedAt,
    };
  });
}

/** The newest item of a CONTENT row: a title only while it is listed and not 18+. */
function contentOutFor(
  itemById: Map<
    string,
    {
      publicId: string;
      title: string;
      adult: boolean;
      deletedAt: Date | null;
      publishState: string;
    }
  >
) {
  return (refId: Uint8Array | null) => {
    const item = refId ? itemById.get(idToHex(refId)) : undefined;
    if (!item) return null;
    const listed = !item.adult && item.deletedAt === null && item.publishState === "PUBLISHED";
    return { publicId: item.publicId, title: listed ? item.title : null };
  };
}

export async function unseenCount(userId: number): Promise<number> {
  const n = await prisma.notification.count({ where: { userId, seenAt: null } });
  return Math.min(n, MESSAGE_LIMITS.badgeMax + 1);
}

/** Mark the given rows seen, or every unseen row when no ids are given (opening the bell). */
export async function markSeen(userId: number, ids?: Uint8Array[], now = new Date()) {
  await prisma.notification.updateMany({
    where: { userId, seenAt: null, ...(ids?.length ? { id: { in: ids as Buffer[] } } : {}) },
    data: { seenAt: now },
  });
}

// ------------------------------------------------------------------ preferences

const GLOBAL = 0;

export async function messageNotificationPrefs(userId: number) {
  const row = await prisma.notificationPreference.findUnique({
    where: { userId_creatorUserId: { userId, creatorUserId: GLOBAL } },
    select: { pushEnabled: true, messageEmailEnabled: true },
  });
  return { push: row?.pushEnabled ?? true, email: row?.messageEmailEnabled ?? true };
}

export async function setMessageNotificationPrefs(
  userId: number,
  input: { push?: boolean; email?: boolean }
) {
  const data = {
    ...(input.push !== undefined ? { pushEnabled: input.push } : {}),
    ...(input.email !== undefined ? { messageEmailEnabled: input.email } : {}),
  };
  await prisma.notificationPreference.upsert({
    where: { userId_creatorUserId: { userId, creatorUserId: GLOBAL } },
    create: { userId, creatorUserId: GLOBAL, ...data },
    update: data,
  });
  return messageNotificationPrefs(userId);
}

// ------------------------------------------------------------------ email off link

function sign(payload: string) {
  return crypto
    .createHmac("sha256", env.BETTER_AUTH_SECRET)
    .update(`message-email-off:${payload}`)
    .digest("base64url");
}

/** A link token that turns message emails off for one account. It never expires. */
export function emailOffToken(userId: number): string {
  const payload = String(userId);
  return `${payload}.${sign(payload)}`;
}

export function readEmailOffToken(token: string): number | null {
  const [payload, signature] = token.split(".");
  if (!payload || !signature || !/^\d+$/.test(payload)) return null;
  const expected = Buffer.from(sign(payload));
  const given = Buffer.from(signature);
  if (expected.length !== given.length || !crypto.timingSafeEqual(expected, given)) return null;
  return Number(payload);
}

/** https://API_HOST/email/messages-off?t=... (http on localhost, like the Telegram callback). */
export function emailOffUrl(userId: number): string {
  const host = env.API_HOST.replace(/^https?:\/\//, "").replace(/\/+$/, "");
  const local = /^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/.test(host);
  const url = new URL(`${local ? "http" : "https"}://${host}/email/messages-off`);
  url.searchParams.set("t", emailOffToken(userId));
  return url.toString();
}
