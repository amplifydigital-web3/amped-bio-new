import { Prisma, prisma, type MemberState } from "@repo/database";
import { encryptMessageBody } from "../crypto/messageBody";

/**
 * Amped Messages (Build Board #2, revision 4), PR M1. Spec docs/features/messaging.md
 * section 6: the symmetric conversation model, the copy from the Telegram era thread
 * tables, and account deletion (msg-account-deletion).
 *
 * Nothing in the request path reads these tables until PR M2.
 */

/** One DIRECT conversation per pair of accounts: "{low id}:{high id}". */
export function conversationPairKey(a: number, b: number): string {
  if (!Number.isInteger(a) || !Number.isInteger(b) || a <= 0 || b <= 0) {
    throw new Error("conversationPairKey needs two positive user ids");
  }
  if (a === b) throw new Error("conversationPairKey needs two different accounts");
  return a < b ? `${a}:${b}` : `${b}:${a}`;
}

// ---------------------------------------------------------------- thread copy

type ThreadStatus = "OPEN" | "BLOCKED_BY_CREATOR" | "BLOCKED_BY_FAN" | "CLOSED";

export interface LegacyThread {
  id: Uint8Array;
  creatorUserId: number;
  fanUserId: number;
  status: ThreadStatus;
  lastMessageAt: Date | null;
  creatorReadAt: Date | null;
  fanReadAt: Date | null;
  creatorUnread: number;
  fanUnread: number;
  mutedUntil: Date | null;
  createdAt: Date;
}

export interface LegacyMessage {
  id: Uint8Array;
  threadId: Uint8Array;
  sender: "FAN" | "CREATOR";
  body: string;
  idempotencyKey: string | null;
  createdAt: Date;
}

export interface MemberRow {
  userId: number;
  folder: "PRIMARY";
  state: MemberState;
  acceptedAt: Date;
  lastReadAt: Date | null;
  lastReadId: Uint8Array | null;
  unread: number;
  mutedUntil: Date | null;
}

function memberState(status: ThreadStatus, side: "creator" | "fan"): MemberState {
  if (status === "CLOSED") return "LEFT";
  if (status === "BLOCKED_BY_CREATOR" && side === "creator") return "BLOCKED";
  if (status === "BLOCKED_BY_FAN" && side === "fan") return "BLOCKED";
  return "ACTIVE";
}

/** The last message at or before `readAt`, which becomes the member's lastReadId. */
function lastReadIdAt(messages: LegacyMessage[], readAt: Date | null): Uint8Array | null {
  if (!readAt) return null;
  let found: LegacyMessage | null = null;
  for (const m of messages) if (m.createdAt <= readAt) found = m;
  return found?.id ?? null;
}

/**
 * Maps one legacy thread and its messages (oldest first) onto conversation rows.
 * Pure, so the mapping is tested without a database. Both members land in PRIMARY:
 * every legacy thread already passed the creator's rule, so none is a request.
 */
export function mapThread(thread: LegacyThread, messages: LegacyMessage[]) {
  const sorted = [...messages].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  const last = sorted[sorted.length - 1] ?? null;
  const conversation = {
    id: thread.id,
    kind: "DIRECT" as const,
    pairKey: conversationPairKey(thread.creatorUserId, thread.fanUserId),
    // A fan opened every legacy thread
    createdById: thread.fanUserId,
    lastMessageId: last?.id ?? null,
    // The later of the stored time and the newest copied message
    lastMessageAt:
      thread.lastMessageAt && last
        ? thread.lastMessageAt > last.createdAt
          ? thread.lastMessageAt
          : last.createdAt
        : (thread.lastMessageAt ?? last?.createdAt ?? null),
    createdAt: thread.createdAt,
  };
  const members: MemberRow[] = [
    {
      userId: thread.creatorUserId,
      folder: "PRIMARY",
      state: memberState(thread.status, "creator"),
      acceptedAt: thread.createdAt,
      lastReadAt: thread.creatorReadAt,
      lastReadId: lastReadIdAt(sorted, thread.creatorReadAt),
      unread: thread.creatorUnread,
      // The legacy mute was creator only
      mutedUntil: thread.mutedUntil,
    },
    {
      userId: thread.fanUserId,
      folder: "PRIMARY",
      state: memberState(thread.status, "fan"),
      acceptedAt: thread.createdAt,
      lastReadAt: thread.fanReadAt,
      lastReadId: lastReadIdAt(sorted, thread.fanReadAt),
      unread: thread.fanUnread,
      mutedUntil: null,
    },
  ];
  const directMessages = sorted.map(m => ({
    id: m.id,
    senderId: m.sender === "FAN" ? thread.fanUserId : thread.creatorUserId,
    bodyLength: m.body.length,
    body: m.body,
    idempotencyKey: m.idempotencyKey,
    createdAt: m.createdAt,
  }));
  return { conversation, members, directMessages };
}

