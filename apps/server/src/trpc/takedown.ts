/**
 * Public notice forms (adult content review 7.2 and 7.5, section 13, PR R3): Take It
 * Down requests and copyright notices, rate limited, with Turnstile when configured.
 * The counter notice is private: only the owner of a disabled item sends one.
 */
import { TRPCError } from "@trpc/server";
import {
  copyrightSubmitSchema,
  counterNoticeSchema,
  takedownStatusSchema,
  takedownSubmitSchema,
} from "@repo/constants";
import { privateProcedure, publicProcedure, router } from "./trpc";
import { hitRateLimit } from "../utils/rateLimit";
import { viewerKey } from "../services/content/viewer";
import {
  requestStatus,
  submitCopyright,
  submitCounterNotice,
  submitTakedown,
} from "../services/safety/takedown";

/** Requests per sender key per hour. */
const NOTICES_PER_HOUR = 5;

async function limit(ctx: Parameters<typeof viewerKey>[0], scope: string) {
  if ((await hitRateLimit(`${scope}:${viewerKey(ctx)}`, 3600)) > NOTICES_PER_HOUR) {
    throw new TRPCError({
      code: "TOO_MANY_REQUESTS",
      message: "Too many requests. Try again later.",
    });
  }
}

export const takedownRouter = router({
  submit: publicProcedure.input(takedownSubmitSchema).mutation(async ({ ctx, input }) => {
    await limit(ctx, "takedown");
    return submitTakedown(input);
  }),
  status: publicProcedure.input(takedownStatusSchema).query(async ({ ctx, input }) => {
    await limit(ctx, "takedown-status");
    const status = await requestStatus(input.number, input.key);
    if (!status) throw new TRPCError({ code: "NOT_FOUND", message: "Request not found." });
    return status;
  }),
});

export const copyrightRouter = router({
  submit: publicProcedure.input(copyrightSubmitSchema).mutation(async ({ ctx, input }) => {
    await limit(ctx, "copyright");
    return submitCopyright(input);
  }),
  status: publicProcedure.input(takedownStatusSchema).query(async ({ ctx, input }) => {
    await limit(ctx, "copyright-status");
    const status = await requestStatus(input.number, input.key);
    if (!status) throw new TRPCError({ code: "NOT_FOUND", message: "Notice not found." });
    return status;
  }),
  counter: privateProcedure.input(counterNoticeSchema).mutation(async ({ ctx, input }) => {
    if (!input.mistake || !input.jurisdiction || !input.acceptService) {
      throw new TRPCError({ code: "BAD_REQUEST", message: "Every statement is required." });
    }
    const result = await submitCounterNotice(ctx.user!.sub, input);
    if (!result)
      throw new TRPCError({
        code: "NOT_FOUND",
        message: "No disabled item of yours is on this notice.",
      });
    return result;
  }),
});
