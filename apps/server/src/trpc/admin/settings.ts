import { adminProcedure, router } from "../trpc";
import { z } from "zod";
import { prisma } from "@repo/database";
import { FEATURE_FLAG_KEYS, SITE_SETTINGS, type FeatureFlagKey } from "@repo/constants";
import { listFeatureFlags, setFeatureFlag } from "../../services/featureFlags";
import { stakeKindsAllowlist } from "../../services/access/engine";
import { env } from "../../env";

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

  // Feature flags (packages/constants/src/feature-flags.ts): every flag with its row and fallback
  listFeatureFlags: adminProcedure.query(() => listFeatureFlags()),

  /** Turn a flag on or off, or pass null to drop the row so every app uses its environment again */
  setFeatureFlag: adminProcedure
    .input(
      z.object({
        key: z.enum(FEATURE_FLAG_KEYS as [FeatureFlagKey, ...FeatureFlagKey[]]),
        value: z.boolean().nullable(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      await setFeatureFlag(input.key, input.value, ctx.user!.sub);
      return { ok: true };
    }),

  // Access gating stake pilot (Build Board #21, spec 6): creator ids whose stake rules are live
  getStakeKindsAllowlist: adminProcedure.query(async () => {
    const row = await prisma.siteSettings.findUnique({
      where: { setting_key: SITE_SETTINGS.ACCESS_STAKE_KINDS_ALLOWLIST },
    });
    const list = await stakeKindsAllowlist();
    return {
      userIds: list
        .split(",")
        .map(value => value.trim())
        .filter(value => /^\d+$/.test(value))
        .map(Number),
      source: row ? ("setting" as const) : ("environment" as const),
      environmentValue: env.ACCESS_STAKE_KINDS_ALLOWLIST,
    };
  }),

  /** Set the creator ids, or pass null to drop the row and use the environment value again */
  setStakeKindsAllowlist: adminProcedure
    .input(z.object({ userIds: z.array(z.number().int().positive()).max(500).nullable() }))
    .mutation(async ({ ctx, input }) => {
      const key = SITE_SETTINGS.ACCESS_STAKE_KINDS_ALLOWLIST;
      if (input.userIds === null) {
        await prisma.siteSettings.deleteMany({ where: { setting_key: key } });
      } else {
        const value = [...new Set(input.userIds)].sort((a, b) => a - b).join(",");
        await prisma.siteSettings.upsert({
          where: { setting_key: key },
          create: { setting_key: key, setting_value: value, value_type: "STRING" },
          update: { setting_value: value, value_type: "STRING" },
        });
      }
      console.info(
        `[access admin] admin ${ctx.user!.sub} set the stake allowlist to ${
          input.userIds === null ? "environment default" : input.userIds.length + " creators"
        }`
      );
      return { ok: true };
    }),
});