/** Merges a member's legacy counters into the row of a conversation that already exists. */
export function mergeMember(existing: MemberRow, incoming: MemberRow): MemberRow {
  const later = (a: Date | null, b: Date | null) => (!a ? b : !b ? a : a > b ? a : b);
  const lastReadAt = later(existing.lastReadAt, incoming.lastReadAt);
  return {
    ...existing,
    // A block on either legacy thread keeps the block
    state:
      existing.state === "BLOCKED" || incoming.state === "BLOCKED" ? "BLOCKED" : existing.state,
    lastReadAt,
    lastReadId: lastReadAt === incoming.lastReadAt ? incoming.lastReadId : existing.lastReadId,
    unread: existing.unread + incoming.unread,
    mutedUntil: later(existing.mutedUntil, incoming.mutedUntil),
  };
}

export interface CopyResult {
  threads: number;
  conversationsCreated: number;
  /** Two legacy threads for one pair (each side once a creator) became one conversation */
  threadsMerged: number;
  messagesCopied: number;
  messagesSkipped: number;
}

type Db = typeof prisma;

/**
 * Copies message_threads and messages into the conversation tables. Idempotent: legacy
 * ids are reused, so a second run copies nothing new. Run by hand on staging after the
 * migration (pnpm --filter server messages:copy-threads). Production has no threads.
 * Two legacy threads for the same pair (A created B's thread and B created A's) merge
 * into one conversation, since the new model has one conversation per pair.
 */
export async function copyThreadsToConversations(
  opts: { batchSize?: number; dryRun?: boolean; log?: (line: string) => void } = {},
  db: Db = prisma
): Promise<CopyResult> {
  const batchSize = opts.batchSize ?? 200;
  const log = opts.log ?? (() => {});
  const result: CopyResult = {
    threads: 0,
    conversationsCreated: 0,
    threadsMerged: 0,
    messagesCopied: 0,
    messagesSkipped: 0,
  };
  let cursor: Uint8Array | undefined;

  for (;;) {
    const threads = (await db.messageThread.findMany({
      orderBy: { id: "asc" },
      take: batchSize,
      ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
    })) as unknown as LegacyThread[];
    if (threads.length === 0) break;
    cursor = threads[threads.length - 1].id;

    for (const thread of threads) {
      result.threads += 1;
      const legacy = (await db.message.findMany({
        where: { threadId: thread.id },
        orderBy: { createdAt: "asc" },
        select: {
          id: true,
          threadId: true,
          sender: true,
          body: true,
          idempotencyKey: true,
          createdAt: true,
        },
      })) as unknown as LegacyMessage[];
      const mapped = mapThread(thread, legacy);

      const existing = await db.conversation.findUnique({
        where: { pairKey: mapped.conversation.pairKey },
        include: { members: true },
      });
      const merging = !!existing && !Buffer.from(existing.id).equals(Buffer.from(thread.id));
      const conversationId = existing ? existing.id : mapped.conversation.id;

      const ids = mapped.directMessages.map(m => m.id);
      const present = ids.length
        ? await db.directMessage.findMany({
            where: { id: { in: ids as Buffer[] } },
            select: { id: true },
          })
        : [];
      const presentHex = new Set(present.map(p => Buffer.from(p.id).toString("hex")));
      const toCopy = mapped.directMessages.filter(
        m => !presentHex.has(Buffer.from(m.id).toString("hex"))
      );
      result.messagesSkipped += mapped.directMessages.length - toCopy.length;

      if (opts.dryRun) {
        if (!existing) result.conversationsCreated += 1;
        if (merging) result.threadsMerged += 1;
        result.messagesCopied += toCopy.length;
        continue;
      }

      await db.$transaction(async tx => {
        if (!existing) {
          await tx.conversation.create({
            data: mapped.conversation as Prisma.ConversationUncheckedCreateInput,
          });
          await tx.conversationMember.createMany({
            data: mapped.members.map(m => ({
              ...m,
              conversationId,
            })) as Prisma.ConversationMemberCreateManyInput[],
          });
          result.conversationsCreated += 1;
        } else if (merging) {
          for (const incoming of mapped.members) {
            const current = existing.members.find(m => m.userId === incoming.userId);
            if (!current) continue;
            const merged = mergeMember(current as unknown as MemberRow, incoming);
            await tx.conversationMember.update({
              where: { conversationId_userId: { conversationId, userId: incoming.userId } },
              data: {
                state: merged.state,
                lastReadAt: merged.lastReadAt,
                lastReadId: merged.lastReadId as Buffer | null,
                unread: merged.unread,
                mutedUntil: merged.mutedUntil,
              },
            });
          }
          const lastAt = mapped.conversation.lastMessageAt;
          if (lastAt && (!existing.lastMessageAt || lastAt > existing.lastMessageAt)) {
            await tx.conversation.update({
              where: { id: conversationId },
              data: {
                lastMessageAt: lastAt,
                lastMessageId: mapped.conversation.lastMessageId as Buffer | null,
              },
            });
          }
          result.threadsMerged += 1;
        }
        if (toCopy.length) {
          await tx.directMessage.createMany({
            data: toCopy.map(m => ({
              id: m.id as Buffer,
              conversationId: conversationId as Buffer,
              senderId: m.senderId,
              bodyEnc: encryptMessageBody(m.body),
              bodyLength: m.bodyLength,
              // A merged pair can repeat a key from the other thread; drop it there
              idempotencyKey: merging ? null : m.idempotencyKey,
              createdAt: m.createdAt,
            })),
            skipDuplicates: true,
          });
          result.messagesCopied += toCopy.length;
        }
      });
    }
    log(
      `[messages:copy-threads] ${result.threads} threads read, ${result.messagesCopied} messages copied`
    );
  }
  return result;
}

