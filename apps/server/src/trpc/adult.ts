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
import { isFeatureOn } from "../services/featureFlags";
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

const personId = z.string().regex(/^[0-9a-f]{32}$/);

/** The `adultContent` flag gates the action, not just the tab (AGENTS.md, feature flags). */
const gated = privateProcedure.use(({ next }) => {
  if (!isFeatureOn("adultContent")) {
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message: "18+ content is not available yet.",
    });
  }
  return next();
});

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
  getSetup: gated.query(({ ctx }) => getSetup(ctx.user!.sub)),
  acceptPolicy: gated.mutation(({ ctx }) => acceptPolicy(ctx.user!.sub)),
  setCustodian: gated
    .input(custodianSchema)
    .mutation(({ ctx, input }) => setCustodian(ctx.user!.sub, input)),
  enable: gated.mutation(({ ctx }) => run(() => enableAdult(ctx.user!.sub))),
  disable: gated.mutation(({ ctx }) => disableAdult(ctx.user!.sub)),

  people: router({
    list: gated.query(({ ctx }) => listPeople(ctx.user!.sub)),
    invite: gated
      .input(z.object({ displayName: z.string().trim().min(1).max(80) }))
      .mutation(({ ctx, input }) => invitePerson(ctx.user!.sub, input.displayName)),
    countersign: gated
      .input(z.object({ id: personId }))
      .mutation(({ ctx, input }) => run(() => countersign(ctx.user!.sub, input.id))),
    remove: gated
      .input(z.object({ id: personId }))
      .mutation(({ ctx, input }) => run(() => removePerson(ctx.user!.sub, input.id))),
  }),

  appear: router({
    get: gated
      .input(z.object({ token: appearTokenSchema }))
      .query(({ ctx, input }) => run(() => getInvite(input.token, ctx.user!.sub))),
    sign: gated
      .input(appearSignSchema)
      .mutation(({ ctx, input }) => run(() => signRelease(input, ctx.user!.sub))),
    mine: gated.query(({ ctx }) => myAppearances(ctx.user!.sub)),
    withdraw: gated
      .input(z.object({ id: personId }))
      .mutation(({ ctx, input }) => run(() => withdrawRelease(ctx.user!.sub, input.id))),
  }),

  /** The item editor 18+ section (5.3). */
  setItemPeople: gated
    .input(contentPeopleSchema)
    .mutation(({ ctx, input }) => run(() => setItemPeople(ctx.user!.sub, input))),

  /** Submit an 18+ item for review (6.1). Refusals carry the reason code and its text. */
  submitForReview: gated
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
