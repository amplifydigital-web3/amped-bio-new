import { TRPCError } from "@trpc/server";
import { z } from "zod";
import {
  analyticsBreakdownSchema,
  analyticsCampaignCreateSchema,
  analyticsCampaignIdSchema,
  analyticsRangeSchema,
} from "@repo/constants";
import { privateProcedure, router } from "./trpc";
import { prisma } from "../services/DB";
import { cache } from "../utils/cache";
import {
  exportEventsCsv,
  getAudienceSummary,
  getBreakdown,
  getCampaignPerformance,
  getHeatmap,
  getLatestEventAt,
  getRetentionCohorts,
  getLinkPerformance,
  getRealtime,
  getSummary,
  getTimeseries,
  resolveRange,
} from "../services/analytics/queries";
import { buildInsights, generateAiSummary } from "../services/analytics/insights";

// cache.set takes seconds
const AI_SUMMARY_TTL_SECONDS = 6 * 60 * 60;

function handleError(scope: string, error: unknown): never {
  if (error instanceof TRPCError) throw error;
  console.error(`[ANALYTICS] ${scope} failed`, error);
  throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Failed to load analytics" });
}

async function assertOwnsBlock(userId: number, blockId?: number) {
  if (!blockId) return;
  const block = await prisma.block.findUnique({
    where: { id: blockId },
    select: { user_id: true },
  });
  if (!block || block.user_id !== userId) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Link not found" });
  }
}

async function loadInsightInput(userId: number, input: z.infer<typeof analyticsRangeSchema>) {
  const range = await resolveRange(userId, input);
  const summary = await getSummary(userId, range.from, range.to);
  const previousRange =
    range.previousFrom && range.previousTo
      ? { from: range.previousFrom, to: range.previousTo, tzOffsetMinutes: range.tzOffsetMinutes }
      : null;
  const previous = previousRange
    ? await getSummary(userId, previousRange.from, previousRange.to)
    : null;
  const [sources, devices, links, heatmap, audience, previousAudience] = await Promise.all([
    getBreakdown(userId, range.from, range.to, "source", 10),
    getBreakdown(userId, range.from, range.to, "device", 5),
    getLinkPerformance(userId, range.from, range.to, summary.views),
    getHeatmap(userId, range),
    getAudienceSummary(userId, range, summary.visitors),
    previousRange && previous
      ? getAudienceSummary(userId, previousRange, previous.visitors)
      : Promise.resolve(null),
  ]);
  return {
    range,
    summary,
    previous,
    sources,
    devices,
    links,
    heatmap,
    audience,
    previousAudience,
  };
}