// ---------------------------------------------------------------- account deletion

export interface AnonymizeResult {
  messagesCleared: number;
  reportsSnapshotted: number;
  membershipsRemoved: number;
  conversationsDeleted: number;
}

/**
 * msg-account-deletion. Run before an account row is deleted (the account deletion
 * sweeper, when it ships, and any admin deletion). The other member keeps the
 * conversation: the departed person's messages read "Message removed" and their name
 * reads "Deleted account". Reported messages keep an encrypted snapshot for admins.
 * conversation_members and direct_messages restrict deletion of the user row, so a
 * deletion that skips this step fails instead of losing or orphaning data.
 */
export async function anonymizeMessagingForUser(userId: number, db: Db = prisma, now = new Date()) {
  return db.$transaction(async tx => {
    const sent = await tx.directMessage.findMany({
      where: { senderId: userId },
      select: { id: true, bodyEnc: true },
    });
    let reportsSnapshotted = 0;
    if (sent.length) {
      const reports = await tx.messageReport.findMany({
        where: { directMessageId: { in: sent.map(m => m.id) }, bodySnapshotEnc: null },
        select: { id: true, directMessageId: true },
      });
      const bodies = new Map(sent.map(m => [Buffer.from(m.id).toString("hex"), m.bodyEnc]));
      for (const r of reports) {
        const body = r.directMessageId
          ? bodies.get(Buffer.from(r.directMessageId).toString("hex"))
          : null;
        if (!body) continue;
        await tx.messageReport.update({ where: { id: r.id }, data: { bodySnapshotEnc: body } });
        reportsSnapshotted += 1;
      }
    }
    const cleared = await tx.directMessage.updateMany({
      where: { senderId: userId },
      data: {
        senderId: null,
        bodyEnc: "",
        bodyLength: 0,
        flaggedTerms: Prisma.DbNull,
        unsentAt: now,
      },
    });

    const memberships = await tx.conversationMember.findMany({
      where: { userId },
      select: { conversationId: true },
    });
    const removed = await tx.conversationMember.deleteMany({ where: { userId } });

    // A conversation left with no members has no one to show it to
    let conversationsDeleted = 0;
    for (const m of memberships) {
      const left = await tx.conversationMember.count({
        where: { conversationId: m.conversationId },
      });
      if (left === 0) {
        await tx.conversation.delete({ where: { id: m.conversationId } });
        conversationsDeleted += 1;
      }
    }
    await tx.notification.updateMany({ where: { actorId: userId }, data: { actorId: null } });

    return {
      messagesCleared: cleared.count,
      reportsSnapshotted,
      membershipsRemoved: removed.count,
      conversationsDeleted,
    } satisfies AnonymizeResult;
  });
}
