/**
 * Creator 18+ setup, people and releases (adult content review 5.1 to 5.3 and 13, PR R4).
 * `adult.*` for the creator, `adult.appear.*` for the invited person. Private only.
 */
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import {
  ADULT_SUBMIT_ERRORS,
  appearSignSchema,
  appearTokenSchema,
  contentPeopleSchema,
  contentPublicIdSchema,
  custodianSchema,
} from "@repo/constants";
import { privateProcedure, router } from "./trpc";
import {
  AdultSetupError,
  acceptPolicy,
  countersign,
  disableAdult,
  enableAdult,
  getInvite,
  getSetup,
  invitePerson,
  listPeople,
  myAppearances,
  removePerson,
  setCustodian,
  setItemPeople,
  signRelease,
  submitForReview,
  withdrawRelease,
} from "../services/safety/adultSetup";
import { APPEAL_MAX, fileAppeal } from "../services/safety/creators";
import { SafetyActionError } from "../services/safety/review";

const personId = z.string().regex(/^[0-9a-f]{32}$/);

async function run<T>(work: () => Promise<T>): Promise<T> {
  try {
    return await work();
  } catch (error) {
    if (error instanceof AdultSetupError) {
      const code = {
        not_found: "NOT_FOUND",
        forbidden: "FORBIDDEN",
        bad_request: "BAD_REQUEST",
        conflict: "CONFLICT",
      } as const;
      throw new TRPCError({ code: code[error.code], message: error.message });
    }
    throw error;
  }
}

export const adultRouter = router({
  getSetup: privateProcedure.query(({ ctx }) => getSetup(ctx.user!.sub)),
  acceptPolicy: privateProcedure.mutation(({ ctx }) => acceptPolicy(ctx.user!.sub)),
  setCustodian: privateProcedure
    .input(custodianSchema)
    .mutation(({ ctx, input }) => setCustodian(ctx.user!.sub, input)),
  enable: privateProcedure.mutation(({ ctx }) => run(() => enableAdult(ctx.user!.sub))),
  disable: privateProcedure.mutation(({ ctx }) => disableAdult(ctx.user!.sub)),

  people: router({
    list: privateProcedure.query(({ ctx }) => listPeople(ctx.user!.sub)),
    invite: privateProcedure
      .input(z.object({ displayName: z.string().trim().min(1).max(80) }))
      .mutation(({ ctx, input }) => invitePerson(ctx.user!.sub, input.displayName)),
    countersign: privateProcedure
      .input(z.object({ id: personId }))
      .mutation(({ ctx, input }) => run(() => countersign(ctx.user!.sub, input.id))),
    remove: privateProcedure
      .input(z.object({ id: personId }))
      .mutation(({ ctx, input }) => run(() => removePerson(ctx.user!.sub, input.id))),
  }),

  appear: router({
    get: privateProcedure
      .input(z.object({ token: appearTokenSchema }))
      .query(({ ctx, input }) => run(() => getInvite(input.token, ctx.user!.sub))),
    sign: privateProcedure
      .input(appearSignSchema)
      .mutation(({ ctx, input }) => run(() => signRelease(input, ctx.user!.sub))),
    mine: privateProcedure.query(({ ctx }) => myAppearances(ctx.user!.sub)),
    withdraw: privateProcedure
      .input(z.object({ id: personId }))
      .mutation(({ ctx, input }) => run(() => withdrawRelease(ctx.user!.sub, input.id))),
  }),

  /** The item editor 18+ section (5.3). */
  setItemPeople: privateProcedure
    .input(contentPeopleSchema)
    .mutation(({ ctx, input }) => run(() => setItemPeople(ctx.user!.sub, input))),

  /** Appeal a decision on one of your items (5.4): once, within 30 days, up to 1,000 characters. */
  appeal: privateProcedure
    .input(
      z.object({ publicId: contentPublicIdSchema, text: z.string().trim().min(10).max(APPEAL_MAX) })
    )
    .mutation(async ({ ctx, input }) => {
      try {
        return await fileAppeal(ctx.user!.sub, input);
      } catch (error) {
        if (error instanceof SafetyActionError) {
          const code = {
            not_found: "NOT_FOUND",
            forbidden: "FORBIDDEN",
            bad_request: "BAD_REQUEST",
            conflict: "CONFLICT",
          } as const;
          throw new TRPCError({ code: code[error.code], message: error.message });
        }
        throw error;
      }
    }),

  /** Submit an 18+ item for review (6.1). Refusals carry the reason code and its text. */
  submitForReview: privateProcedure
    .input(z.object({ publicId: contentPublicIdSchema, confirmed: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      const result = await run(() =>
        submitForReview(ctx.user!.sub, input.publicId, input.confirmed)
      );
      if (!result.ok) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: ADULT_SUBMIT_ERRORS[result.error],
          cause: result.error,
        });
      }
      return result;
    }),
});
