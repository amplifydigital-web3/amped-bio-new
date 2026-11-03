/**
 * Amped Messages notifications (Build Board #2 r4, PR M4; spec 7.4). Bell rows and the
 * bell routes, push scheduling and previews (requests and 18+ senders hide the text),
 * dead subscriptions removed, the 30 minute email check with its limits, the signed
 * one tap off link, the job claim and retries, and broadcast bell rows. Also the push
 * endpoint allowlist (SSRF), the race safe email dedupe and the per process job lock.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const fake = vi.hoisted(() => ({ db: null as any }));
const pushes = vi.hoisted(() => ({ sent: [] as any[], fail: null as null | number }));
const mails = vi.hoisted(() => ({ sent: [] as any[] }));
const redisMock = vi.hoisted(() => ({ client: null as any }));
vi.mock("@repo/database", async () => {
  const helper = await import("./helpers/fakeMessagingDb");
  fake.db = helper.createFakeDb();
  return {
    prisma: fake.db.client,
    Prisma: helper.fakePrismaNamespace,
    withNumericIdCoercion: (client: unknown) => client,
  };
});
vi.mock("../utils/cache", () => ({ getRedisClient: () => redisMock.client }));
vi.mock("web-push", () => ({
  default: {
    setVapidDetails: () => undefined,
    sendNotification: async (sub: any, body: string) => {
      if (pushes.fail) throw Object.assign(new Error("push"), { statusCode: pushes.fail });
      pushes.sent.push({ endpoint: sub.endpoint, ...JSON.parse(body) });
      return { statusCode: 201 };
    },
  },
}));
vi.mock("../utils/email/transport", () => ({
  deliverEmail: async (email: any) => {
    mails.sent.push(email);
    return { transport: "smtp", id: "x", detail: null };
  },
}));
vi.mock("../utils/fileUrlResolver", () => ({ getFileUrl: async () => null }));

import { env } from "../env";
import { idToHex } from "../services/analytics/ids";
import { clearMessageCapsCache } from "../services/messaging/caps";
import { clearPresenceForTests, touchPresence } from "../services/realtime/bus";
import {
  emailOffToken,
  emailOffUrl,
  listBell,
  readEmailOffToken,
} from "../services/notifications/bell";
import {
  JOB_MAX_ATTEMPTS,
  LOCK_OWNER,
  claimNextJob,
  drainJobs,
  holdNotificationLock,
  notifyBroadcastDelivered,
  runEmailCheck,
  scheduleMessageNotifications,
} from "../services/notifications/jobs";
import {
  isAllowedPushEndpoint,
  resetPushConfigForTests,
  sendPush,
} from "../services/notifications/push";
import { messagesRouter } from "../trpc/messages";
import { notificationsRouter } from "../trpc/notifications";
import { pushRouter } from "../trpc/push";
import { uuidv7 } from "../utils/uuid-v7";
import { ANA, JORDAN, MAYA, SAM, seedPeople } from "./helpers/messagingFixtures";

const messages = (sub: number) => messagesRouter.createCaller({ user: { sub } } as never);
const bell = (sub: number) => notificationsRouter.createCaller({ user: { sub } } as never);
const push = (sub: number) => pushRouter.createCaller({ user: { sub } } as never);
const friends = (a: number, b: number) => {
  fake.db.table("follow").push({ id: a * 100 + b, follower_id: a, creator_id: b });
  fake.db.table("follow").push({ id: b * 100 + a, follower_id: b, creator_id: a });
};
const jobs = (channel?: string) =>
  fake.db.table("notificationJob").filter((j: any) => !channel || j.channel === channel);
const device = (userId: number, n = 1) =>
  push(userId).subscribe({
    endpoint: `https://fcm.googleapis.com/fcm/send/${userId}-${n}`,
    keys: { p256dh: "p".repeat(40), auth: "a".repeat(16) },
  });
const later = (minutes: number) => new Date(Date.now() + minutes * 60_000);

beforeEach(() => {
  fake.db.reset();
  seedPeople(fake.db);
  for (const u of fake.db.table("user")) u.email = `${u.handle}@example.com`;
  clearMessageCapsCache();
  pushes.sent = [];
  pushes.fail = null;
  mails.sent = [];
  redisMock.client = null;
  Object.assign(env, {
    MESSAGING_ENABLED: true,
    VAPID_PUBLIC_KEY: "BPublicKeyForTests",
    VAPID_PRIVATE_KEY: "privateKeyForTests",
    API_HOST: "api.staging.amped.bio",
    APP_URL: "https://app.staging.amped.bio",
  });
  resetPushConfigForTests();
  clearPresenceForTests();
});

describe("bell", () => {
  it("collapses a conversation into one row, lists it with the sender, and marks seen", async () => {
    friends(MAYA, JORDAN);
    await messages(JORDAN).send({ to: "maya", body: "one" });
    await messages(JORDAN).send({ to: "maya", body: "two" });
    const items = await bell(MAYA).list();
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      kind: "MESSAGE",
      count: 2,
      seen: false,
      actor: { id: JORDAN, handle: "jordan" },
    });
    expect(await bell(MAYA).unseenCount()).toEqual({ count: 1 });
    await bell(MAYA).markSeen();
    expect(await bell(MAYA).unseenCount()).toEqual({ count: 0 });
    await messages(JORDAN).send({ to: "maya", body: "three" });
    expect(await bell(MAYA).list()).toHaveLength(2);
  });

  it("message preferences default on and save", async () => {
    expect(await bell(MAYA).messagePrefs()).toEqual({ push: true, email: true });
    expect(await bell(MAYA).setMessagePrefs({ email: false })).toEqual({
      push: true,
      email: false,
    });
  });
});

describe("push", () => {
  it("exposes the public key only when VAPID is set", async () => {
    expect(await push(MAYA).publicKey()).toEqual({ key: "BPublicKeyForTests" });
    Object.assign(env, { VAPID_PUBLIC_KEY: "" });
    resetPushConfigForTests();
    expect(await push(MAYA).publicKey()).toEqual({ key: null });
  });

  it("queues a push only for a device with the app closed, then sends the preview", async () => {
    friends(MAYA, JORDAN);
    await messages(JORDAN).send({ to: "maya", body: "no device yet" });
    expect(jobs("push")).toHaveLength(0);
    await device(MAYA);
    await messages(JORDAN).send({ to: "maya", body: "x".repeat(120) });
    expect(jobs("push")).toHaveLength(1);
    await drainJobs();
    expect(pushes.sent).toHaveLength(1);
    expect(pushes.sent[0]).toMatchObject({ title: "@jordan" });
    expect(pushes.sent[0].body).toHaveLength(80);
    expect(pushes.sent[0].url).toMatch(/^\/inbox\/[0-9a-f]{32}$/);
    await touchPresence(MAYA);
    await messages(JORDAN).send({ to: "maya", body: "app is open" });
    expect(jobs("push")).toHaveLength(1);
  });

  it("hides the text for a request and for an 18+ sender", async () => {
    fake.db
      .table("messagingSettings")
      .push({ userId: MAYA, ruleKind: "ANYONE", readReceipts: true });
    await device(MAYA);
    await messages(SAM).send({ to: "maya", body: "secret request text" });
    friends(MAYA, ANA);
    fake.db.table("block").push({ id: 1, user_id: ANA, type: "link", config: { adult: true } });
    await messages(ANA).send({ to: "maya", body: "adult page text" });
    await drainJobs();
    expect(pushes.sent.map(p => p.body)).toEqual(["Sent you a message", "Sent you a message"]);
  });

  it("sends nothing when muted, read already, or push is off", async () => {
    friends(MAYA, JORDAN);
    await device(MAYA);
    const sent = await messages(JORDAN).send({ to: "maya", body: "read fast" });
    await messages(MAYA).read({ conversationId: sent.conversationId });
    await drainJobs();
    expect(pushes.sent).toHaveLength(0);
    await bell(MAYA).setMessagePrefs({ push: false });
    await messages(JORDAN).send({ to: "maya", body: "push off" });
    await messages(MAYA).mute({ conversationId: sent.conversationId, hours: 8 });
    await messages(JORDAN).send({ to: "maya", body: "muted" });
    expect(jobs("push").filter((j: any) => j.status === "PENDING")).toHaveLength(0);
  });

  it("deletes a subscription the push service reports gone", async () => {
    friends(MAYA, JORDAN);
    await device(MAYA);
    pushes.fail = 410;
    await messages(JORDAN).send({ to: "maya", body: "to a dead device" });
    await drainJobs();
    expect(fake.db.table("pushSubscription")).toHaveLength(0);
    expect(jobs("push")[0]).toMatchObject({ status: "DONE", error: "no_device" });
  });

  it("accepts only real push service endpoints (SSRF)", () => {
    for (const ok of [
      "https://fcm.googleapis.com/fcm/send/abc:def",
      "https://android.googleapis.com/gcm/send/abc",
      "https://updates.push.services.mozilla.com/wpush/v2/gAAAA",
      "https://web.push.apple.com/QGuQyavXu",
      "https://api.push.apple.com/3/device/abc",
      "https://wns2-par02p.notify.windows.com/w/?token=abc",
      "https://FCM.googleapis.com/fcm/send/upper",
    ]) {
      expect(isAllowedPushEndpoint(ok), ok).toBe(true);
    }
    for (const bad of [
      "http://fcm.googleapis.com/fcm/send/abc",
      "https://fcm.googleapis.com:8443/fcm/send/abc",
      "https://user:pass@fcm.googleapis.com/fcm/send/abc",
      "https://fcm.googleapis.com./fcm/send/abc",
      "https://fcm.googleapis.com.evil.example/fcm/send/abc",
      "https://evilfcm.googleapis.com/fcm/send/abc",
      "https://push.apple.com/abc",
      "https://notify.windows.com.attacker.io/abc",
      "https://push.example.com/1/1",
      "https://localhost/push",
      "https://127.0.0.1/push",
      "https://169.254.169.254/latest/meta-data",
      "https://[::1]/push",
      "https://10.0.0.5/push",
      "not a url",
    ]) {
      expect(isAllowedPushEndpoint(bad), bad).toBe(false);
    }
  });

  it("refuses to save a subscription for an unknown host", async () => {
    for (const endpoint of [
      "https://169.254.169.254/latest/meta-data",
      "https://internal.example.com/hook",
      "https://localhost:3000/api",
    ]) {
      await expect(
        push(MAYA).subscribe({
          endpoint,
          keys: { p256dh: "p".repeat(40), auth: "a".repeat(16) },
        })
      ).rejects.toThrow();
    }
    expect(fake.db.table("pushSubscription")).toHaveLength(0);
  });

  it("never posts to a stored endpoint outside the allowlist", async () => {
    fake.db.table("pushSubscription").push({
      id: uuidv7(),
      userId: MAYA,
      endpoint: "https://10.0.0.5/internal",
      p256dh: "p".repeat(40),
      auth: "a".repeat(16),
      userAgent: null,
      failedAt: null,
    });
    const result = await sendPush(MAYA, { title: "t", body: "b", url: "/inbox", tag: "x" });
    expect(result).toEqual({ sent: 0, removed: 1, failed: 0 });
    expect(pushes.sent).toHaveLength(0);
    expect(fake.db.table("pushSubscription")).toHaveLength(0);
  });

  it("retries a failing push service, then gives up", async () => {
    friends(MAYA, JORDAN);
    await device(MAYA);
    pushes.fail = 500;
    await messages(JORDAN).send({ to: "maya", body: "flaky" });
    for (let i = 0; i < JOB_MAX_ATTEMPTS; i += 1) {
      const job = jobs("push")[0];
      job.runAfter = new Date(0);
      await drainJobs();
    }
    expect(jobs("push")[0]).toMatchObject({ status: "FAILED", attempts: JOB_MAX_ATTEMPTS });
  });
});

describe("email reminders", () => {
  it("queues one check per conversation and sends after 30 minutes if still unread", async () => {
    friends(MAYA, JORDAN);
    await messages(JORDAN).send({ to: "maya", body: "one" });
    await messages(JORDAN).send({ to: "maya", body: "two" });
    expect(jobs("email")).toHaveLength(1);
    expect(await drainJobs(50, new Date())).toBe(0);
    await drainJobs(50, later(31));
    expect(mails.sent).toHaveLength(1);
    expect(mails.sent[0]).toMatchObject({
      to: ["maya@example.com"],
      subject: "New message from @jordan",
    });
    expect(mails.sent[0].html).not.toContain("two");
    expect(mails.sent[0].html).toContain("api.staging.amped.bio/email/messages-off?t=");
  });

  it("keeps one pending check per conversation when messages arrive at once", async () => {
    const conversationId = uuidv7();
    const schedule = () =>
      scheduleMessageNotifications({
        senderId: JORDAN,
        recipientId: MAYA,
        conversationId,
        messageId: uuidv7(),
        notificationId: null,
        muted: false,
      });
    await Promise.all([schedule(), schedule(), schedule()]);
    expect(jobs("email")).toHaveLength(1);
    expect(jobs("email")[0].dedupeKey).toBe(`email:${MAYA}:${idToHex(conversationId)}`);

    // Once the loop claims it, the slot is free for the next message
    expect(await claimNextJob(later(31))).not.toBeNull();
    expect(jobs("email")[0].dedupeKey).toBeNull();
    await schedule();
    expect(jobs("email")).toHaveLength(2);
  });

  it("skips when read, and labels a request without the sender's text", async () => {
    friends(MAYA, JORDAN);
    const sent = await messages(JORDAN).send({ to: "maya", body: "hi" });
    await messages(MAYA).read({ conversationId: sent.conversationId });
    await drainJobs(50, later(31));
    expect(mails.sent).toHaveLength(0);
    expect(jobs("email")[0]).toMatchObject({ status: "DONE", error: "read" });

    fake.db
      .table("messagingSettings")
      .push({ userId: ANA, ruleKind: "ANYONE", readReceipts: true });
    await messages(SAM).send({ to: "ana", body: "stranger text" });
    await drainJobs(50, later(31));
    expect(mails.sent[0].subject).toBe("You have a message request on Amped.Bio");
    expect(mails.sent[0].html).not.toContain("stranger text");
  });

  it("holds to one per conversation every 6 hours and 3 a day", async () => {
    friends(MAYA, JORDAN);
    const payload = (conversationId: string) => ({
      conversationId,
      messageId: idToHex(uuidv7()),
      senderId: JORDAN,
    });
    const sent = await messages(JORDAN).send({ to: "maya", body: "hi" });
    await drainJobs(50, later(31));
    expect(await runEmailCheck(MAYA, payload(sent.conversationId), later(60))).toBe(
      "conversation_limit"
    );
    for (const other of [SAM, ANA]) {
      friends(MAYA, other);
      await messages(other).send({ to: "maya", body: "hi" });
    }
    await drainJobs(50, later(31));
    expect(mails.sent).toHaveLength(3);
    fake.db.table("user").push({
      id: 9,
      name: "Lee",
      handle: "lee",
      block: "no",
      email_verified: true,
      created_at: new Date("2026-01-01T00:00:00Z"),
    });
    friends(MAYA, 9);
    const fourth = await messages(9).send({ to: "maya", body: "fourth" });
    expect(await runEmailCheck(MAYA, payload(fourth.conversationId), later(31))).toBe(
      "daily_limit"
    );
  });

  it("the footer link shows a button, and only the POST turns emails off", async () => {
    const token = emailOffToken(MAYA);
    expect(readEmailOffToken(token)).toBe(MAYA);
    expect(readEmailOffToken(`${JORDAN}.${token.split(".")[1]}`)).toBeNull();
    expect(readEmailOffToken("1.bad")).toBeNull();
    expect(emailOffUrl(MAYA)).toBe(
      `https://api.staging.amped.bio/email/messages-off?t=${encodeURIComponent(token)}`
    );
    const { default: router } = await import("../routes/messageEmail");
    const express = (await import("express")).default;
    const app = express();
    app.use(express.urlencoded({ extended: false }));
    app.use("/email", router);
    const server = app.listen(0);
    const port = (server.address() as { port: number }).port;
    try {
      const get = await fetch(`http://127.0.0.1:${port}/email/messages-off?t=${token}`);
      expect(get.status).toBe(200);
      expect(await get.text()).toContain("Turn off message emails");
      expect(await bell(MAYA).messagePrefs()).toEqual({ push: true, email: true });
      const post = await fetch(`http://127.0.0.1:${port}/email/messages-off`, {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: `t=${encodeURIComponent(token)}`,
      });
      expect(post.status).toBe(200);
      expect(await bell(MAYA).messagePrefs()).toEqual({ push: true, email: false });
      const bad = await fetch(`http://127.0.0.1:${port}/email/messages-off?t=nope`);
      expect(bad.status).toBe(400);
    } finally {
      server.close();
    }
  });
});

describe("job claim", () => {
  it("a claimed job is not claimed again until it goes stale", async () => {
    fake.db.table("notificationJob").push({
      id: uuidv7(),
      channel: "email",
      userId: MAYA,
      payload: {},
      status: "PENDING",
      attempts: 0,
      runAfter: new Date(0),
      claimedAt: null,
    });
    expect(await claimNextJob()).not.toBeNull();
    expect(await claimNextJob()).toBeNull();
    expect(await claimNextJob(later(3))).not.toBeNull();
  });
});

describe("job lock", () => {
  it("uses a random owner per process, not the pid", () => {
    expect(LOCK_OWNER).not.toBe(String(process.pid));
    expect(LOCK_OWNER).toMatch(/:[0-9a-f-]{36}$/);
  });

  it("runs without Redis, holds or refreshes its own lock, and fails closed on errors", async () => {
    expect(await holdNotificationLock()).toBe(true);

    const store = new Map<string, string>();
    redisMock.client = {
      set: async (key: string, value: string) => {
        if (store.has(key)) return null;
        store.set(key, value);
        return "OK";
      },
      eval: async (_script: string, _keys: number, key: string, owner: string) =>
        store.get(key) === owner ? 1 : 0,
    };
    expect(await holdNotificationLock()).toBe(true);
    expect(store.get("lock:notification-loop")).toBe(LOCK_OWNER);
    expect(await holdNotificationLock()).toBe(true);
    store.set("lock:notification-loop", "other-container:1:uuid");
    expect(await holdNotificationLock()).toBe(false);

    redisMock.client = {
      set: async () => {
        throw new Error("connection is closed");
      },
      eval: async () => 1,
    };
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    expect(await holdNotificationLock()).toBe(false);
    warn.mockRestore();
  });
});

describe("broadcast bell rows", () => {
  it("adds one row per recipient once, and queues pushes for devices", async () => {
    fake.db.table("broadcast").push({ id: 5, creatorUserId: MAYA, title: "New drop" });
    for (const userId of [JORDAN, SAM])
      fake.db.table("broadcastDelivery").push({ broadcastId: 5, userId });
    await device(JORDAN);
    expect(await notifyBroadcastDelivered(5)).toBe(2);
    expect(await notifyBroadcastDelivered(5)).toBe(0);
    const items = await listBell(JORDAN);
    expect(items[0]).toMatchObject({ kind: "BROADCAST", broadcastId: 5, actor: { id: MAYA } });
    await drainJobs();
    expect(pushes.sent).toEqual([
      expect.objectContaining({ title: "@maya", body: "New broadcast: New drop", tag: "bc-5" }),
    ]);
  });
});
