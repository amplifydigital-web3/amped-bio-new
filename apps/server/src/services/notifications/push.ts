import { isIP } from "node:net";
import webpush from "web-push";
import { z } from "zod";
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

// ------------------------------------------------------------------ endpoint allowlist

/**
 * Push services we deliver to. The server POSTs to the stored endpoint, so an open
 * https:// URL would let any signed in account make the server call any host (SSRF).
 * Exact hosts, or a suffix that starts with a dot (any subdomain of it).
 *
 * - fcm.googleapis.com: Chrome, Edge on Android, Opera, Samsung Internet, Brave, Vivaldi
 * - android.googleapis.com: legacy GCM endpoints still held by old Chrome subscriptions
 * - updates.push.services.mozilla.com: Firefox
 * - web.push.apple.com and *.push.apple.com: Safari 16+ and iOS 16.4+ home screen apps
 * - *.notify.windows.com: Edge and other Chromium browsers on Windows (WNS)
 */
export const PUSH_SERVICE_HOSTS = [
  "fcm.googleapis.com",
  "android.googleapis.com",
  "updates.push.services.mozilla.com",
  "web.push.apple.com",
  ".push.apple.com",
  ".notify.windows.com",
] as const;

/** True when `endpoint` is an https URL on a known push service, with no port or credentials. */
export function isAllowedPushEndpoint(endpoint: string): boolean {
  let url: URL;
  try {
    url = new URL(endpoint);
  } catch {
    return false;
  }
  if (url.protocol !== "https:" || url.port !== "" || url.username || url.password) return false;
  const host = url.hostname.toLowerCase();
  // IP literals (v4, or v6 in brackets), localhost and trailing dot forms never match
  if (!host || host.endsWith(".") || isIP(host.replace(/^\[|\]$/g, "")) !== 0) return false;
  if (host === "localhost" || host.endsWith(".localhost")) return false;
  return PUSH_SERVICE_HOSTS.some(allowed =>
    allowed.startsWith(".")
      ? host.endsWith(allowed) && host.length > allowed.length
      : host === allowed
  );
}

export const pushEndpointSchema = z
  .string()
  .max(512)
  .url()
  .refine(isAllowedPushEndpoint, { message: "Unsupported push service" });

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
  if (!isAllowedPushEndpoint(input.endpoint)) throw new Error("Unsupported push service");
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

const PUSH_TIMEOUT_MS = 10_000;

export type PushResult = { sent: number; removed: number; failed: number };

/** Send to every device of `userId`. Throws only when every device failed for a retryable reason. */
export async function sendPush(userId: number, payload: PushPayload): Promise<PushResult> {
  const result: PushResult = { sent: 0, removed: 0, failed: 0 };
  if (!pushConfigured()) return result;
  const subscriptions = await prisma.pushSubscription.findMany({ where: { userId } });
  const body = JSON.stringify(payload);
  for (const sub of subscriptions) {
    // Rows saved before the allowlist, or edited by hand: never POST to an unknown host
    if (!isAllowedPushEndpoint(sub.endpoint)) {
      await prisma.pushSubscription.delete({ where: { id: sub.id } }).catch(() => undefined);
      result.removed += 1;
      continue;
    }
    try {
      await webpush.sendNotification(
        { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
        body,
        {
          TTL: 60 * 60,
          // A push service that never answers must not hold the job loop
          timeout: PUSH_TIMEOUT_MS,
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
