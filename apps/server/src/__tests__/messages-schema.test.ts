/**
 * Amped Messages (Build Board #2, revision 4), PR M1: the pair key, the legacy thread
 * mapping and copy, account deletion, and the shared secret box.
 * Spec docs/features/messaging.md sections 4.4 and 6, decision msg-account-deletion.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@repo/database", () => ({ prisma: {}, Prisma: { DbNull: "DbNull" } }));

import { env } from "../env";
import { createSecretBox } from "../services/crypto/secretBox";
import { decryptMessageBody, encryptMessageBody } from "../services/crypto/messageBody";
import {
  anonymizeMessagingForUser,
  conversationPairKey,
  copyThreadsToConversations,
  mapThread,
  mergeMember,
  type LegacyMessage,
  type LegacyThread,
} from "../services/messaging/conversations";

const MAYA = 7;
const JORDAN = 12;
const id = (n: number) => Buffer.from(n.toString(16).padStart(32, "0"), "hex");
const hex = (b: Uint8Array | null | undefined) => (b ? Buffer.from(b).toString("hex") : null);
const at = (min: number) => new Date(Date.UTC(2026, 9, 20, 12, min));

function thread(over: Partial<LegacyThread> = {}): LegacyThread {
  return {
    id: id(1),
    creatorUserId: MAYA,
    fanUserId: JORDAN,
    status: "OPEN",
    lastMessageAt: at(30),
    creatorReadAt: at(15),
    fanReadAt: at(30),
    creatorUnread: 2,
    fanUnread: 0,
    mutedUntil: null,
    createdAt: at(0),
    ...over,
  };
}
const msg = (
  n: number,
  sender: "FAN" | "CREATOR",
  minute: number,
  body = `m${n}`,
  threadId = id(1)
): LegacyMessage => ({
  id: id(100 + n),
  threadId,
  sender,
  body,
  idempotencyKey: `k${n}`,
  createdAt: at(minute),
});

describe("conversationPairKey", () => {
  it("orders the ids, so either side finds the same conversation", () => {
    expect(conversationPairKey(MAYA, JORDAN)).toBe("7:12");
    expect(conversationPairKey(JORDAN, MAYA)).toBe("7:12");
  });
  it("refuses a conversation with yourself and bad ids", () => {
    expect(() => conversationPairKey(MAYA, MAYA)).toThrow();
    expect(() => conversationPairKey(0, MAYA)).toThrow();
    expect(() => conversationPairKey(1.5, MAYA)).toThrow();
  });
});

describe("mapThread", () => {
  const messages = [msg(1, "FAN", 10), msg(2, "CREATOR", 20), msg(3, "FAN", 30)];

  it("keeps the legacy ids, puts both members in Primary and assigns senders", () => {
    const m = mapThread(thread(), messages);
    expect(hex(m.conversation.id)).toBe(hex(id(1)));
    expect(m.conversation.pairKey).toBe("7:12");
    expect(m.conversation.createdById).toBe(JORDAN);
    expect(hex(m.conversation.lastMessageId)).toBe(hex(id(103)));
    expect(m.members.map(x => [x.userId, x.folder, x.state, x.unread])).toEqual([
      [MAYA, "PRIMARY", "ACTIVE", 2],
      [JORDAN, "PRIMARY", "ACTIVE", 0],
    ]);
    expect(m.directMessages.map(x => x.senderId)).toEqual([JORDAN, MAYA, JORDAN]);
    expect(m.directMessages.map(x => hex(x.id))).toEqual(messages.map(x => hex(x.id)));
  });

  it("sets lastReadId to the last message at or before each read time", () => {
    const [creator, fan] = mapThread(thread(), messages).members;
    expect(hex(creator.lastReadId)).toBe(hex(id(101)));
    expect(hex(fan.lastReadId)).toBe(hex(id(103)));
  });

  it("maps blocks to the blocking side and a closed thread to both sides leaving", () => {
    expect(
      mapThread(thread({ status: "BLOCKED_BY_CREATOR" }), messages).members.map(m => m.state)
    ).toEqual(["BLOCKED", "ACTIVE"]);
    expect(
      mapThread(thread({ status: "BLOCKED_BY_FAN" }), messages).members.map(m => m.state)
    ).toEqual(["ACTIVE", "BLOCKED"]);
    expect(mapThread(thread({ status: "CLOSED" }), messages).members.map(m => m.state)).toEqual([
      "LEFT",
      "LEFT",
    ]);
  });

  it("keeps the creator mute on the creator only", () => {
    const [creator, fan] = mapThread(thread({ mutedUntil: at(59) }), messages).members;
    expect(creator.mutedUntil).toEqual(at(59));
    expect(fan.mutedUntil).toBeNull();
  });

  it("maps a thread with no messages", () => {
    const m = mapThread(thread({ lastMessageAt: null }), []);
    expect(m.conversation.lastMessageId).toBeNull();
    expect(m.conversation.lastMessageAt).toBeNull();
    expect(m.directMessages).toEqual([]);
  });
});

describe("mergeMember", () => {
  it("adds unread counts, keeps the later read and keeps a block", () => {
    const [a] = mapThread(thread({ creatorUnread: 2, creatorReadAt: at(15) }), [
      msg(1, "FAN", 10),
    ]).members;
    const b = {
      ...a,
      unread: 3,
      lastReadAt: at(40),
      lastReadId: id(999),
      state: "BLOCKED" as const,
    };
    const merged = mergeMember(a, b);
    expect(merged.unread).toBe(5);
    expect(merged.lastReadAt).toEqual(at(40));
    expect(hex(merged.lastReadId)).toBe(hex(id(999)));
    expect(merged.state).toBe("BLOCKED");
  });
});

// ---------------------------------------------------------------- a small in memory db

function fakeDb(seed: { threads: LegacyThread[]; messages: LegacyMessage[] }) {
  const conversations: any[] = [];
  const members: any[] = [];
  const directMessages: any[] = [];
  const reports: any[] = [];
  const notifications: any[] = [];
  const eq = (a: Uint8Array, b: Uint8Array) => Buffer.from(a).equals(Buffer.from(b));
  const db: any = {
    messageThread: {
      findMany: async ({ take, cursor }: any) => {
        const sorted = [...seed.threads].sort((a, b) =>
          Buffer.compare(Buffer.from(a.id), Buffer.from(b.id))
        );
        const start = cursor ? sorted.findIndex(t => eq(t.id, cursor.id)) + 1 : 0;
        return sorted.slice(start, start + take);
      },
    },
    message: {
      findMany: async ({ where }: any) => seed.messages.filter(m => eq(m.threadId, where.threadId)),
    },
    conversation: {
      findUnique: async ({ where }: any) => {
        const c = conversations.find(x => x.pairKey === where.pairKey);
        return c ? { ...c, members: members.filter(m => eq(m.conversationId, c.id)) } : null;
      },
      create: async ({ data }: any) => conversations.push({ ...data }),
      update: async ({ where, data }: any) =>
        Object.assign(
          conversations.find(c => eq(c.id, where.id)),
          data
        ),
      delete: async ({ where }: any) => {
        const i = conversations.findIndex(c => eq(c.id, where.id));
        conversations.splice(i, 1);
      },
    },
    conversationMember: {
      createMany: async ({ data }: any) => members.push(...data.map((d: any) => ({ ...d }))),
      update: async ({ where, data }: any) =>
        Object.assign(
          members.find(
            m =>
              eq(m.conversationId, where.conversationId_userId.conversationId) &&
              m.userId === where.conversationId_userId.userId
          ),
          data
        ),
      findMany: async ({ where }: any) => members.filter(m => m.userId === where.userId),
      deleteMany: async ({ where }: any) => {
        const before = members.length;
        for (let i = members.length - 1; i >= 0; i--)
          if (members[i].userId === where.userId) members.splice(i, 1);
        return { count: before - members.length };
      },
      count: async ({ where }: any) =>
        members.filter(m => eq(m.conversationId, where.conversationId)).length,
    },
    directMessage: {
      findMany: async ({ where }: any) =>
        where.id
          ? directMessages.filter(d => where.id.in.some((x: Uint8Array) => eq(x, d.id)))
          : directMessages.filter(d => d.senderId === where.senderId),
      createMany: async ({ data }: any) => directMessages.push(...data.map((d: any) => ({ ...d }))),
      updateMany: async ({ where, data }: any) => {
        const hits = directMessages.filter(d => d.senderId === where.senderId);
        hits.forEach(d => Object.assign(d, data));
        return { count: hits.length };
      },
    },
    messageReport: {
      findMany: async ({ where }: any) =>
        reports.filter(
          r =>
            r.bodySnapshotEnc === null &&
            where.directMessageId.in.some((x: Uint8Array) => eq(x, r.directMessageId))
        ),
      update: async ({ where, data }: any) =>
        Object.assign(
          reports.find(r => r.id === where.id),
          data
        ),
    },
    notification: {
      updateMany: async ({ where, data }: any) => {
        notifications.filter(n => n.actorId === where.actorId).forEach(n => Object.assign(n, data));
        return { count: 0 };
      },
    },
    $transaction: async (fn: any) => fn(db),
  };
  return { db, conversations, members, directMessages, reports, notifications };
}

describe("copyThreadsToConversations", () => {
  beforeEach(() => {
    env.MESSAGES_SECRET_BOX_KEY = "test-messages-key";
  });

  it("copies threads and encrypted messages, and a second run copies nothing", async () => {
    const f = fakeDb({
      threads: [thread()],
      messages: [msg(1, "FAN", 10, "Hello Maya"), msg(2, "CREATOR", 20)],
    });
    const first = await copyThreadsToConversations({}, f.db);
    expect(first).toMatchObject({
      threads: 1,
      conversationsCreated: 1,
      messagesCopied: 2,
      threadsMerged: 0,
    });
    expect(f.members).toHaveLength(2);
    expect(f.directMessages[0].bodyEnc).not.toContain("Hello");
    expect(decryptMessageBody(f.directMessages[0].bodyEnc)).toBe("Hello Maya");

    const second = await copyThreadsToConversations({}, f.db);
    expect(second).toMatchObject({
      conversationsCreated: 0,
      messagesCopied: 0,
      messagesSkipped: 2,
    });
    expect(f.directMessages).toHaveLength(2);
  });

  it("merges two legacy threads for one pair into one conversation", async () => {
    const reverse = thread({
      id: id(2),
      creatorUserId: JORDAN,
      fanUserId: MAYA,
      creatorUnread: 1,
      fanUnread: 4,
    });
    const f = fakeDb({
      threads: [thread(), reverse],
      messages: [msg(1, "FAN", 10), msg(2, "CREATOR", 40, "later", id(2))],
    });
    const r = await copyThreadsToConversations({}, f.db);
    expect(r).toMatchObject({ conversationsCreated: 1, threadsMerged: 1, messagesCopied: 2 });
    expect(f.conversations).toHaveLength(1);
    const maya = f.members.find(m => m.userId === MAYA);
    const jordan = f.members.find(m => m.userId === JORDAN);
    expect(maya.unread).toBe(2 + 4);
    expect(jordan.unread).toBe(0 + 1);
    expect(f.directMessages.every(d => hex(d.conversationId) === hex(id(1)))).toBe(true);
    expect(hex(f.conversations[0].lastMessageId)).toBe(hex(id(102)));
  });

  it("writes nothing on a dry run", async () => {
    const f = fakeDb({ threads: [thread()], messages: [msg(1, "FAN", 10)] });
    const r = await copyThreadsToConversations({ dryRun: true }, f.db);
    expect(r).toMatchObject({ conversationsCreated: 1, messagesCopied: 1 });
    expect(f.conversations).toHaveLength(0);
    expect(f.directMessages).toHaveLength(0);
  });
});

describe("anonymizeMessagingForUser", () => {
  it("clears the departed person's messages, keeps the other member and snapshots reports", async () => {
    env.MESSAGES_SECRET_BOX_KEY = "test-messages-key";
    const f = fakeDb({
      threads: [thread()],
      messages: [msg(1, "FAN", 10, "from Jordan"), msg(2, "CREATOR", 20, "from Maya")],
    });
    await copyThreadsToConversations({}, f.db);
    const jordanMsg = f.directMessages.find(d => d.senderId === JORDAN);
    f.reports.push({ id: "r1", directMessageId: jordanMsg.id, bodySnapshotEnc: null });
    f.notifications.push({ id: "n1", actorId: JORDAN });

    const r = await anonymizeMessagingForUser(JORDAN, f.db, at(50));
    expect(r).toEqual({
      messagesCleared: 1,
      reportsSnapshotted: 1,
      membershipsRemoved: 1,
      conversationsDeleted: 0,
    });
    expect(jordanMsg).toMatchObject({
      senderId: null,
      bodyEnc: "",
      bodyLength: 0,
      unsentAt: at(50),
    });
    expect(decryptMessageBody(f.reports[0].bodySnapshotEnc)).toBe("from Jordan");
    expect(f.members.map(m => m.userId)).toEqual([MAYA]);
    expect(f.conversations).toHaveLength(1);
    expect(decryptMessageBody(f.directMessages.find(d => d.senderId === MAYA).bodyEnc)).toBe(
      "from Maya"
    );
    expect(f.notifications[0].actorId).toBeNull();
  });

  it("deletes a conversation once its last member is gone", async () => {
    const f = fakeDb({ threads: [thread()], messages: [msg(1, "FAN", 10)] });
    await copyThreadsToConversations({}, f.db);
    await anonymizeMessagingForUser(JORDAN, f.db);
    const r = await anonymizeMessagingForUser(MAYA, f.db);
    expect(r.conversationsDeleted).toBe(1);
    expect(f.conversations).toHaveLength(0);
  });
});

describe("secret box", () => {
  it("round trips and keeps purposes apart", () => {
    const a = createSecretBox("a", () => "s", "A");
    const b = createSecretBox("b", () => "s", "B");
    const sealed = a.encrypt("hello")!;
    expect(a.decrypt(sealed)).toBe("hello");
    expect(b.decrypt(sealed)).toBeNull();
    expect(a.encrypt("")).toBeNull();
    expect(a.decrypt("v2.x.y.z")).toBeNull();
  });

  it("message bodies store the empty string for an empty body", () => {
    expect(encryptMessageBody("")).toBe("");
    expect(decryptMessageBody("")).toBeNull();
  });
});
