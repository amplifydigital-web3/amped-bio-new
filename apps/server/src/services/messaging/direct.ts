import { Prisma, prisma, type MemberFolder, type MessageReportReason } from "@repo/database";
import {
  MESSAGE_LIMITS,
  findBannedTerms,
  type MessageRefusalReason,
  type MessageRuleKind,
} from "@repo/constants";
import { uuidv7 } from "../../utils/uuid-v7";
import { trustedEmailWhere } from "../../utils/verificationGrace";
import { decryptMessageBody, encryptMessageBody } from "../crypto/messageBody";
import { messageCaps, messagingEnabled } from "./caps";
import { conversationPairKey } from "./conversations";
import { creatorPoolIds, evaluateRule, followerIds, stakerIds } from "./rules";

/**
 * Amped Messages direct messages (Build Board #2 r4, PR M2). Spec docs/features/messaging.md
 * sections 7.1, 7.2 and 7.5. Any account can message any other, one to one, under the
 * recipient's "Who can message me" rule. Strangers land in Requests.
 *
 * The realtime publish (M3) and push and email jobs (M4) hook in after the send
 * transaction commits; this PR writes the bell row in the same transaction.
 */

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

export class DirectRefusal extends Error {
  constructor(
    readonly reason: MessageRefusalReason,
    readonly rule: MessageRuleKind | null = null
  ) {
    super(`dm_refused_${reason}`);
  }
}

export type DirectInputCode = "empty" | "too_long" | "not_found" | "unsend_window" | "not_yours";
export class DirectInputError extends Error {
  constructor(readonly code: DirectInputCode) {
    super(`dm_${code}`);
  }
}

/** Plain text, trimmed, 1 to MESSAGE_LIMITS.bodyMax characters. */
export function normalizeDirectBody(body: string): string {
  const text = body.replace(/\r\n/g, "\n").trim();
  if (!text) throw new DirectInputError("empty");
  if (text.length > MESSAGE_LIMITS.bodyMax) throw new DirectInputError("too_long");
  return text;
}

/** Financial promise terms in a body (warn only, stored for admins; spec 4.4 item 4). */
export function flaggedTermsOf(body: string) {
  const seen = new Set<string>();
  return findBannedTerms(body)
    .filter(h => (seen.has(h.phrase) ? false : (seen.add(h.phrase), true)))
    .map(h => ({ phrase: h.phrase, category: h.category }));
}

// ---------------------------------------------------------------- settings

export type DirectSettings = {
  ruleKind: MessageRuleKind;
  stakeMin: string | null;
  dailyNewThreadCap: number;
  readReceipts: boolean;
  paused: boolean;
};

/** A missing row means the defaults: Followers and members (msg-rules). */
export async function directSettings(userId: number): Promise<DirectSettings> {
  const row = await prisma.messagingSettings.findUnique({ where: { userId } });
  return {
    ruleKind: (row?.ruleKind ?? "FOLLOWER") as MessageRuleKind,
    stakeMin: row?.stakeMin ?? null,
    dailyNewThreadCap: row?.dailyNewThreadCap ?? MESSAGE_LIMITS.dailyNewThreadCapDefault,
    readReceipts: row?.readReceipts ?? true,
    paused: !!row?.pausedAt,
  };
}

// ---------------------------------------------------------------- access

export type DirectVerdict =
  | {
      allowed: true;
      folder: MemberFolder;
      conversationId: Uint8Array | null;
      rule: MessageRuleKind;
    }
  | { allowed: false; reason: MessageRefusalReason; rule: MessageRuleKind | null };

const refuse = (
  reason: MessageRefusalReason,
  rule: MessageRuleKind | null = null
): DirectVerdict => ({
  allowed: false,
  reason,
  rule,
});

async function senderPausedNow(userId: number, now: Date) {
  const status = await prisma.messagingSenderStatus.findUnique({ where: { userId } });
  if (!status?.pausedAt) return false;
  return status.pausedUntil === null || status.pausedUntil > now;
}

