import Redis from "ioredis";
import { EventEmitter } from "node:events";
import { env } from "../../env";
import { getRedisClient } from "../../utils/cache";

/**
 * Realtime bus (Build Board #2 r4, PR M3, spec 7.3 item 1). One Redis pub/sub channel per
 * user, `rt:u:{userId}`. Publish is best effort: the database is the record, and a
 * client that misses an event catches up through replay on reconnect.
 *
 * Signals carry ids only, never message text. The stream that receives a signal loads
 * and decrypts what it needs for its own user, so plaintext never crosses Redis.
 *
 * Each server instance holds one subscriber connection and subscribes to a user's
 * channel while at least one of that user's streams is open on the instance. Without
 * Redis the bus is in process only, which is enough for one instance and for tests.
 */

export type RealtimeSignal =
  | { type: "message.new"; conversationId: string; messageId: string }
  | { type: "message.unsent"; conversationId: string; messageId: string }
  | { type: "conversation.read"; conversationId: string; messageId: string | null; at: string }
  | { type: "conversation.updated"; conversationId: string; change: ConversationChange }
  | { type: "typing"; conversationId: string; userId: number }
  | { type: "notification.new"; notificationId: string }
  | { type: "unread.changed" };

export type ConversationChange =
  | "accepted"
  | "deleted"
  | "read"
  | "cleared"
  | "muted"
  | "unmuted"
  | "archived"
  | "unarchived"
  | "blocked"
  | "unblocked";

export const channelOf = (userId: number) => `rt:u:${userId}`;

type Handler = (signal: RealtimeSignal) => void;

const local = new EventEmitter();
local.setMaxListeners(0);

let subscriber: Redis | null = null;
let subscriberFailed = false;
const counts = new Map<number, number>();

function getSubscriber(): Redis | null {
  if (subscriber || subscriberFailed) return subscriber;
  const publisher = getRedisClient();
  if (!publisher) {
    subscriberFailed = true;
    return null;
  }
  try {
    // A connection in subscribe mode can run no other command, so it is its own client.
    // It reconnects (unlike the cache client) because a stream outlives one blip.
    subscriber = new Redis({
      host: env.REDIS_HOST,
      port: env.REDIS_PORT,
      password: env.REDIS_PASSWORD || undefined,
      tls: env.REDIS_TLS ? {} : undefined,
      maxRetriesPerRequest: null,
      retryStrategy: times => Math.min(times * 500, 5000),
      connectTimeout: 3000,
    });
    subscriber.on("message", (channel: string, raw: string) => {
      try {
        local.emit(channel, JSON.parse(raw) as RealtimeSignal);
      } catch {
        // A malformed signal is dropped; replay covers anything that mattered
      }
    });
    subscriber.on("error", error => {
      console.warn("[realtime] subscriber error:", (error as Error).message);
    });
  } catch (error) {
    console.error("[realtime] subscriber init failed:", error);
    subscriberFailed = true;
    subscriber = null;
  }
  return subscriber;
}

/** Send one signal to every open stream of `userId`, on any instance. Never throws. */
export async function publish(userId: number, signal: RealtimeSignal): Promise<void> {
  const channel = channelOf(userId);
  const redis = getRedisClient();
  if (redis && getSubscriber()) {
    try {
      await redis.publish(channel, JSON.stringify(signal));
      return;
    } catch (error) {
      console.warn("[realtime] publish failed, local only:", (error as Error).message);
    }
  }
  local.emit(channel, signal);
}

/** Publish to several users; duplicates are sent once. */
export async function publishMany(userIds: number[], signal: RealtimeSignal): Promise<void> {
  await Promise.all([...new Set(userIds)].map(id => publish(id, signal)));
}

/** Listen to `userId`'s channel on this instance. Returns the unsubscribe function. */
export function subscribe(userId: number, handler: Handler): () => void {
  const channel = channelOf(userId);
  local.on(channel, handler);
  const n = (counts.get(userId) ?? 0) + 1;
  counts.set(userId, n);
  if (n === 1) {
    getSubscriber()
      ?.subscribe(channel)
      .catch(error => console.warn("[realtime] subscribe failed:", (error as Error).message));
  }
  let done = false;
  return () => {
    if (done) return;
    done = true;
    local.off(channel, handler);
    const left = (counts.get(userId) ?? 1) - 1;
    if (left > 0) {
      counts.set(userId, left);
      return;
    }
    counts.delete(userId);
    subscriber?.unsubscribe(channel).catch(() => undefined);
  };
}

// ------------------------------------------------------------------ presence

const PRESENCE_TTL_SECONDS = 60;
const localPresence = new Map<number, number>();

/**
 * Mark `userId` as having a live stream for the next minute. Streams refresh it on
 * every ping. M4 reads `isLive` to skip a push when the app is open.
 */
export async function touchPresence(userId: number): Promise<void> {
  localPresence.set(userId, Date.now() + PRESENCE_TTL_SECONDS * 1000);
  const redis = getRedisClient();
  if (!redis) return;
  try {
    await redis.set(`rt:on:${userId}`, "1", "EX", PRESENCE_TTL_SECONDS);
  } catch {
    // Presence is a hint; a miss only means one extra push
  }
}

export async function isLive(userId: number): Promise<boolean> {
  const redis = getRedisClient();
  if (redis) {
    try {
      return (await redis.exists(`rt:on:${userId}`)) === 1;
    } catch {
      // Fall back to this instance's view
    }
  }
  return (localPresence.get(userId) ?? 0) > Date.now();
}

/** Open streams on this instance, for the admin health strip (M7). */
export function openStreamCount(): number {
  let total = 0;
  for (const n of counts.values()) total += n;
  return total;
}
