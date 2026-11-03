import { tracked } from "@trpc/server";
import { z } from "zod";
import { prisma } from "@repo/database";
import { MESSAGE_LIMITS } from "@repo/constants";
import { privateProcedure, router } from "./trpc";
import { hexToId, idToHex } from "../services/analytics/ids";
import { hitRateLimit } from "../utils/rateLimit";
import { publish, subscribe, touchPresence, type RealtimeSignal } from "../services/realtime/bus";
import { hydrate, replay, type IdentifiedEvent } from "../services/realtime/stream";

/**
 * realtime.* (Build Board #2 r4, PR M3, spec 7.3). One SSE stream per open app tab over
 * the httpSubscriptionLink already in packages/ui/src/trpc.ts. Auth is the session
 * cookie, like every private procedure. tRPC pings on the shared sse config.
 */

/** Refresh presence this often while a stream is open (TTL 60 s). */
const PRESENCE_EVERY_MS = 25_000;

const hexId = z.string().regex(/^[0-9a-f]{32}$/);

/**
 * Turns pushed signals into an async iterator. Signals that arrive before replay ends
 * wait in the queue, so nothing is lost between subscribe and replay.
 */
function signalQueue(signal: AbortSignal | undefined) {
  const items: RealtimeSignal[] = [];
  let wake: (() => void) | null = null;
  signal?.addEventListener("abort", () => wake?.(), { once: true });
  const push = (s: RealtimeSignal) => {
    items.push(s);
    wake?.();
  };
  const next = async (): Promise<RealtimeSignal | null> => {
    while (!items.length) {
      if (signal?.aborted) return null;
      await new Promise<void>(resolve => {
        wake = resolve;
      });
      wake = null;
    }
    return items.shift() ?? null;
  };
  return { push, next };
}

export const realtimeRouter = router({
  /**
   * The event stream. On reconnect tRPC sends the last tracked id as lastEventId; the
   * server subscribes first, then replays what was missed, then streams live.
   */
  events: privateProcedure
    .input(z.object({ lastEventId: hexId.nullish() }).optional())
    .subscription(async function* ({ ctx, input, signal }) {
      const userId = ctx.user!.sub;
      const queue = signalQueue(signal);
      const unsubscribe = subscribe(userId, queue.push);
      await touchPresence(userId);
      const presence = setInterval(() => void touchPresence(userId), PRESENCE_EVERY_MS);
      const sent = new Set<string>();
      const emit = (item: IdentifiedEvent) => {
        sent.add(item.id);
        if (sent.size > 1000) sent.delete(sent.values().next().value as string);
        return tracked(item.id, item.event);
      };

      try {
        if (input?.lastEventId) {
          for (const item of await replay(userId, input.lastEventId)) yield emit(item);
        }
        while (!signal?.aborted) {
          const next = await queue.next();
          if (!next) break;
          const item = await hydrate(userId, next);
          // A message replayed above may also arrive live: send it once
          if (item && !sent.has(item.id)) yield emit(item);
        }
      } finally {
        clearInterval(presence);
        unsubscribe();
      }
    }),

  /**
   * "Typing…" for the other member (spec 7.3 item 5). At most one every 3 s per
   * conversation; extra calls are dropped quietly. Published only, never stored.
   */
  typing: privateProcedure
    .input(z.object({ conversationId: hexId }))
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.user!.sub;
      const hits = await hitRateLimit(
        `rt-typing:${userId}:${input.conversationId}`,
        MESSAGE_LIMITS.typingEverySeconds
      );
      if (hits > 1) return { sent: false };
      const conversationId = hexToId(input.conversationId);
      const members = await prisma.conversationMember.findMany({
        where: { conversationId },
        select: { userId: true, state: true, acceptedAt: true },
      });
      const me = members.find(m => m.userId === userId);
      const other = members.find(m => m.userId !== userId);
      // Not a member, a block either way, the other side left, or a request not yet
      // accepted (a stranger never sees typing in Requests): say nothing
      if (!me || !other || me.state !== "ACTIVE" || other.state !== "ACTIVE")
        return { sent: false };
      if (!me.acceptedAt || !other.acceptedAt) return { sent: false };
      await publish(other.userId, {
        type: "typing",
        conversationId: idToHex(conversationId),
        userId,
      });
      return { sent: true };
    }),
});