/** Does the recipient already know the sender (spec 7.1 step 3)? */
async function hasRelationship(
  senderId: number,
  recipientId: number,
  recipientMember: { acceptedAt: Date | null } | null
) {
  // The recipient accepted, or wrote first (people you messaged)
  if (recipientMember?.acceptedAt) return true;
  // People the recipient follows, with an account that counts (Fan Graph rule)
  const follows = await prisma.follow.findFirst({
    where: {
      follower_id: recipientId,
      creator_id: senderId,
      follower: { block: "no", AND: [trustedEmailWhere(new Date())] },
    },
    select: { id: true },
  });
  // Paid members join here when Memberships (#25) ships
  return !!follows;
}

/**
 * May `senderId` write to `recipientId` now, and where does it land? Read only;
 * sendDirect calls it again inside the send. Order (spec 7.1): kill switch, accounts,
 * blocks, relationship (Primary), the recipient's rule, caps, then Requests limits.
 * Rules stay open to every creator (Rob, 2 Nov): they do not read the access engine's
 * stake pilot allowlist. No reason ever carries an amount.
 */
export async function canSendDirect(
  senderId: number,
  recipientId: number,
  now = new Date()
): Promise<DirectVerdict> {
  if (!(await messagingEnabled())) return refuse("disabled");
  if (senderId === recipientId) return refuse("closed");

  const [sender, recipient] = await Promise.all([
    prisma.user.findUnique({ where: { id: senderId }, select: { block: true, created_at: true } }),
    prisma.user.findUnique({ where: { id: recipientId }, select: { block: true } }),
  ]);
  if (!recipient || recipient.block !== "no") return refuse("closed");
  if (!sender || sender.block !== "no" || (await senderPausedNow(senderId, now))) {
    return refuse("sender_paused");
  }

  const pairKey = conversationPairKey(senderId, recipientId);
  const [conversation, followBlock, settings] = await Promise.all([
    prisma.conversation.findUnique({
      where: { pairKey },
      select: {
        id: true,
        members: { select: { userId: true, state: true, acceptedAt: true, folder: true } },
      },
    }),
    prisma.followBlock.findUnique({
      where: { creator_id_user_id: { creator_id: recipientId, user_id: senderId } },
      select: { user_id: true },
    }),
    directSettings(recipientId),
  ]);
  const mine = conversation?.members.find(m => m.userId === senderId) ?? null;
  const theirs = conversation?.members.find(m => m.userId === recipientId) ?? null;
  const rule = settings.ruleKind;

  // A block either way stops sends both ways (acceptance 9)
  if (followBlock || theirs?.state === "BLOCKED" || mine?.state === "BLOCKED") {
    return refuse("blocked", rule);
  }

  const caps = await messageCaps(now.getTime());
  const isNew = !conversation || !theirs;
  const [perConversation, perDay, newToday] = await Promise.all([
    conversation
      ? prisma.directMessage.count({
          where: {
            conversationId: conversation.id,
            senderId,
            createdAt: { gte: new Date(now.getTime() - HOUR) },
          },
        })
      : Promise.resolve(0),
    prisma.directMessage.count({
      where: { senderId, createdAt: { gte: new Date(now.getTime() - DAY) } },
    }),
    isNew
      ? prisma.conversation.count({
          where: { createdById: senderId, createdAt: { gte: new Date(now.getTime() - DAY) } },
        })
      : Promise.resolve(0),
  ]);
  if (perConversation >= caps.sendsPerConversationPerHour || perDay >= caps.sendsPerDay) {
    return refuse("sender_cap", rule);
  }

  if (await hasRelationship(senderId, recipientId, theirs)) {
    return { allowed: true, folder: "PRIMARY", conversationId: conversation?.id ?? null, rule };
  }

  // Recipient's rule (step 4)
  if (settings.paused) return refuse("closed", rule);
  const poolIds =
    rule === "FOLLOWER" || rule === "POOL_MEMBER" || rule === "STAKE_MIN"
      ? await creatorPoolIds(recipientId)
      : [];
  const verdict = await evaluateRule(
    rule,
    { creatorUserId: recipientId, poolIds, stakeMin: settings.stakeMin },
    senderId
  );
  if (!verdict.allowed) {
    const reason =
      verdict.reason === "no_pool"
        ? rule === "STAKE_MIN"
          ? "stake_below"
          : "not_pool_fan"
        : verdict.reason;
    return refuse(reason, rule);
  }

  // Caps for new conversations (step 5)
  if (isNew) {
    const newAccount =
      sender.created_at.getTime() > now.getTime() - MESSAGE_LIMITS.newAccountDays * DAY;
    const limit = newAccount
      ? Math.min(caps.newAccountConversationsPerDay, caps.newConversationsPerDay)
      : caps.newConversationsPerDay;
    if (newToday >= limit) return refuse("sender_cap", rule);
    const recipientNewToday = await prisma.conversationMember.count({
      where: {
        userId: recipientId,
        joinedAt: { gte: new Date(now.getTime() - DAY) },
        conversation: { createdById: { not: recipientId } },
      },
    });
    if (recipientNewToday >= settings.dailyNewThreadCap) return refuse("cap_reached", rule);
  }

  // Requests: a few messages before the recipient accepts (step 6)
  if (conversation && theirs && !theirs.acceptedAt) {
    const sent = await prisma.directMessage.count({
      where: { conversationId: conversation.id, senderId },
    });
    if (sent >= caps.messagesBeforeAccept) return refuse("awaiting_accept", rule);
  }
  return { allowed: true, folder: "REQUESTS", conversationId: conversation?.id ?? null, rule };
}

