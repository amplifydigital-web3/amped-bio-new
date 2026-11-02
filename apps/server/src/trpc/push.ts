import { z } from "zod";
import { privateProcedure, publicProcedure, router } from "./trpc";
import { enforceRateLimits } from "../utils/rateLimit";
import {
  removeSubscription,
  saveSubscription,
  vapidPublicKey,
} from "../services/notifications/push";

/**
 * push.* (Amped Messages #2 r4, PR M4, spec 7.4 item 2). The app asks for permission
 * after the first message, then saves the browser's subscription here.
 */
export const pushRouter = router({
  /** The VAPID public key for PushManager.subscribe; null while push is not set up. */
  publicKey: publicProcedure.query(() => ({ key: vapidPublicKey() })),

  subscribe: privateProcedure
    .input(
      z.object({
        endpoint: z.string().url().max(512).startsWith("https://"),
        keys: z.object({ p256dh: z.string().min(16).max(128), auth: z.string().min(8).max(64) }),
        userAgent: z.string().max(255).nullish(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      await enforceRateLimits(
        [{ key: `push-sub:${ctx.user!.sub}`, limit: 20, windowSeconds: 3600 }],
        "Too many devices at once. Try again later."
      );
      await saveSubscription(ctx.user!.sub, input);
      return { ok: true };
    }),

  unsubscribe: privateProcedure
    .input(z.object({ endpoint: z.string().max(512) }))
    .mutation(async ({ ctx, input }) => {
      await removeSubscription(ctx.user!.sub, input.endpoint);
      return { ok: true };
    }),
});
