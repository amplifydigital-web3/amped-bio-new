import { prisma, type Message, type MessageThread, type ThreadStatus } from "@repo/database";
import { FAN_RELATION_LABELS } from "@repo/constants";
import { getFileUrl } from "../../utils/fileUrlResolver";
import { idToHex, hexToId } from "../analytics/ids";
import { decryptTelegramField } from "../telegram/secret";
import { creatorPoolIds, followerIds, paidMemberIds, stakerIds } from "../telegram/rules";

/**
 * Messaging on Telegram (Build Board #2), phase 1. What each side of a conversation
 * sees (spec 3.4 and 3.8):
 *
 * - The creator sees the fan's Amped handle, name, photo and relation chip. The fan's
 *   Telegram username appears only when the fan turned shareUsername on.
 * - The fan sees the creator's Amped handle, name and photo. Never the creator's
 *   Telegram username.
 * - No view carries a Telegram id or a Telegram message id.
 */

export type FanRelation = keyof typeof FAN_RELATION_LABELS;

type PersonRow = {
  id: number;
  name: string;
  handle: string | null;
  image: string | null;
  image_file_id: number | null;
};

const personSelect = {
  id: true,
  name: true,
  handle: true,
  image: true,
  image_file_id: true,
} as const;

async function avatarOf(person: PersonRow): Promise<string | null> {
  try {
    return await getFileUrl({ legacyImageField: person.image, imageFileId: person.image_file_id });
  } catch {
    return null;
  }
}

/** The label a creator sees for a fan: @handle, else the name. */
export function personLabel(person: { handle: string | null; name: string }) {
  return person.handle ? `@${person.handle}` : person.name;
}

/** Relation chips for a batch of fans: member beats pool fan beats follower. */
export async function fanRelations(
  creatorUserId: number,
  fanIds: number[]
): Promise<Map<number, FanRelation>> {
  const result = new Map<number, FanRelation>();
  if (fanIds.length === 0) return result;
  const poolIds = await creatorPoolIds(creatorUserId);
  const [followers, stakers, paid] = await Promise.all([
    followerIds(creatorUserId, fanIds),
    stakerIds(poolIds, fanIds),
    paidMemberIds(creatorUserId, fanIds),
  ]);
  for (const id of fanIds) {
    if (paid.has(id)) result.set(id, "member");
    else if (stakers.has(id)) result.set(id, "poolFan");
    else if (followers.has(id)) result.set(id, "follower");
  }
  return result;
}

/** Telegram usernames of fans who chose to share them. Everyone else is absent. */
export async function sharedTelegramUsernames(fanIds: number[]): Promise<Map<number, string>> {
  const result = new Map<number, string>();
  if (fanIds.length === 0) return result;
  const accounts = await prisma.telegramAccount.findMany({
    where: { userId: { in: fanIds }, shareUsername: true },
    select: { userId: true, username: true },
  });
  for (const account of accounts) {
    const username = decryptTelegramField(account.username);
    if (username) result.set(account.userId, username);
  }
  return result;
}

export type FanView = {
  userId: number;
  name: string;
  handle: string | null;
  avatarUrl: string | null;
  relation: FanRelation | null;
  relationLabel: string | null;
  telegramUsername: string | null;
};

export async function fanViews(creatorUserId: number, fanIds: number[]) {
  const ids = Array.from(new Set(fanIds));
  const [people, relations, usernames] = await Promise.all([
    prisma.user.findMany({ where: { id: { in: ids } }, select: personSelect }),
    fanRelations(creatorUserId, ids),
    sharedTelegramUsernames(ids),
  ]);
  const views = new Map<number, FanView>();
  await Promise.all(
    people.map(async person => {
      const relation = relations.get(person.id) ?? null;
      views.set(person.id, {
        userId: person.id,
        name: person.name,
        handle: person.handle,
        avatarUrl: await avatarOf(person),
        relation,
        relationLabel: relation ? FAN_RELATION_LABELS[relation] : null,
        telegramUsername: usernames.get(person.id) ?? null,
      });
    })
  );
  return views;
}

export type CreatorView = {
  userId: number;
  name: string;
  handle: string | null;
  avatarUrl: string | null;
};

export async function creatorViews(creatorIds: number[]) {
  const people = await prisma.user.findMany({
    where: { id: { in: Array.from(new Set(creatorIds)) } },
    select: personSelect,
  });
  const views = new Map<number, CreatorView>();
  await Promise.all(
    people.map(async person => {
      views.set(person.id, {
        userId: person.id,
        name: person.name,
        handle: person.handle,
        avatarUrl: await avatarOf(person),
      });
    })
  );
  return views;
}

const PREVIEW_CHARS = 140;

async function lastMessages(threadIds: Uint8Array[]) {
  const rows = await Promise.all(
    threadIds.map(threadId =>
      prisma.message.findFirst({
        where: { threadId },
        orderBy: { createdAt: "desc" },
        select: { threadId: true, sender: true, body: true, createdAt: true },
      })
    )
  );
  const byThread = new Map<string, NonNullable<(typeof rows)[number]>>();
  for (const row of rows) if (row) byThread.set(idToHex(row.threadId), row);
  return byThread;
}