// ---------------------------------------------------------------- send

export type SentDirect = {
  messageId: Uint8Array;
  conversationId: Uint8Array;
  folder: MemberFolder;
  created: boolean;
  repeat: boolean;
  flaggedTerms: { phrase: string; category: string }[];
  /** The recipient's bell row for this conversation, or null when muted or a repeat. */
  notificationId: Uint8Array | null;
  /** The recipient muted this conversation: no bell, push or email (M4). */
  muted: boolean;
};

/**
 * Store one message (spec 7.2). One transaction: create the conversation on first
 * contact, insert the message, update both members, and upsert the recipient's bell
 * row (collapsed per conversation until seen). A repeat with the same idempotency key
 * returns the first message.
 */
export async function sendDirect(input: {
  senderId: number;
  recipientId: number;
  body: string;
  idempotencyKey?: string;
  now?: Date;
}): Promise<SentDirect> {
  const now = input.now ?? new Date();
  const body = normalizeDirectBody(input.body);
  const flags = flaggedTermsOf(body);

  const verdict = await canSendDirect(input.senderId, input.recipientId, now);
  if (!verdict.allowed) throw new DirectRefusal(verdict.reason, verdict.rule);

  if (verdict.conversationId && input.idempotencyKey) {
    const repeat = await prisma.directMessage.findUnique({
      where: {
        conversationId_idempotencyKey: {
          conversationId: verdict.conversationId as Buffer,
          idempotencyKey: input.idempotencyKey,
        },
      },
      select: { id: true },
    });
    if (repeat) {
      return {
        messageId: repeat.id,
        conversationId: verdict.conversationId,
        folder: verdict.folder,
        created: false,
        repeat: true,
        flaggedTerms: flags,
        notificationId: null,
        muted: false,
      };
    }
  }

  const pairKey = conversationPairKey(input.senderId, input.recipientId);
  return prisma.$transaction(async tx => {
    let conversationId = verdict.conversationId;
    let created = false;
    if (!conversationId) {
      const id = uuidv7();
      try {
        await tx.conversation.create({ data: { id, pairKey, createdById: input.senderId } });
        conversationId = id;
        created = true;
      } catch (error) {
        // Two first messages at once: the other one created it
        if (!(error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002"))
          throw error;
        const existing = await tx.conversation.findUniqueOrThrow({
          where: { pairKey },
          select: { id: true },
        });
        conversationId = existing.id;
      }
    }
    const cid = conversationId as Buffer;

    // The sender: present, active, accepted (writing accepts a request), unarchived
    await tx.conversationMember.upsert({
      where: { conversationId_userId: { conversationId: cid, userId: input.senderId } },
      create: { conversationId: cid, userId: input.senderId, folder: "PRIMARY", acceptedAt: now },
      update: { folder: "PRIMARY", state: "ACTIVE", acceptedAt: now, archivedAt: null },
    });
    // The recipient: Primary or Requests per the verdict; never moved out of Primary
    const recipient = await tx.conversationMember.findUnique({
      where: { conversationId_userId: { conversationId: cid, userId: input.recipientId } },
      select: { folder: true, mutedUntil: true },
    });
    const folder: MemberFolder = recipient?.folder === "PRIMARY" ? "PRIMARY" : verdict.folder;
    if (recipient) {
      await tx.conversationMember.update({
        where: { conversationId_userId: { conversationId: cid, userId: input.recipientId } },
        data: { folder, unread: { increment: 1 }, archivedAt: null, state: "ACTIVE" },
      });
    } else {
      await tx.conversationMember.create({
        data: {
          conversationId: cid,
          userId: input.recipientId,
          folder,
          acceptedAt: folder === "PRIMARY" ? now : null,
          unread: 1,
        },
      });
    }

    const messageId = uuidv7();
    await tx.directMessage.create({
      data: {
        id: messageId,
        conversationId: cid,
        senderId: input.senderId,
        bodyEnc: encryptMessageBody(body),
        bodyLength: body.length,
        idempotencyKey: input.idempotencyKey ?? null,
        flaggedTerms: flags.length ? flags : Prisma.DbNull,
        createdAt: now,
      },
    });
    await tx.conversation.update({
      where: { id: cid },
      data: { lastMessageId: messageId, lastMessageAt: now },
    });

    // Bell row: one unseen row per conversation, count bumps (spec 7.4). Muted: none.
    const muted = !!recipient?.mutedUntil && recipient.mutedUntil > now;
    let notificationId: Uint8Array | null = null;
    if (!muted) {
      const groupKey = `conv:${Buffer.from(cid).toString("hex")}`;
      const unseen = await tx.notification.findFirst({
        where: { userId: input.recipientId, groupKey, seenAt: null },
        select: { id: true },
      });
      if (unseen) {
        notificationId = unseen.id;
        await tx.notification.update({
          where: { id: unseen.id },
          data: { count: { increment: 1 }, actorId: input.senderId },
        });
      } else {
        notificationId = uuidv7();
        await tx.notification.create({
          data: {
            id: notificationId as Buffer,
            userId: input.recipientId,
            kind: folder === "REQUESTS" ? "REQUEST" : "MESSAGE",
            actorId: input.senderId,
            refId: cid,
            groupKey,
          },
        });
      }
    }
    return {
      messageId,
      conversationId: cid,
      folder,
      created,
      repeat: false,
      flaggedTerms: flags,
      notificationId,
      muted,
    };
  });
}

// ---------------------------------------------------------------- membership helpers

export async function memberOf(userId: number, conversationId: Uint8Array) {
  const member = await prisma.conversationMember.findUnique({
    where: { conversationId_userId: { conversationId: conversationId as Buffer, userId } },
  });
  if (!member) throw new DirectInputError("not_found");
  return member;
}

async function otherMemberId(userId: number, conversationId: Uint8Array): Promise<number | null> {
  const other = await prisma.conversationMember.findFirst({
    where: { conversationId: conversationId as Buffer, userId: { not: userId } },
    select: { userId: true },
  });
  return other?.userId ?? null;
}

// ---------------------------------------------------------------- read side

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

export type Relation = "member" | "poolFan" | "follower" | "youFollow" | null;

/** Relation chips the viewer sees for each person: member beats pool fan beats follower. */
export async function relationsFor(
  viewerId: number,
  personIds: number[]
): Promise<Map<number, Relation>> {
  const out = new Map<number, Relation>();
  if (!personIds.length) return out;
  const poolIds = await creatorPoolIds(viewerId);
  const [followers, stakers, viewerFollows] = await Promise.all([
    followerIds(viewerId, personIds),
    stakerIds(poolIds, personIds),
    prisma.follow.findMany({
      where: { follower_id: viewerId, creator_id: { in: personIds } },
      select: { creator_id: true },
    }),
  ]);
  const follows = new Set(viewerFollows.map(f => f.creator_id));
  for (const id of personIds) {
    out.set(
      id,
      stakers.has(id)
        ? "poolFan"
        : followers.has(id)
          ? "follower"
          : follows.has(id)
            ? "youFollow"
            : null
    );
  }
  return out;
}

export type ListFilter = "all" | "unread" | "members" | "poolFans" | "followers";

/**
 * The inbox list (spec 7.5 messages.list). Newest first by lastMessageAt; cursor is the
 * last row's lastMessageAt ISO time.
 */
export async function listConversations(input: {
  userId: number;
  folder: MemberFolder;
  archived?: boolean;
  filter?: ListFilter;
  cursor?: string | null;
  limit?: number;
}) {
  const limit = Math.min(input.limit ?? 30, 50);
  const before = input.cursor ? new Date(input.cursor) : null;
  const members = await prisma.conversationMember.findMany({
    where: {
      userId: input.userId,
      folder: input.folder,
      archivedAt: input.archived ? { not: null } : null,
      state: { not: "LEFT" },
      ...(input.filter === "unread" ? { unread: { gt: 0 } } : {}),
      conversation: before ? { lastMessageAt: { lt: before } } : { lastMessageAt: { not: null } },
    },
    include: {
      conversation: {
        select: {
          id: true,
          lastMessageAt: true,
          lastMessageId: true,
          members: { select: { userId: true, user: { select: personSelect } } },
        },
      },
    },
    orderBy: { conversation: { lastMessageAt: "desc" } },
    take: input.filter && input.filter !== "all" && input.filter !== "unread" ? 200 : limit + 1,
  });
  const otherIds = members
    .map(m => m.conversation.members.find(x => x.userId !== input.userId)?.userId)
    .filter((id): id is number => typeof id === "number");
  const relations = await relationsFor(input.userId, otherIds);
  const lastIds = members.map(m => m.conversation.lastMessageId).filter((id): id is Buffer => !!id);
  const lasts = lastIds.length
    ? await prisma.directMessage.findMany({
        where: { id: { in: lastIds } },
        select: { id: true, senderId: true, bodyEnc: true, unsentAt: true },
      })
    : [];
  const lastByHex = new Map(lasts.map(l => [Buffer.from(l.id).toString("hex"), l]));

  let rows = members.map(m => {
    const other = m.conversation.members.find(x => x.userId !== input.userId)?.user ?? null;
    const last = m.conversation.lastMessageId
      ? lastByHex.get(Buffer.from(m.conversation.lastMessageId).toString("hex"))
      : null;
    const cleared =
      m.clearedBeforeId &&
      m.conversation.lastMessageId &&
      Buffer.compare(Buffer.from(m.conversation.lastMessageId), Buffer.from(m.clearedBeforeId)) <=
        0;
    return {
      conversationId: Buffer.from(m.conversationId).toString("hex"),
      person: other ? { id: other.id, name: other.name, handle: other.handle } : null,
      relation: other ? (relations.get(other.id) ?? null) : null,
      preview:
        !last || cleared
          ? null
          : last.unsentAt
            ? { removed: true as const }
            : {
                text: (decryptMessageBody(last.bodyEnc) ?? "").slice(0, 140),
                mine: last.senderId === input.userId,
              },
      lastMessageAt: m.conversation.lastMessageAt,
      unread: m.unread,
      muted: !!m.mutedUntil && m.mutedUntil > new Date(),
      blocked: m.state === "BLOCKED",
    };
  });
  if (input.filter === "poolFans") rows = rows.filter(r => r.relation === "poolFan");
  if (input.filter === "followers") rows = rows.filter(r => r.relation === "follower");
  // Paid members arrive with Memberships (#25)
  if (input.filter === "members") rows = rows.filter(r => r.relation === "member");
  const page = rows.slice(0, limit);
  const next =
    rows.length > limit ? (page[page.length - 1]?.lastMessageAt?.toISOString() ?? null) : null;
  return { rows: page, nextCursor: next };
}

/** One page of a conversation, newest first. Bodies decrypted here, never logged. */
export async function conversationPage(input: {
  userId: number;
  conversationId: Uint8Array;
  before?: Uint8Array | null;
  limit?: number;
}) {
  const me = await memberOf(input.userId, input.conversationId);
  const limit = Math.min(input.limit ?? MESSAGE_LIMITS.pageSize, MESSAGE_LIMITS.pageSize);
  const otherId = await otherMemberId(input.userId, input.conversationId);
  // Bytes columns take no range filter: page with a cursor, and hide cleared history by time
  const cleared = me.clearedBeforeId
    ? await prisma.directMessage.findUnique({
        where: { id: me.clearedBeforeId as Buffer },
        select: { createdAt: true },
      })
    : null;
  const [rows, other, mySettings, otherSettings, person] = await Promise.all([
    prisma.directMessage.findMany({
      where: {
        conversationId: input.conversationId as Buffer,
        ...(cleared ? { createdAt: { gt: cleared.createdAt } } : {}),
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      ...(input.before ? { cursor: { id: input.before as Buffer }, skip: 1 } : {}),
      take: limit + 1,
    }),
    otherId
      ? prisma.conversationMember.findUnique({
          where: {
            conversationId_userId: {
              conversationId: input.conversationId as Buffer,
              userId: otherId,
            },
          },
          select: { lastReadId: true, lastReadAt: true, acceptedAt: true },
        })
      : null,
    directSettings(input.userId),
    otherId ? directSettings(otherId) : null,
    otherId ? prisma.user.findUnique({ where: { id: otherId }, select: personSelect }) : null,
  ]);
  const page = rows.slice(0, limit);
  // Links stay plain text in a request until this member accepts (spec 4.4 item 3)
  const linksOff = me.folder === "REQUESTS" && !me.acceptedAt;
  // Receipts show only when both sides keep them on (msg-receipts), and never to a
  // sender whose request is not accepted yet
  const receipts = mySettings.readReceipts && !!otherSettings?.readReceipts && !!other?.acceptedAt;
  return {
    conversationId: Buffer.from(input.conversationId).toString("hex"),
    folder: me.folder,
    accepted: !!me.acceptedAt,
    linksOff,
    person: person ? { id: person.id, name: person.name, handle: person.handle } : null,
    deletedAccount: !person,
    messages: page.map(m => ({
      id: Buffer.from(m.id).toString("hex"),
      mine: m.senderId === input.userId,
      removed: !!m.unsentAt,
      body: m.unsentAt ? null : decryptMessageBody(m.bodyEnc),
      flagged: m.senderId === input.userId && !!m.flaggedTerms,
      createdAt: m.createdAt,
    })),
    seenUpTo: receipts && other?.lastReadId ? Buffer.from(other.lastReadId).toString("hex") : null,
    seenAt: receipts ? (other?.lastReadAt ?? null) : null,
    nextBefore: rows.length > limit ? Buffer.from(page[page.length - 1].id).toString("hex") : null,
  };
}

/** Unread conversations for the rail badge and the Requests count (spec 8.1). */
export async function unreadSummary(userId: number) {
  const [primary, requests] = await Promise.all([
    prisma.conversationMember.count({
      where: {
        userId,
        folder: "PRIMARY",
        archivedAt: null,
        unread: { gt: 0 },
        state: { not: "LEFT" },
      },
    }),
    prisma.conversationMember.count({
      where: { userId, folder: "REQUESTS", state: { not: "LEFT" } },
    }),
  ]);
  return { conversations: primary, requests };
}

// ---------------------------------------------------------------- member actions

export async function markRead(
  userId: number,
  conversationId: Uint8Array,
  messageId: Uint8Array | null,
  now = new Date()
) {
  await memberOf(userId, conversationId);
  const conversation = await prisma.conversation.findUnique({
    where: { id: conversationId as Buffer },
    select: { lastMessageId: true },
  });
  await prisma.$transaction([
    prisma.conversationMember.update({
      where: { conversationId_userId: { conversationId: conversationId as Buffer, userId } },
      data: {
        lastReadId: (messageId ?? conversation?.lastMessageId ?? null) as Buffer | null,
        lastReadAt: now,
        unread: 0,
      },
    }),
    prisma.notification.updateMany({
      where: {
        userId,
        groupKey: `conv:${Buffer.from(conversationId).toString("hex")}`,
        seenAt: null,
      },
      data: { seenAt: now },
    }),
  ]);
}

export async function acceptRequest(userId: number, conversationId: Uint8Array, now = new Date()) {
  await memberOf(userId, conversationId);
  await prisma.conversationMember.update({
    where: { conversationId_userId: { conversationId: conversationId as Buffer, userId } },
    data: { folder: "PRIMARY", acceptedAt: now },
  });
}

/** Delete a request: hidden for this member, the sender is not told. */
export async function deleteRequest(userId: number, conversationId: Uint8Array) {
  const me = await memberOf(userId, conversationId);
  if (me.folder !== "REQUESTS") throw new DirectInputError("not_found");
  await clearForMe(userId, conversationId);
  await prisma.conversationMember.update({
    where: { conversationId_userId: { conversationId: conversationId as Buffer, userId } },
    data: { state: "LEFT", unread: 0 },
  });
}

/** Delete for me: hides everything up to now for this member only. */
export async function clearForMe(userId: number, conversationId: Uint8Array) {
  await memberOf(userId, conversationId);
  const conversation = await prisma.conversation.findUnique({
    where: { id: conversationId as Buffer },
    select: { lastMessageId: true },
  });
  await prisma.conversationMember.update({
    where: { conversationId_userId: { conversationId: conversationId as Buffer, userId } },
    data: { clearedBeforeId: conversation?.lastMessageId ?? null, unread: 0 },
  });
}

export async function setMuted(userId: number, conversationId: Uint8Array, until: Date | null) {
  await memberOf(userId, conversationId);
  await prisma.conversationMember.update({
    where: { conversationId_userId: { conversationId: conversationId as Buffer, userId } },
    data: { mutedUntil: until },
  });
}

export async function setArchived(
  userId: number,
  conversationId: Uint8Array,
  archived: boolean,
  now = new Date()
) {
  await memberOf(userId, conversationId);
  await prisma.conversationMember.update({
    where: { conversationId_userId: { conversationId: conversationId as Buffer, userId } },
    data: { archivedAt: archived ? now : null },
  });
}

/** Unsend for everyone within the window (msg-delete). Reports keep their snapshot. */
export async function unsend(userId: number, messageId: Uint8Array, now = new Date()) {
  const message = await prisma.directMessage.findUnique({ where: { id: messageId as Buffer } });
  if (!message) throw new DirectInputError("not_found");
  if (message.senderId !== userId) throw new DirectInputError("not_yours");
  if (message.unsentAt) return { conversationId: message.conversationId };
  if (now.getTime() - message.createdAt.getTime() > MESSAGE_LIMITS.unsendWindowMinutes * 60_000) {
    throw new DirectInputError("unsend_window");
  }
  await prisma.$transaction(async tx => {
    await tx.messageReport.updateMany({
      where: { directMessageId: message.id, bodySnapshotEnc: null },
      data: { bodySnapshotEnc: message.bodyEnc },
    });
    await tx.directMessage.update({
      where: { id: message.id },
      data: { unsentAt: now, bodyEnc: "", bodyLength: 0 },
    });
  });
  return { conversationId: message.conversationId };
}

/**
 * Block (spec 7.6). The blocker's member row turns BLOCKED; sends stop both ways. Three
 * blocks of one sender in 7 days pause that sender for 24 hours, as on the Telegram path.
 */
export async function setBlocked(
  userId: number,
  conversationId: Uint8Array,
  blocked: boolean,
  now = new Date()
) {
  await memberOf(userId, conversationId);
  await prisma.conversationMember.update({
    where: { conversationId_userId: { conversationId: conversationId as Buffer, userId } },
    data: { state: blocked ? "BLOCKED" : "ACTIVE" },
  });
  if (!blocked) return { senderPaused: false };
  const otherId = await otherMemberId(userId, conversationId);
  if (!otherId) return { senderPaused: false };
  return { senderPaused: await checkBlockThreshold(otherId, now) };
}

async function checkBlockThreshold(senderId: number, now: Date) {
  const blocks = await prisma.conversationMember.count({
    where: {
      state: "BLOCKED",
      userId: { not: senderId },
      conversation: {
        members: { some: { userId: senderId } },
        lastMessageAt: { gte: new Date(now.getTime() - 7 * DAY) },
      },
    },
  });
  if (blocks < 3) return false;
  const status = await prisma.messagingSenderStatus.findUnique({ where: { userId: senderId } });
  if (status?.pausedAt && status.pausedUntil === null) return false;
  const data = {
    pausedAt: now,
    pausedUntil: new Date(now.getTime() + DAY),
    pausedReason: `Blocked by ${blocks} people in 7 days`,
  };
  await prisma.messagingSenderStatus.upsert({
    where: { userId: senderId },
    create: { userId: senderId, ...data },
    update: data,
  });
  return true;
}

/**
 * Report (spec 7.6). Keeps an encrypted snapshot of the reported message so unsend cannot
 * erase it. Reports from 1% of a person's active conversations, minimum 5 distinct
 * reporters, pause that person's inbound messages, as on the Telegram path.
 */
export async function report(input: {
  userId: number;
  conversationId: Uint8Array;
  messageId?: Uint8Array | null;
  reason: MessageReportReason;
  note?: string | null;
  alsoBlock?: boolean;
  now?: Date;
}) {
  const now = input.now ?? new Date();
  await memberOf(input.userId, input.conversationId);
  const otherId = await otherMemberId(input.userId, input.conversationId);
  let snapshot: string | null = null;
  if (input.messageId) {
    const m = await prisma.directMessage.findUnique({ where: { id: input.messageId as Buffer } });
    if (!m || !Buffer.from(m.conversationId).equals(Buffer.from(input.conversationId))) {
      throw new DirectInputError("not_found");
    }
    snapshot = m.bodyEnc || null;
  }
  await prisma.messageReport.create({
    data: {
      id: uuidv7(),
      conversationId: input.conversationId as Buffer,
      directMessageId: (input.messageId ?? null) as Buffer | null,
      bodySnapshotEnc: snapshot,
      reporterUserId: input.userId,
      reason: input.reason,
      note: input.note ?? null,
      createdAt: now,
    },
  });
  if (input.alsoBlock) await setBlocked(input.userId, input.conversationId, true, now);
  if (otherId) await checkReportThreshold(otherId, now);
}

async function checkReportThreshold(reportedId: number, now: Date) {
  const since = new Date(now.getTime() - 7 * DAY);
  const [rows, active] = await Promise.all([
    prisma.messageReport.findMany({
      where: {
        createdAt: { gte: since },
        reporterUserId: { not: reportedId },
        conversationId: { not: null },
      },
      select: { reporterUserId: true, conversationId: true },
    }),
    prisma.conversationMember.count({
      where: { userId: reportedId, conversation: { lastMessageAt: { gte: since } } },
    }),
  ]);
  if (!rows.length) return false;
  const theirConversations = new Set(
    (
      await prisma.conversationMember.findMany({
        where: { userId: reportedId, conversationId: { in: rows.map(r => r.conversationId!) } },
        select: { conversationId: true },
      })
    ).map(m => Buffer.from(m.conversationId).toString("hex"))
  );
  const reporters = new Set(
    rows
      .filter(r => theirConversations.has(Buffer.from(r.conversationId!).toString("hex")))
      .map(r => r.reporterUserId)
  );
  if (reporters.size < Math.max(5, Math.ceil(active * 0.01))) return false;
  const settings = await prisma.messagingSettings.findUnique({ where: { userId: reportedId } });
  if (settings?.pausedAt) return false;
  await prisma.messagingSettings.upsert({
    where: { userId: reportedId },
    create: {
      userId: reportedId,
      pausedAt: now,
      pausedReason: `${reporters.size} people reported in 7 days`,
    },
    update: { pausedAt: now, pausedReason: `${reporters.size} people reported in 7 days` },
  });
  return true;
}

/** People search over the caller's own conversations (spec 7.5). Bodies are encrypted at
 * rest, so message text is searched in the client over loaded pages. */
export async function searchPeople(userId: number, q: string) {
  const term = q.trim().replace(/^@/, "");
  if (term.length < 2) return [];
  const members = await prisma.conversationMember.findMany({
    where: {
      conversation: { members: { some: { userId } } },
      userId: { not: userId },
      user: { OR: [{ name: { contains: term } }, { handle: { contains: term } }] },
    },
    select: { conversationId: true, user: { select: personSelect } },
    take: 20,
  });
  return members.map(m => ({
    conversationId: Buffer.from(m.conversationId).toString("hex"),
    person: { id: m.user.id, name: m.user.name, handle: m.user.handle },
  }));
}

export type { PersonRow };
