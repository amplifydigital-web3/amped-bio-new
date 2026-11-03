import { prisma } from "@repo/database";
import { idToHex, hexToId } from "../analytics/ids";
import { decryptMessageBody } from "../crypto/messageBody";
import { uuidv7 } from "../../utils/uuid-v7";
import { unreadSummary, directSettings } from "../messaging/direct";
import type { RealtimeSignal } from "./bus";

/**
 * What a stream sends to the app (spec 7.3 item 3). A signal from the bus carries ids;
 * `hydrate` loads what this user may see. Every event has a UUID v7 hex id so the
 * client can resume with lastEventId. A message event's id is the message id.
 */

export type StreamMessage = {
  id: string;
  mine: boolean;
  removed: boolean;
  body: string | null;
  createdAt: Date;
};

export type RealtimeEvent =
  | {
      type: "message.new";
      conversationId: string;
      folder: "PRIMARY" | "REQUESTS";
      message: StreamMessage;
    }
  | { type: "message.unsent"; conversationId: string; messageId: string }
  | { type: "conversation.read"; conversationId: string; messageId: string | null; at: string }
  | { type: "conversation.updated"; conversationId: string; change: string }
  | { type: "typing"; conversationId: string; userId: number; seconds: number }
  | { type: "notification.new"; notificationId: string }
  | { type: "unread.changed"; conversations: number; requests: number }
  /** Too much was missed: refetch the list and the open conversation. */
  | { type: "resync" };

export type IdentifiedEvent = { id: string; event: RealtimeEvent };

/** Typing shows for this long unless refreshed (MESSAGE_LIMITS.typingSeconds). */
export const TYPING_SECONDS = 6;
/** Replay at most this many messages; beyond it the client refetches (spec 7.3 item 4). */
export const REPLAY_MAX = 200;

const freshId = () => idToHex(uuidv7());

async function memberRow(userId: number, conversationId: Buffer) {
  return prisma.conversationMember.findUnique({
    where: { conversationId_userId: { conversationId, userId } },
    select: { folder: true, state: true },
  });
}

function toStreamMessage(
  userId: number,
  m: {
    id: Uint8Array;
    senderId: number | null;
    bodyEnc: string;
    unsentAt: Date | null;
    createdAt: Date;
  }
): StreamMessage {
  return {
    id: idToHex(m.id),
    mine: m.senderId === userId,
    removed: !!m.unsentAt,
    body: m.unsentAt ? null : decryptMessageBody(m.bodyEnc),
    createdAt: m.createdAt,
  };
}

/**
 * Turn a bus signal into the event this user receives, or null when they may not see it
 * (no longer a member, left, or the message is gone). Never throws.
 */
export async function hydrate(
  userId: number,
  signal: RealtimeSignal
): Promise<IdentifiedEvent | null> {
  try {
    switch (signal.type) {
      case "message.new": {
        const conversationId = hexToId(signal.conversationId);
        const [member, message] = await Promise.all([
          memberRow(userId, conversationId),
          prisma.directMessage.findUnique({ where: { id: hexToId(signal.messageId) } }),
        ]);
        if (!member || member.state === "LEFT" || !message) return null;
        if (!Buffer.from(message.conversationId).equals(conversationId)) return null;
        return {
          id: signal.messageId,
          event: {
            type: "message.new",
            conversationId: signal.conversationId,
            folder: member.folder,
            message: toStreamMessage(userId, message),
          },
        };
      }
      case "message.unsent":
      case "conversation.read":
      case "conversation.updated": {
        const member = await memberRow(userId, hexToId(signal.conversationId));
        if (!member) return null;
        return { id: freshId(), event: signal };
      }
      case "typing": {
        if (signal.userId === userId) return null;
        return { id: freshId(), event: { ...signal, seconds: TYPING_SECONDS } };
      }
      case "notification.new":
        return { id: freshId(), event: signal };
      case "unread.changed": {
        const totals = await unreadSummary(userId);
        return { id: freshId(), event: { type: "unread.changed", ...totals } };
      }
      default:
        return null;
    }
  } catch (error) {
    console.warn("[realtime] hydrate failed:", (error as Error).message);
    return null;
  }
}

/** Milliseconds encoded in a UUID v7 (the first 48 bits). */
export function uuidv7Time(id: Uint8Array): number {
  return Buffer.from(id).readUIntBE(0, 6);
}

/**
 * Messages addressed to this user after `lastEventId` (spec 7.3 item 4), oldest first,
 * then the current unread totals. More than REPLAY_MAX ends with a resync instead.
 * Bytes columns take no range filter, so the query bounds by createdAt and the id
 * comparison runs here.
 */
export async function replay(userId: number, lastEventId: string): Promise<IdentifiedEvent[]> {
  const after = hexToId(lastEventId);
  if (after.length !== 16) return [{ id: freshId(), event: { type: "resync" } }];
  const since = new Date(uuidv7Time(after) - 1000);
  const members = await prisma.conversationMember.findMany({
    where: { userId, state: { not: "LEFT" } },
    select: { conversationId: true, folder: true },
  });
  if (!members.length) {
    return [{ id: freshId(), event: { type: "unread.changed", conversations: 0, requests: 0 } }];
  }
  const folderOf = new Map(members.map(m => [idToHex(m.conversationId), m.folder]));
  const rows = await prisma.directMessage.findMany({
    where: {
      conversationId: { in: members.map(m => m.conversationId as Buffer) },
      createdAt: { gte: since },
    },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    take: REPLAY_MAX * 2 + 1,
  });
  const missed = rows.filter(m => Buffer.compare(Buffer.from(m.id), after) > 0);
  if (missed.length > REPLAY_MAX) return [{ id: freshId(), event: { type: "resync" } }];
  const events: IdentifiedEvent[] = missed.map(m => ({
    id: idToHex(m.id),
    event: {
      type: "message.new",
      conversationId: idToHex(m.conversationId),
      folder: folderOf.get(idToHex(m.conversationId)) ?? "PRIMARY",
      message: toStreamMessage(userId, m),
    },
  }));
  const totals = await unreadSummary(userId);
  events.push({ id: freshId(), event: { type: "unread.changed", ...totals } });
  return events;
}

/**
 * Who hears about a read (msg-receipts): the reader's other tabs always; the other side
 * only when both keep read receipts on and the reader has accepted the conversation, so
 * a request sender never learns a request was opened.
 */
export async function readAudience(
  readerId: number,
  otherId: number | null,
  readerAccepted: boolean
): Promise<number[]> {
  if (!otherId || !readerAccepted) return [readerId];
  const [mine, theirs] = await Promise.all([directSettings(readerId), directSettings(otherId)]);
  return mine.readReceipts && theirs.readReceipts ? [readerId, otherId] : [readerId];
}
