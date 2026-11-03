import { TRPCError } from "@trpc/server";
import { z } from "zod";
import {
  STORE_COPY,
  offerIdSchema,
  offerSetStatusSchema,
  offerUpsertSchema,
  storePolicyDraftSchema,
  storeSettingsUpdateSchema,
} from "@repo/constants";
import { privateProcedure, publicProcedure, router } from "./trpc";
import { enforceRateLimits } from "../utils/rateLimit";
import { getClientIp } from "../services/analytics/requestContext";
import {
  StoreError,
  acceptSellerTerms,
  getStore,
  setLive,
  updateStore,
} from "../services/store/settings";
import {
  OfferError,
  amountBounds,
  listOffers,
  reorderOffers,
  setOfferStatus,
  upsertOffer,
} from "../services/store/products";
import {
  StorePolicyError,
  getPolicy,
  previewDraft,
  publishPolicy,
  saveDraft,
} from "../services/store/policy";
import { storePolicyPublic, storeProductPublic, storePublic } from "../services/store/public";

const handleSchema = z.string().trim().min(1).max(64);

/** Turns a store refusal into a BAD_REQUEST that carries its code (trpc.ts errorFormatter). */
async function run<T>(work: () => Promise<T>): Promise<T> {
  try {
    return await work();
  } catch (error) {
    if (error instanceof OfferError) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: STORE_COPY.errors[error.code],
        cause: { refusal: error.code, detail: error.detail },
      });
    }
    if (error instanceof StorePolicyError) {
      const host = String(error.detail.host ?? "");
      const message =
        error.code === "policy_external_link"
          ? STORE_COPY.errors.policy_external_link(host)
          : error.code === "policy_confirmations_missing"
            ? STORE_COPY.errors.policy_confirmations_missing
            : error.code === "policy_seller_name"
              ? STORE_COPY.errors.sellerName
              : error.code === "policy_rate_limited"
                ? "You published 10 times today."
                : "Check the policy text and publish again.";
      throw new TRPCError({
        code: "BAD_REQUEST",
        message,
        cause: { refusal: error.code, detail: error.detail },
      });
    }
    if (error instanceof StoreError) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message:
          error.code === "go_live_incomplete"
            ? "Finish every step of the checklist to go live."
            : "That change could not be saved.",
        cause: { refusal: error.code, detail: error.detail },
      });
    }
    throw error;
  }
}

const notFound = () => new TRPCError({ code: "NOT_FOUND", message: "This store is not open." });

/**
 * Creator stores (content PR 9, C9; content spec 3.8 and 3.10, store-catalog.md, store policy
 * 3.7). Private procedures act on the caller's own store. Public reads return not found until
 * the store is live and store sales are on, except to the owner, who sees a preview.
 */
export const storeRouter = router({
  settings: router({
    get: privateProcedure.query(({ ctx }) => getStore(ctx.user!.sub)),
    update: privateProcedure
      .input(storeSettingsUpdateSchema)
      .mutation(({ ctx, input }) => run(() => updateStore(ctx.user!.sub, input))),
  }),

  acceptTerms: privateProcedure.mutation(({ ctx }) => acceptSellerTerms(ctx.user!.sub)),

  setLive: privateProcedure
    .input(z.object({ live: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      await enforceRateLimits(
        [{ key: `store_set_live:u:${ctx.user!.sub}`, limit: 10, windowSeconds: 60 }],
        "Too many changes. Try again in a minute."
      );
      return run(() => setLive(ctx.user!.sub, input.live));
    }),

  /** The fee line in the product editor: "You receive $N USDC after the Amped.Bio fee of 5%" */
  feePreview: privateProcedure.query(async () => {
    const bounds = await amountBounds();
    return {
      feeBps: bounds.feeBps,
      minUnits: bounds.min.toString(),
      maxUnits: bounds.max.toString(),
    };
  }),

  products: router({
    list: privateProcedure.query(({ ctx }) => listOffers(ctx.user!.sub)),
    upsert: privateProcedure.input(offerUpsertSchema).mutation(async ({ ctx, input }) => {
      await enforceRateLimits(
        [{ key: `store_upsert:u:${ctx.user!.sub}`, limit: 60, windowSeconds: 60 }],
        "Too many changes. Try again in a minute."
      );
      return run(() => upsertOffer(ctx.user!.sub, input));
    }),
    setStatus: privateProcedure
      .input(offerSetStatusSchema)
      .mutation(({ ctx, input }) =>
        run(() => setOfferStatus(ctx.user!.sub, input.id, input.status))
      ),
    reorder: privateProcedure
      .input(z.object({ ids: z.array(offerIdSchema).min(1).max(500) }))
      .mutation(({ ctx, input }) => run(() => reorderOffers(ctx.user!.sub, input.ids))),
  }),

  policy: router({
    get: privateProcedure.query(({ ctx }) => getPolicy(ctx.user!.sub)),
    saveDraft: privateProcedure
      .input(storePolicyDraftSchema)
      .mutation(({ ctx, input }) => saveDraft(ctx.user!.sub, input)),
    preview: privateProcedure
      .input(storePolicyDraftSchema)
      .query(({ ctx, input }) => previewDraft(ctx.user!.sub, input)),
    publish: privateProcedure.mutation(({ ctx }) => run(() => publishPolicy(ctx.user!.sub))),
  }),

  public: publicProcedure
    .input(z.object({ handle: handleSchema }))
    .query(async ({ ctx, input }) => {
      await enforceRateLimits(
        [{ key: `store_public:ip:${getClientIp(ctx.req)}`, limit: 240, windowSeconds: 60 }],
        "Too many requests. Try again in a minute."
      );
      const store = await storePublic(input.handle, ctx.user?.sub ?? null);
      if (!store) throw notFound();
      return store;
    }),

  product: publicProcedure
    .input(z.object({ handle: handleSchema, slug: z.string().trim().min(1).max(60) }))
    .query(async ({ ctx, input }) => {
      await enforceRateLimits(
        [{ key: `store_public:ip:${getClientIp(ctx.req)}`, limit: 240, windowSeconds: 60 }],
        "Too many requests. Try again in a minute."
      );
      const product = await storeProductPublic(input.handle, input.slug, ctx.user?.sub ?? null);
      if (!product) throw notFound();
      return product;
    }),

  publicPolicy: publicProcedure
    .input(z.object({ handle: handleSchema, v: z.number().int().min(1).optional() }))
    .query(async ({ ctx, input }) => {
      const policy = await storePolicyPublic(input.handle, input.v, ctx.user?.sub ?? null);
      if (!policy) throw notFound();
      return policy;
    }),
});
