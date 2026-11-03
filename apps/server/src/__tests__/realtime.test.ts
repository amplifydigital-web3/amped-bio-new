/**
 * Amped Messages realtime (Build Board #2 r4, PR M3; spec 7.3). The bus in process
 * mode, hydration that never leaks to non members, replay after lastEventId with the
 * 200 cap, the live stream with dedupe, receipts only when both sides allow them,
 * typing limits, and the after-commit publishes from messages.*.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const fake = vi.hoisted(() => ({ db: null as any }));
vi.mock("@repo/database", async () => {
  const helper = await import("./helpers/fakeMessagingDb");
  fake.db = helper.createFakeDb();
  return {
    prisma: fake.db.client,
    Prisma: helper.fakePrismaNamespace,
    withNumericIdCoercion: (client: unknown) => client,
  };
});
// No Redis in unit tests: the bus, presence and the rate limiter run in process
vi.mock("../utils/cache", () => ({ getRedisClient: () => null }));
vi.mock("../utils/fileUrlResolver", () => ({ getFileUrl: async () => null }));

import { env } from "../env";
import { idToHex } from "../services/analytics/ids";
import { clearMessageCapsCache } from "../services/messaging/caps";
import { sendDirect } from "../services/messaging/direct";
import { isLive, openStreamCount, publish, subscribe } from "../services/realtime/bus";
import { REPLAY_MAX, hydrate, replay, uuidv7Time } from "../services/realtime/stream";
import { realtimeRouter } from "../trpc/realtime";
import { messagesRouter } from "../trpc/messages";
import { uuidv7 } from "../utils/uuid-v7";
import { ANA, JORDAN, MAYA, SAM, seedPeople } from "./helpers/messagingFixtures";

const follow = (follower: number, creator: number) =>
  fake.db
    .table("follow")
    .push({ id: follower * 100 + creator, follower_id: follower, creator_id: creator });
const friends = (a: number, b: number) => {
  follow(a, b);
  follow(b, a);
};
const send = (senderId: number, recipientId: number, body = "hi") =>
  sendDirect({ senderId, recipientId, body });
const messages = (sub: number) => messagesRouter.createCaller({ user: { sub } } as never);

/**
 * Replay orders and compares by the timestamp inside the UUID v7, and `uuidv7()` fills
 * the 74 low bits with random bytes, so two ids from the same millisecond sort randomly.
 * Wait for the clock to move on before creating the next message, like two sends from a
 * person always would.
 */
async function nextMillisecond() {
  const start = Date.now();
  while (Date.now() === start) await new Promise(resolve => setTimeout(resolve, 0));
}

/** Collect events from realtime.events until `count` arrive. */
async function collect(
  sub: number,
  count: number,
  input: { lastEventId?: string } = {},
  during?: () => Promise<void>
) {
  const controller = new AbortController();
  const caller = realtimeRouter.createCaller({ user: { sub } } as never, {
    signal: controller.signal,
  });
  const iterable = (await caller.events(input)) as AsyncIterable<unknown>;
  const iterator = iterable[Symbol.asyncIterator]();
  const out: { id: string; event: any }[] = [];
  const pump = (async () => {
    while (out.length < count) {
      const { value, done } = await iterator.next();
      if (done) break;
      const [id, event] = value as [string, unknown];
      out.push({ id, event });
    }
  })();
  // Let the stream subscribe before anything is published
  await new Promise(resolve => setTimeout(resolve, 5));
  if (during) await during();
  await Promise.race([pump, new Promise(resolve => setTimeout(resolve, 500))]);
  controller.abort();
  return out;
}

beforeEach(() => {
  fake.db.reset();
  seedPeople(fake.db);
  clearMessageCapsCache();
  Object.assign(env, { MESSAGING_ENABLED: true });
});

describe("bus (in process)", () => {
  it("delivers to every subscriber of a user and stops after unsubscribe", async () => {
    const a: unknown[] = [];
    const b: unknown[] = [];
    const offA = subscribe(MAYA, s => a.push(s));
    const offB = subscribe(MAYA, s => b.push(s));
    expect(openStreamCount()).toBeGreaterThanOrEqual(2);
    await publish(MAYA, { type: "unread.changed" });
    await publish(JORDAN, { type: "unread.changed" });
    expect(a).toHaveLength(1);
    expect(b).toHaveLength(1);
    offA();
    offA();
    await publish(MAYA, { type: "unread.changed" });
    expect(a).toHaveLength(1);
    expect(b).toHaveLength(2);
    offB();
  });
});

