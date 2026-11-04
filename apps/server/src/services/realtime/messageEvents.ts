import { prisma } from "@repo/database";
import { idToHex } from "../analytics/ids";
import { publish, publishMany, type ConversationChange } from "./bus";
import { readAudience } from "./stream";

/**
 * Publish after a messages.* mutation commits (spec 7.2 "after commit", 7.3). Every
 * function is best effort and never throws: the write already succeeded, and a missed
 * signal is recovered by replay on the next reconnect.
 */

async function safely(label: string, fn: () => Promise<void>) {
  try {
    await fn();
  } catch (error) {
    console.warn(`[realtime] ${label} publish failed:`, (error as Error).message);
  }
}

async function otherMember(userId: number, conversationId: Uint8Array) {
  return prisma.conversationMember.findFirst({
    where: { conversationId: conversationId as Buffer, userId: { not: userId } },
    select: { userId: true, state: true },
  });
}

/** A new message: both sides (the sender's other tabs too), then unread totals. */
export function afterSend(input: {
  senderId: number;
  recipientId: number;
  conversationId: Uint8Array;
  messageId: Uint8Array;
}) {
  return safely("send", async () => {
    const conversationId = idToHex(input.conversationId);
    await publishMany([input.senderId, input.recipientId], {
      type: "message.new",
      conversationId,
      messageId: idToHex(input.messageId),
    });
    await publish(input.recipientId, { type: "unread.changed" });
  });
}

/** Unsent for everyone: both sides replace the bubble with "Message removed". */
export function afterUnsend(userId: number, conversationId: Uint8Array, messageId: Uint8Array) {
  return safely("unsend", async () => {
    const other = await otherMember(userId, conversationId);
    await publishMany(other ? [userId, other.userId] : [userId], {
      type: "message.unsent",
      conversationId: idToHex(conversationId),
      messageId: idToHex(messageId),
    });
  });
}

/** Read: receipts to the other side when allowed, unread totals to the reader's tabs. */
export function afterRead(
  userId: number,
  conversationId: Uint8Array,
  messageId: Uint8Array | null
) {
  return safely("read", async () => {
    const [other, me] = await Promise.all([
      otherMember(userId, conversationId),
      prisma.conversationMember.findUnique({
        where: { conversationId_userId: { conversationId: conversationId as Buffer, userId } },
        select: { acceptedAt: true, lastReadId: true },
      }),
    ]);
    const audience = await readAudience(userId, other?.userId ?? null, !!me?.acceptedAt);
    const readId = messageId ?? me?.lastReadId ?? null;
    await publishMany(audience, {
      type: "conversation.read",
      conversationId: idToHex(conversationId),
      messageId: readId ? idToHex(readId) : null,
      at: new Date().toISOString(),
    });
    await publish(userId, { type: "unread.changed" });
  });
}

/**
 * Member changes (accept, delete request, clear, mute, archive, block). Only the
 * caller's own tabs hear them: a block or a deleted request is never announced to the
 * other side. Accepting is the exception the other side sees, since their next message
 * now lands in Primary and receipts may start.
 */
export function afterChange(
  userId: number,
  conversationId: Uint8Array,
  change: ConversationChange
) {
  return safely(change, async () => {
    const audience = [userId];
    if (change === "accepted") {
      const other = await otherMember(userId, conversationId);
      if (other) audience.push(other.userId);
    }
    await publishMany(audience, {
      type: "conversation.updated",
      conversationId: idToHex(conversationId),
      change,
    });
    if (
      change === "accepted" ||
      change === "deleted" ||
      change === "cleared" ||
      change === "archived" ||
      change === "unarchived"
    ) {
      await publish(userId, { type: "unread.changed" });
    }
  });
}
