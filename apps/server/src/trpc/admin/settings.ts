import { adminProcedure, router } from "../trpc";
import { z } from "zod";
import { prisma } from "../../services/DB";
import { SITE_SETTINGS } from "@repo/constants";

export const settingsRouter = router({
  getFaucetStatus: adminProcedure.query(async () => {
    const faucetStatus = await prisma.siteSettings.findUnique({
      where: { setting_key: SITE_SETTINGS.FAUCET_ENABLED },
    });
    return faucetStatus?.setting_value === "true";
  }),

  setFaucetStatus: adminProcedure
    .input(z.object({ enabled: z.boolean() }))
    .mutation(async ({ input }) => {
      return prisma.siteSettings.upsert({
        where: { setting_key: SITE_SETTINGS.FAUCET_ENABLED },
        update: {
          setting_value: input.enabled.toString(),
          value_type: "BOOLEAN",
        },
        create: {
          setting_key: SITE_SETTINGS.FAUCET_ENABLED,
          setting_value: input.enabled.toString(),
          value_type: "BOOLEAN",
        },
      });
    }),

  // Affiliate Rewards Settings
  getAffiliateRewardsStatus: adminProcedure.query(async () => {
    const [referrerReward, refereeReward] = await Promise.all([
      prisma.siteSettings.findUnique({
        where: { setting_key: SITE_SETTINGS.AFFILIATE_REFERRER_REWARD },
      }),
      prisma.siteSettings.findUnique({
        where: { setting_key: SITE_SETTINGS.AFFILIATE_REFEREE_REWARD },
      }),
    ]);

    return {
      referrerReward: referrerReward?.setting_value || null,
      refereeReward: refereeReward?.setting_value || null,
    };
  }),

  setAffiliateReferrerReward: adminProcedure
    .input(z.object({ amount: z.string().regex(/^\d*\.?\d+$/) }))
    .mutation(async ({ input }) => {
      return prisma.siteSettings.upsert({
        where: { setting_key: SITE_SETTINGS.AFFILIATE_REFERRER_REWARD },
        update: {
          setting_value: input.amount,
          value_type: "STRING",
        },
        create: {
          setting_key: SITE_SETTINGS.AFFILIATE_REFERRER_REWARD,
          setting_value: input.amount,
          value_type: "STRING",
        },
      });
    }),

  setAffiliateRefereeReward: adminProcedure
    .input(z.object({ amount: z.string().regex(/^\d*\.?\d+$/) }))
    .mutation(async ({ input }) => {
      return prisma.siteSettings.upsert({
        where: { setting_key: SITE_SETTINGS.AFFILIATE_REFEREE_REWARD },
        update: {
          setting_value: input.amount,
          value_type: "STRING",
        },
        create: {
          setting_key: SITE_SETTINGS.AFFILIATE_REFEREE_REWARD,
          setting_value: input.amount,
          value_type: "STRING",
        },
      });
    }),

  // Daily Airdrop Batch Settings
  getDailyAirdropStatus: adminProcedure.query(async () => {
    const [batchHour, minEntries, maxWaitHours] = await Promise.all([
      prisma.siteSettings.findUnique({
        where: { setting_key: "daily_airdrop_batch_hour" },
      }),
      prisma.siteSettings.findUnique({
        where: { setting_key: "daily_airdrop_min_entries" },
      }),
      prisma.siteSettings.findUnique({
        where: { setting_key: "daily_airdrop_max_wait_hours" },
      }),
    ]);

    const queueCount = await prisma.airdropQueueEntry.count();

    return {
      batchHour: Number(batchHour?.setting_value || 14),
      minEntries: Number(minEntries?.setting_value || 5),
      maxWaitHours: Number(maxWaitHours?.setting_value || 6),
      queueCount,
    };
  }),

  setDailyAirdropBatchHour: adminProcedure
    .input(z.object({ hour: z.number().min(0).max(23) }))
    .mutation(async ({ input }) => {
      return prisma.siteSettings.upsert({
        where: { setting_key: "daily_airdrop_batch_hour" },
        update: { setting_value: input.hour.toString(), value_type: "NUMBER" },
        create: { setting_key: "daily_airdrop_batch_hour", setting_value: input.hour.toString(), value_type: "NUMBER" },
      });
    }),

  setDailyAirdropMinEntries: adminProcedure
    .input(z.object({ count: z.number().min(1) }))
    .mutation(async ({ input }) => {
      return prisma.siteSettings.upsert({
        where: { setting_key: "daily_airdrop_min_entries" },
        update: { setting_value: input.count.toString(), value_type: "NUMBER" },
        create: { setting_key: "daily_airdrop_min_entries", setting_value: input.count.toString(), value_type: "NUMBER" },
      });
    }),

  triggerBatchNow: adminProcedure.mutation(async () => {
    const { sendPendingBatch } = await import("../../services/dailyAirdrop");
    await sendPendingBatch();
    return { success: true, message: "Batch send triggered" };
  }),
});
