import { adminProcedure, router } from "../trpc";
import { z } from "zod";
import { prisma } from "../../services/DB";
import { SITE_SETTINGS } from "@ampedbio/constants";

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
});
