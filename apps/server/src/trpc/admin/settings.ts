import { adminProcedure, router } from "../trpc";
import { z } from "zod";
import { prisma } from "../../services/DB";

export const settingsRouter = router({
  getFaucetStatus: adminProcedure.query(async () => {
    const faucetStatus = await prisma.siteSettings.findUnique({
      where: { setting_key: "faucet_enabled" },
    });
    return faucetStatus?.setting_value === "true";
  }),

  setFaucetStatus: adminProcedure
    .input(z.object({ enabled: z.boolean() }))
    .mutation(async ({ input }) => {
      return prisma.siteSettings.upsert({
        where: { setting_key: "faucet_enabled" },
        update: {
          setting_value: input.enabled.toString(),
          value_type: "BOOLEAN",
        },
        create: {
          setting_key: "faucet_enabled",
          setting_value: input.enabled.toString(),
          value_type: "BOOLEAN",
        },
      });
    }),

  // Affiliate Rewards Settings
  getAffiliateRewardsStatus: adminProcedure.query(async () => {
    const [referrerReward, refereeReward] = await Promise.all([
      prisma.siteSettings.findUnique({
        where: { setting_key: "affiliate_referrer_reward" },
      }),
      prisma.siteSettings.findUnique({
        where: { setting_key: "affiliate_referee_reward" },
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
        where: { setting_key: "affiliate_referrer_reward" },
        update: {
          setting_value: input.amount,
          value_type: "STRING",
        },
        create: {
          setting_key: "affiliate_referrer_reward",
          setting_value: input.amount,
          value_type: "STRING",
        },
      });
    }),

  setAffiliateRefereeReward: adminProcedure
    .input(z.object({ amount: z.string().regex(/^\d*\.?\d+$/) }))
    .mutation(async ({ input }) => {
      return prisma.siteSettings.upsert({
        where: { setting_key: "affiliate_referee_reward" },
        update: {
          setting_value: input.amount,
          value_type: "STRING",
        },
        create: {
          setting_key: "affiliate_referee_reward",
          setting_value: input.amount,
          value_type: "STRING",
        },
      });
    }),
});