describe("hydrate", () => {
  it("loads and decrypts a new message for a member, and drops it for anyone else", async () => {
    friends(MAYA, JORDAN);
    const sent = await send(JORDAN, MAYA, "hello Maya");
    const signal = {
      type: "message.new" as const,
      conversationId: idToHex(sent.conversationId),
      messageId: idToHex(sent.messageId),
    };
    const forMaya = await hydrate(MAYA, signal);
    expect(forMaya).toMatchObject({
      id: idToHex(sent.messageId),
      event: {
        type: "message.new",
        folder: "PRIMARY",
        message: { body: "hello Maya", mine: false },
      },
    });
    expect((await hydrate(JORDAN, signal))?.event).toMatchObject({ message: { mine: true } });
    expect(await hydrate(SAM, signal)).toBeNull();
  });

  it("never shows a person their own typing", async () => {
    expect(
      await hydrate(MAYA, { type: "typing", conversationId: "00".repeat(16), userId: MAYA })
    ).toBeNull();
  });
});

describe("replay", () => {
  it("sends messages after lastEventId, oldest first, then unread totals", async () => {
    friends(MAYA, JORDAN);
    const first = await send(JORDAN, MAYA, "one");
    await nextMillisecond();
    const second = await send(JORDAN, MAYA, "two");
    await nextMillisecond();
    const third = await send(MAYA, JORDAN, "three");
    const events = await replay(MAYA, idToHex(first.messageId));
    expect(events.map(e => e.event.type)).toEqual(["message.new", "message.new", "unread.changed"]);
    expect(events[0].id).toBe(idToHex(second.messageId));
    expect(events[1].id).toBe(idToHex(third.messageId));
    expect(events[2].event).toMatchObject({ conversations: 1, requests: 0 });
  });

  it("skips conversations the user is not in and caps at 200 with a resync", async () => {
    friends(MAYA, JORDAN);
    friends(SAM, ANA);
    const marker = idToHex(uuidv7());
    await send(SAM, ANA, "not for Maya");
    expect((await replay(MAYA, marker)).map(e => e.event.type)).toEqual(["unread.changed"]);
    const conversationId = (await send(JORDAN, MAYA)).conversationId;
    await nextMillisecond();
    for (let i = 0; i < REPLAY_MAX + 1; i += 1) {
      fake.db.table("directMessage").push({
        id: uuidv7(),
        conversationId,
        senderId: JORDAN,
        bodyEnc: "",
        bodyLength: 0,
        unsentAt: null,
        createdAt: new Date(),
      });
    }
    expect((await replay(MAYA, marker)).map(e => e.event.type)).toEqual(["resync"]);
  });

  it("reads the time from a UUID v7", () => {
    const before = Date.now();
    const t = uuidv7Time(uuidv7());
    expect(t).toBeGreaterThanOrEqual(before);
    expect(t).toBeLessThanOrEqual(Date.now());
  });
});

describe("realtime.events", () => {
  it("streams a message to both sides as it is sent, and marks the user live", async () => {
    friends(MAYA, JORDAN);
    const got = await collect(MAYA, 2, {}, async () => {
      await messages(JORDAN).send({ to: "maya", body: "live one" });
    });
    expect(got.map(g => g.event.type)).toEqual(["message.new", "unread.changed"]);
    expect(got[0].event.message).toMatchObject({ body: "live one", mine: false });
    expect(got[1].event).toMatchObject({ conversations: 1 });
    expect(await isLive(MAYA)).toBe(true);
    const own = await collect(JORDAN, 1, {}, async () => {
      await messages(JORDAN).send({ to: "maya", body: "my other tab" });
    });
    expect(own[0].event.message).toMatchObject({ mine: true, body: "my other tab" });
  });

  it("replays after lastEventId before going live", async () => {
    friends(MAYA, JORDAN);
    const first = await send(JORDAN, MAYA, "seen");
    await nextMillisecond();
    await send(JORDAN, MAYA, "missed");
    const got = await collect(MAYA, 2, { lastEventId: idToHex(first.messageId) });
    expect(got[0].event.message.body).toBe("missed");
    expect(got[1].event.type).toBe("unread.changed");
  });

  it("unsubscribes when the client goes away", async () => {
    const before = openStreamCount();
    await collect(SAM, 1);
    await new Promise(resolve => setTimeout(resolve, 5));
    expect(openStreamCount()).toBe(before);
  });
});