function preview(row: { sender: string; body: string } | undefined) {
  if (!row) return null;
  const text = row.body.replace(/\s+/g, " ").trim();
  return {
    sender: row.sender as "FAN" | "CREATOR",
    text: text.length > PREVIEW_CHARS ? `${text.slice(0, PREVIEW_CHARS - 3)}...` : text,
  };
}

export type ThreadFilter = "all" | "unread" | "blocked";
const PAGE = 30;

function pageArgs(cursor?: string | null) {
  return cursor ? { cursor: { id: hexToId(cursor) }, skip: 1 } : {};
}

function threadBase(thread: MessageThread, side: "creator" | "fan", now: Date) {
  return {
    id: idToHex(thread.id),
    status: thread.status as ThreadStatus,
    lastMessageAt: thread.lastMessageAt,
    unread: side === "creator" ? thread.creatorUnread : thread.fanUnread,
    muted: side === "creator" && !!thread.mutedUntil && thread.mutedUntil > now,
    createdAt: thread.createdAt,
  };
}

/** The creator's inbox, newest conversation first (tg2, row 113). */
export async function listCreatorThreads(
  creatorUserId: number,
  opts: { filter?: ThreadFilter; cursor?: string | null; limit?: number },
  now = new Date()
) {
  const limit = Math.min(opts.limit ?? PAGE, 50);
  const where = {
    creatorUserId,
    lastMessageAt: { not: null },
    ...(opts.filter === "unread" ? { creatorUnread: { gt: 0 } } : {}),
    ...(opts.filter === "blocked" ? { status: "BLOCKED_BY_CREATOR" as const } : {}),
  };
  const rows = await prisma.messageThread.findMany({
    where,
    orderBy: [{ lastMessageAt: "desc" }, { id: "desc" }],
    take: limit + 1,
    ...pageArgs(opts.cursor),
  });
  const page = rows.slice(0, limit);
  const [fans, last] = await Promise.all([
    fanViews(
      creatorUserId,
      page.map(row => row.fanUserId)
    ),
    lastMessages(page.map(row => row.id)),
  ]);
  return {
    items: page.map(row => ({
      ...threadBase(row, "creator", now),
      fan: fans.get(row.fanUserId) ?? null,
      preview: preview(last.get(idToHex(row.id))),
    })),
    nextCursor: rows.length > limit ? idToHex(page[page.length - 1]!.id) : null,
  };
}

/** The fan's conversations, newest first. */
export async function listFanThreads(
  fanUserId: number,
  opts: { cursor?: string | null; limit?: number },
  now = new Date()
) {
  const limit = Math.min(opts.limit ?? PAGE, 50);
  const rows = await prisma.messageThread.findMany({
    where: { fanUserId, lastMessageAt: { not: null } },
    orderBy: [{ lastMessageAt: "desc" }, { id: "desc" }],
    take: limit + 1,
    ...pageArgs(opts.cursor),
  });
  const page = rows.slice(0, limit);
  const [creators, last] = await Promise.all([
    creatorViews(page.map(row => row.creatorUserId)),
    lastMessages(page.map(row => row.id)),
  ]);
  return {
    items: page.map(row => ({
      ...threadBase(row, "fan", now),
      creator: creators.get(row.creatorUserId) ?? null,
      preview: preview(last.get(idToHex(row.id))),
    })),
    nextCursor: rows.length > limit ? idToHex(page[page.length - 1]!.id) : null,
  };
}

/** One message as either side sees it. No Telegram ids. */
export function messageView(message: Message) {
  return {
    id: idToHex(message.id),
    sender: message.sender,
    channel: message.channel,
    body: message.body,
    createdAt: message.createdAt,
    deliveredToTelegram: message.deliveredAt !== null,
    failedReason: message.failedReason,
  };
}

/** The newest TELEGRAM_LIMITS.threadPageSize messages before `before`, oldest first. */
export async function threadMessages(threadId: Uint8Array, before?: string | null, limit = 50) {
  const rows = await prisma.message.findMany({
    where: { threadId },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: limit + 1,
    ...(before ? { cursor: { id: hexToId(before) }, skip: 1 } : {}),
  });
  const newestFirst = rows.slice(0, limit);
  const oldestFirst = [...newestFirst].reverse();
  return {
    messages: oldestFirst.map(messageView),
    // The oldest message on this page, to load the page before it
    olderCursor: rows.length > limit ? idToHex(oldestFirst[0]!.id) : null,
  };
}

/** Badge count for the Inbox, Messages tab. */
export async function unreadTotals(userId: number) {
  const [asCreator, asFan] = await Promise.all([
    prisma.messageThread.aggregate({
      where: { creatorUserId: userId },
      _sum: { creatorUnread: true },
    }),
    prisma.messageThread.aggregate({ where: { fanUserId: userId }, _sum: { fanUnread: true } }),
  ]);
  return {
    asCreator: asCreator._sum.creatorUnread ?? 0,
    asFan: asFan._sum.fanUnread ?? 0,
  };
}