export const analyticsRouter = router({
  // Headline numbers, trend, links, heatmap and rule based insights in one round trip
  dashboard: privateProcedure.input(analyticsRangeSchema).query(async ({ ctx, input }) => {
    const userId = ctx.user!.sub;
    try {
      const data = await loadInsightInput(userId, { ...input, blockId: undefined });
      const [timeseries, latestEventAt] = await Promise.all([
        getTimeseries(userId, data.range),
        getLatestEventAt(userId),
      ]);
      return {
        // When these numbers were computed and when the newest event arrived
        meta: { generatedAt: new Date(), latestEventAt },
        range: {
          from: data.range.from,
          to: data.range.to,
          bucket: data.range.bucket,
          hasPrevious: data.previous !== null,
        },
        summary: data.summary,
        previous: data.previous,
        timeseries,
        links: data.links,
        heatmap: data.heatmap,
        audience: data.audience,
        previousAudience: data.previousAudience,
        insights: buildInsights(data),
      };
    } catch (error) {
      handleError("dashboard", error);
    }
  }),

  breakdown: privateProcedure.input(analyticsBreakdownSchema).query(async ({ ctx, input }) => {
    const userId = ctx.user!.sub;
    try {
      await assertOwnsBlock(userId, input.blockId);
      const range = await resolveRange(userId, input);
      return getBreakdown(
        userId,
        range.from,
        range.to,
        input.dimension,
        input.limit,
        input.blockId
      );
    } catch (error) {
      handleError("breakdown", error);
    }
  }),

  // Drill down for a single link
  linkDetail: privateProcedure
    .input(analyticsRangeSchema.extend({ blockId: z.number().int().positive() }))
    .query(async ({ ctx, input }) => {
      const userId = ctx.user!.sub;
      try {
        await assertOwnsBlock(userId, input.blockId);
        const range = await resolveRange(userId, input);
        const [summary, previous, timeseries] = await Promise.all([
          getSummary(userId, range.from, range.to, input.blockId),
          range.previousFrom && range.previousTo
            ? getSummary(userId, range.previousFrom, range.previousTo, input.blockId)
            : Promise.resolve(null),
          getTimeseries(userId, range, input.blockId),
        ]);
        return { summary, previous, timeseries, bucket: range.bucket };
      } catch (error) {
        handleError("linkDetail", error);
      }
    }),

  // Visitors in the last 30 minutes plus a live activity feed
  realtime: privateProcedure.query(async ({ ctx }) => {
    try {
      return await getRealtime(ctx.user!.sub);
    } catch (error) {
      handleError("realtime", error);
    }
  }),

  // Full event level export. Free on every account.
  exportCsv: privateProcedure.input(analyticsRangeSchema).mutation(async ({ ctx, input }) => {
    const userId = ctx.user!.sub;
    try {
      const range = await resolveRange(userId, input);
      return await exportEventsCsv(userId, range.from, range.to);
    } catch (error) {
      handleError("exportCsv", error);
    }
  }),

  // AI written summary. Returns enabled=false when no model key is configured.
  aiSummary: privateProcedure.input(analyticsRangeSchema).query(async ({ ctx, input }) => {
    const userId = ctx.user!.sub;
    const cacheKey = `analytics:ai-summary:${userId}:${input.range}`;
    try {
      const cached = await cache.get<{ text: string; generatedAt: string }>(cacheKey);
      if (cached) return { enabled: true, ...cached };

      const data = await loadInsightInput(userId, { ...input, blockId: undefined });
      if (data.summary.views === 0) return { enabled: true, text: null, generatedAt: null };

      const text = await generateAiSummary({ ...data, rangeLabel: input.range });
      if (text === null) {
        return { enabled: false, text: null, generatedAt: null };
      }

      const result = { text, generatedAt: new Date().toISOString() };
      await cache.set(cacheKey, result, AI_SUMMARY_TTL_SECONDS);
      return { enabled: true, ...result };
    } catch (error) {
      handleError("aiSummary", error);
    }
  }),

  // Weekly retention for visitors who allowed return-visit measurement
  retention: privateProcedure
    .input(analyticsRangeSchema.pick({ tzOffsetMinutes: true }))
    .query(async ({ ctx, input }) => {
      try {
        return {
          generatedAt: new Date(),
          cohorts: await getRetentionCohorts(ctx.user!.sub, input.tzOffsetMinutes),
        };
      } catch (error) {
        handleError("retention", error);
      }
    }),

  campaigns: privateProcedure.input(analyticsRangeSchema).query(async ({ ctx, input }) => {
    const userId = ctx.user!.sub;
    try {
      const range = await resolveRange(userId, input);
      return {
        generatedAt: new Date(),
        campaigns: await getCampaignPerformance(userId, range.from, range.to),
      };
    } catch (error) {
      handleError("campaigns", error);
    }
  }),

  createCampaign: privateProcedure
    .input(analyticsCampaignCreateSchema)
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.user!.sub;
      const base =
        input.name
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, "-")
          .replace(/^-+|-+$/g, "")
          .slice(0, 60) || "campaign";
      try {
        const count = await prisma.analyticsCampaign.count({ where: { user_id: userId } });
        if (count >= 200) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "You have reached the limit of 200 campaigns. Archive unused ones first.",
          });
        }
        // Keep slugs unique per creator by adding a numeric suffix when needed
        for (let attempt = 0; attempt < 20; attempt++) {
          const slug = attempt === 0 ? base : `${base}-${attempt + 1}`;
          const exists = await prisma.analyticsCampaign.findUnique({
            where: { user_id_slug: { user_id: userId, slug } },
            select: { id: true },
          });
          if (!exists) {
            return await prisma.analyticsCampaign.create({
              data: { user_id: userId, name: input.name, slug, channel: input.channel },
              select: { id: true, name: true, slug: true, channel: true, created_at: true },
            });
          }
        }
        throw new TRPCError({ code: "CONFLICT", message: "Choose a different campaign name" });
      } catch (error) {
        handleError("createCampaign", error);
      }
    }),

  archiveCampaign: privateProcedure
    .input(analyticsCampaignIdSchema.extend({ archived: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.user!.sub;
      try {
        const result = await prisma.analyticsCampaign.updateMany({
          where: { id: input.id, user_id: userId },
          data: { archived_at: input.archived ? new Date() : null },
        });
        if (result.count === 0) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Campaign not found" });
        }
        return { ok: true };
      } catch (error) {
        handleError("archiveCampaign", error);
      }
    }),
});
