import webpush from "web-push";
import { prisma } from "@repo/database";
import { env } from "../../env";
import { uuidv7 } from "../../utils/uuid-v7";

/**
 * Web Push (Build Board #2 r4, PR M4, spec 7.4 item 2). One subscription per device; the
 * subscription itself is the device level consent. A 404 or 410 from the push service
 * deletes it. Payloads are small JSON the service worker turns into a notification.
 */

export type PushPayload = {
  title: string;
  body: string;
  /** App path the tap opens, for example /inbox/{conversationId} */
  url: string;
  /** Same tag replaces the earlier notification for that conversation on the device */
  tag: string;
};

let configured: boolean | null = null;

export function pushConfigured(): boolean {
  if (configured !== null) return configured;
  configured = env.VAPID_PUBLIC_KEY.length > 0 && env.VAPID_PRIVATE_KEY.length > 0;
  if (configured) {
    try {
      webpush.setVapidDetails(env.VAPID_SUBJECT, env.VAPID_PUBLIC_KEY, env.VAPID_PRIVATE_KEY);
    } catch (error) {
      console.error("[push] VAPID keys rejected:", (error as Error).message);
      configured = false;
    }
  }
  return configured;
}

/** For tests that change the env. */
export function resetPushConfigForTests() {
  configured = null;
}

export function vapidPublicKey(): string | null {
  return pushConfigured() ? env.VAPID_PUBLIC_KEY : null;
}

export type SubscriptionInput = {
  endpoint: string;
  keys: { p256dh: string; auth: string };
  userAgent?: string | null;
};

/** Save or move a device subscription to this account (a shared device follows the login). */
export async function saveSubscription(userId: number, input: SubscriptionInput) {
  const data = {
    userId,
    p256dh: input.keys.p256dh,
    auth: input.keys.auth,
    userAgent: input.userAgent?.slice(0, 255) ?? null,
    failedAt: null,
  };
  await prisma.pushSubscription.upsert({
    where: { endpoint: input.endpoint },
    create: { id: uuidv7(), endpoint: input.endpoint, ...data },
    update: data,
  });
}

export async function removeSubscription(userId: number, endpoint: string) {
  await prisma.pushSubscription.deleteMany({ where: { userId, endpoint } });
}

export async function hasSubscription(userId: number): Promise<boolean> {
  return (await prisma.pushSubscription.count({ where: { userId } })) > 0;
}

export type PushResult = { sent: number; removed: number; failed: number };

/** Send to every device of `userId`. Throws only when every device failed for a retryable reason. */
export async function sendPush(userId: number, payload: PushPayload): Promise<PushResult> {
  const result: PushResult = { sent: 0, removed: 0, failed: 0 };
  if (!pushConfigured()) return result;
  const subscriptions = await prisma.pushSubscription.findMany({ where: { userId } });
  const body = JSON.stringify(payload);
  for (const sub of subscriptions) {
    try {
      await webpush.sendNotification(
        { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
        body,
        {
          TTL: 60 * 60,
          urgency: "high",
          topic: payload.tag.replace(/[^A-Za-z0-9_-]/g, "").slice(-32),
        }
      );
      result.sent += 1;
    } catch (error) {
      const status = (error as { statusCode?: number }).statusCode;
      if (status === 404 || status === 410) {
        await prisma.pushSubscription.delete({ where: { id: sub.id } }).catch(() => undefined);
        result.removed += 1;
      } else {
        await prisma.pushSubscription
          .update({ where: { id: sub.id }, data: { failedAt: new Date() } })
          .catch(() => undefined);
        result.failed += 1;
      }
    }
  }
  if (result.failed > 0 && result.sent === 0) {
    throw new Error(`push failed on ${result.failed} device(s)`);
  }
  return result;
}
