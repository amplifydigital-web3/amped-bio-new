import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { prisma } from "@repo/database";
import { HANDLE_REGEX, TELEGRAM_BOT_STRINGS } from "@repo/constants";
import { privateProcedure, router } from "../trpc";
import { env } from "../../env";
import { enforceRateLimits } from "../../utils/rateLimit";
import {
  findByUserId,
  getGlobalTelegramDelivery,
  ownLinkView,
  setGlobalTelegramDelivery,
  unlinkTelegram,
} from "../../services/telegram/accounts";
import { isOidcConfigured, startTelegramLink } from "../../services/telegram/oidc";
import { getBotUsername } from "../../services/telegram/client";
import { enqueueOutbox } from "../../services/telegram/loop";
import { getOrCreateLinkCode } from "../../services/telegram/linkCodes";
import { telegramGroupsRouter } from "./groups";
import { telegramMiniAppRouter } from "./miniapp";

/** Where the browser lands after Telegram (PR 4). The handle must name a published page. */
const returnToSchema = z
  .discriminatedUnion("to", [
    z.object({ to: z.literal("account") }),
    z.object({ to: z.literal("wizard") }),
    z.object({ to: z.literal("fan"), handle: z.string().min(1).max(64).regex(HANDLE_REGEX) }),
  ])
  .default({ to: "account" });

/**
 * telegram.link (Build Board #2, spec 3.4): Account, Connected apps, row 112.
 * Every procedure acts on the caller's own link. No procedure returns a
 * Telegram id; the username comes back only to its owner.
 */
export const telegramLinkRouter = router({
  /** Everything the Account row needs. `available` is false until the bot is set up. */
  status: privateProcedure.query(async ({ ctx }) => {
    const userId = ctx.user!.sub;
    const available = isOidcConfigured();
    const [account, botUsername] = await Promise.all([
      findByUserId(userId),
      // The bot's public handle, for t.me deep links (wizard A Done, wizard B)
      env.TELEGRAM_ENABLED ? getBotUsername() : Promise.resolve(null),
    ]);
    if (!account) {
      return {
        available,
        botUsername,
        linkCode: null,
        linked: false as const,
        telegramBroadcasts: false,
      };
    }
    return {
      available,
      botUsername,
      // The caller's own code for their Message me link (spec r3 3.5)
      linkCode: botUsername ? await getOrCreateLinkCode(userId) : null,
      linked: true as const,
      telegramBroadcasts: await getGlobalTelegramDelivery(userId),
      ...ownLinkView(account),
    };
  }),

  /** The Log In with Telegram URL for this user. The browser goes there next. */
  start: privateProcedure
    .input(z.object({ returnTo: returnToSchema }).optional())
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.user!.sub;
      if (!isOidcConfigured()) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: "Telegram is not available yet.",
        });
      }
      await enforceRateLimits(
        [{ key: `tg-link-start:${userId}`, limit: 10, windowSeconds: 3600 }],
        "Too many link attempts. Try again in an hour."
      );
      const returnTo = input?.returnTo ?? { to: "account" as const };
      if (returnTo.to === "fan") {
        const page = await prisma.user.findFirst({
          where: { handle: returnTo.handle, page_status: "PUBLISHED" },
          select: { id: true },
        });
        if (!page) throw new TRPCError({ code: "NOT_FOUND", message: "Page not found." });
      }
      try {
        return { url: await startTelegramLink(userId, returnTo) };
      } catch (error) {
        console.error("[telegram] link start failed", error);
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Telegram did not answer. Try again in a minute.",
        });
      }
    }),

  setPreferences: privateProcedure
    .input(
      z
        .object({
          shareUsername: z.boolean().optional(),
          showTelegramOnBio: z.boolean().optional(),
          telegramBroadcasts: z.boolean().optional(),
        })
        .refine(v => Object.values(v).some(x => x !== undefined), "Nothing to change")
    )
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.user!.sub;
      const account = await findByUserId(userId);
      if (!account) {
        throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Link Telegram first." });
      }
      const { telegramBroadcasts, ...flags } = input;
      if (flags.shareUsername !== undefined || flags.showTelegramOnBio !== undefined) {
        await prisma.telegramAccount.update({ where: { userId }, data: flags });
      }
      if (telegramBroadcasts !== undefined) {
        await setGlobalTelegramDelivery(
          userId,
          account.telegramUserId,
          telegramBroadcasts,
          "settings"
        );
      }
      return { ok: true };
    }),

  /** Unlink (spec 3.4). The bot sends one closing notice when it still can. */
  unlink: privateProcedure.mutation(async ({ ctx }) => {
    const result = await unlinkTelegram(ctx.user!.sub);
    if (result?.reachable && env.TELEGRAM_ENABLED) {
      await enqueueOutbox(
        "notice",
        { text: TELEGRAM_BOT_STRINGS.unlinked },
        { chatId: result.telegramUserId }
      );
    }
    return { ok: true };
  }),
});

export const telegramRouter = router({
  link: telegramLinkRouter,
  groups: telegramGroupsRouter,
  miniapp: telegramMiniAppRouter,
});