describe("after commit publishes", () => {
  it("unsend reaches both sides", async () => {
    friends(MAYA, JORDAN);
    const sent = await messages(JORDAN).send({ to: "maya", body: "oops" });
    const got = await collect(MAYA, 1, {}, async () => {
      await messages(JORDAN).unsend({ messageId: sent.messageId });
    });
    expect(got[0].event).toMatchObject({ type: "message.unsent", messageId: sent.messageId });
  });

  it("a read reaches the sender only when both keep receipts on", async () => {
    friends(MAYA, JORDAN);
    const sent = await messages(JORDAN).send({ to: "maya", body: "read me" });
    const on = await collect(JORDAN, 1, {}, async () => {
      await messages(MAYA).read({ conversationId: sent.conversationId, messageId: sent.messageId });
    });
    expect(on[0].event).toMatchObject({ type: "conversation.read", messageId: sent.messageId });
    await messages(MAYA).settings.set({ ruleKind: "FOLLOWER", readReceipts: false });
    const off = await collect(JORDAN, 1, {}, async () => {
      await messages(MAYA).read({ conversationId: sent.conversationId, messageId: sent.messageId });
    });
    expect(off).toHaveLength(0);
  });

  it("a request sender never learns the request was opened or deleted", async () => {
    fake.db
      .table("messagingSettings")
      .push({ userId: MAYA, ruleKind: "ANYONE", readReceipts: true });
    const sent = await messages(JORDAN).send({ to: "maya", body: "hi stranger" });
    expect(sent.folder).toBe("REQUESTS");
    const got = await collect(JORDAN, 1, {}, async () => {
      await messages(MAYA).read({ conversationId: sent.conversationId });
      await messages(MAYA).deleteRequest({ conversationId: sent.conversationId });
    });
    expect(got).toHaveLength(0);
  });

  it("accepting tells both sides; blocking tells only the blocker", async () => {
    fake.db
      .table("messagingSettings")
      .push({ userId: MAYA, ruleKind: "ANYONE", readReceipts: true });
    const sent = await messages(JORDAN).send({ to: "maya", body: "hi" });
    const accepted = await collect(JORDAN, 1, {}, async () => {
      await messages(MAYA).accept({ conversationId: sent.conversationId });
    });
    expect(accepted[0].event).toMatchObject({ type: "conversation.updated", change: "accepted" });
    const blocked = await collect(JORDAN, 1, {}, async () => {
      await messages(MAYA).block({ conversationId: sent.conversationId });
    });
    expect(blocked).toHaveLength(0);
  });
});

describe("realtime.typing", () => {
  it("reaches the other member once per 3 seconds, never a request or a block", async () => {
    friends(MAYA, JORDAN);
    const sent = await messages(JORDAN).send({ to: "maya", body: "hi" });
    const typing = realtimeRouter.createCaller({ user: { sub: JORDAN } } as never);
    const got = await collect(MAYA, 1, {}, async () => {
      expect(await typing.typing({ conversationId: sent.conversationId })).toEqual({ sent: true });
      expect(await typing.typing({ conversationId: sent.conversationId })).toEqual({ sent: false });
    });
    expect(got[0].event).toMatchObject({ type: "typing", userId: JORDAN, seconds: 6 });
    const stranger = realtimeRouter.createCaller({ user: { sub: SAM } } as never);
    expect(await stranger.typing({ conversationId: sent.conversationId })).toEqual({ sent: false });
  });

  it("stays quiet in an unaccepted request", async () => {
    fake.db
      .table("messagingSettings")
      .push({ userId: MAYA, ruleKind: "ANYONE", readReceipts: true });
    const sent = await messages(SAM).send({ to: "maya", body: "hi" });
    const typing = realtimeRouter.createCaller({ user: { sub: SAM } } as never);
    expect(await typing.typing({ conversationId: sent.conversationId })).toEqual({ sent: false });
  });
});
