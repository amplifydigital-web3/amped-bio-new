import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { TELEGRAM_MINIAPP_STRINGS as M } from "@repo/constants";
import { publicProcedure, router } from "../trpc";
import { enforceRateLimits } from "../../utils/rateLimit";
import { validateInitData } from "../../services/telegram/initData";
import {
  MiniAppError,
  buildMiniAppPage,
  miniAppFollow,
  prepareMiniAppShare,
} from "../../services/telegram/miniapp";

const input = z.object({ initData: z.string().min(1).max(4096) });

const MESSAGES: Record<MiniAppError["code"], { code: TRPCError["code"]; message: string }> = {
  off: { code: "PRECONDITION_FAILED", message: M.failed },
  not_found: { code: "NOT_FOUND", message: M.notFound },
  not_linked: { code: "PRECONDITION_FAILED", message: M.linkTitle },
  self: { code: "BAD_REQUEST", message: M.followFailed },
  blocked: { code: "FORBIDDEN", message: M.followFailed },
};

/** Validates the signed launch data and rate limits per Telegram user. */
async function viewerFrom(initData: string, limit: number) {
  const result = validateInitData(initData);
  if (!result.ok) {
    throw new TRPCError({
      code: result.reason === "off" ? "PRECONDITION_FAILED" : "UNAUTHORIZED",
      message: M.failed,
    });
  }
  await enforceRateLimits(
    [{ key: `tg-miniapp:${result.user.id}`, limit, windowSeconds: 60 }],
    M.failed
  );
  return result;
}

async function run<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (error) {
    if (error instanceof MiniAppError) throw new TRPCError(MESSAGES[error.code]);
    if (error instanceof TRPCError) throw error;
    console.error("[telegram] mini app procedure failed", error);
    throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: M.failed });
  }
}

/**
 * telegram.miniapp (Build Board #2, phase 3, spec r3 3.7). Public procedures: the caller
 * is whoever signed the launch data, checked against the bot token on every call. The
 * creator comes from the signed start_param (p_{code}), never from the request.
 * Behind TELEGRAM_MINIAPP.
 */
export const telegramMiniAppRouter = router({
  page: publicProcedure.input(input).query(({ input }) =>
    run(async () => {
      const viewer = await viewerFrom(input.initData, 60);
      return buildMiniAppPage(viewer.user, viewer.startParam);
    })
  ),

  follow: publicProcedure.input(input).mutation(({ input }) =>
    run(async () => {
      const viewer = await viewerFrom(input.initData, 20);
      return miniAppFollow(viewer.user, viewer.startParam);
    })
  ),

  prepareShare: publicProcedure.input(input).mutation(({ input }) =>
    run(async () => {
      const viewer = await viewerFrom(input.initData, 10);
      return prepareMiniAppShare(viewer.user, viewer.startParam);
    })
  ),
});
