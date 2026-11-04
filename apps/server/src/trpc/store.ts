import { TRPCError } from "@trpc/server";
import { z } from "zod";
import {
  STORE_COPY,
  offerIdSchema,
  offerSetStatusSchema,
  offerUpsertSchema,
  storePolicyDraftSchema,
  storeSettingsUpdateSchema,
  REFUNDS_PER_HOUR,
  STORE_SALES_COPY,
  storeRefundPrepareSchema,
  storeRefundSubmitSchema,
  storeReportSchema,
  storeSalesCsvSchema,
  storeSalesListSchema,
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
import {
  listSales,
  prepareRefund,
  reportStore,
  salesCsv,
  submitRefund,
} from "../services/store/sales";
import { prisma } from "@repo/database";

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

  /**
   * Sales and refunds (C10, row 161, boards st5 and k2). The caller's own sales only. Buyers
   * show by name and handle; no email or wallet leaves the server.
   */
  sales: router({
    list: privateProcedure
      .input(storeSalesListSchema)
      .query(({ ctx, input }) => listSales(ctx.user!.sub, input?.cursor)),
    csv: privateProcedure.input(storeSalesCsvSchema).query(async ({ ctx, input }) => {
      await enforceRateLimits(
        [{ key: `store_sales_csv:u:${ctx.user!.sub}`, limit: 30, windowSeconds: 3600 }],
        "Too many exports. Try again in an hour."
      );
      return { month: input.month, csv: await salesCsv(ctx.user!.sub, input.month) };
    }),
    refund: router({
      prepare: privateProcedure.input(storeRefundPrepareSchema).mutation(async ({ ctx, input }) => {
        await enforceRateLimits(
          [
            {
              key: `store_refund:u:${ctx.user!.sub}`,
              limit: REFUNDS_PER_HOUR * 3,
              windowSeconds: 3600,
            },
          ],
          "Too many refunds. Try again in an hour."
        );
        return prepareRefund(ctx.user!.sub, input.purchaseId);
      }),
      submit: privateProcedure.input(storeRefundSubmitSchema).mutation(async ({ ctx, input }) => {
        await enforceRateLimits(
          [
            {
              key: `store_refund_send:u:${ctx.user!.sub}`,
              limit: REFUNDS_PER_HOUR,
              windowSeconds: 3600,
            },
          ],
          "Too many refunds. Try again in an hour."
        );
        return submitRefund(ctx.user!.sub, input);
      }),
    }),
  }),

  /** Report store (store policy 3.4, SP-Q48). Only for a store the reporter can see. */
  report: publicProcedure.input(storeReportSchema).mutation(async ({ ctx, input }) => {
    await enforceRateLimits(
      [{ key: `store_report:ip:${getClientIp(ctx.req)}`, limit: 10, windowSeconds: 3600 }],
      STORE_SALES_COPY.report.failed
    );
    const viewer = ctx.user?.sub ?? null;
    const visible = await storePublic(input.handle, viewer);
    if (!visible) throw notFound();
    const creator = await prisma.user.findFirst({
      where: { handle: input.handle.replace(/^@/, "").toLowerCase() },
      select: { id: true },
    });
    if (!creator) throw notFound();
    return reportStore({
      creatorUserId: creator.id,
      reporterUserId: viewer,
      reason: input.reason,
      details: input.details,
    });
  }),
});
