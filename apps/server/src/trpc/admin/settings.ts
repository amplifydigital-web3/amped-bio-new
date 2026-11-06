import { adminProcedure, router } from "../trpc";
import { z } from "zod";
import { prisma } from "@repo/database";
import { FEATURE_FLAG_KEYS, SITE_SETTINGS, type FeatureFlagKey } from "@repo/constants";
import { listFeatureFlags, setFeatureFlag } from "../../services/featureFlags";
import {
  parseStakeKindsAllowlist,
  readStakeKindsAllowlist,
  setStakeKindsAllowlist,
} from "../../services/access/allowlist";
import { env } from "../../env";

/** users.id is a signed INT: anything above it can never match a creator */
const USER_ID_MAX = 2_147_483_647;

export const stakeKindsAllowlistInput = z.object({
  userIds: z.array(z.number().int().positive().max(USER_ID_MAX)).max(500).nullable(),
});

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
    // One fresh read, so the list and its source always agree
    const { value, source } = await readStakeKindsAllowlist({ fresh: true });
    const userIds = [...new Set(parseStakeKindsAllowlist(value))];
    // Handles so the admin sees who is on the list; an id with no user shows as unknown
    const users = userIds.length
      ? await prisma.user.findMany({
          where: { id: { in: userIds } },
          select: { id: true, handle: true },
        })
      : [];
    const handles = new Map(users.map(user => [user.id, user.handle]));
    return {
      userIds,
      creators: userIds.map(id => ({
        id,
        handle: handles.get(id) ?? null,
        found: handles.has(id),
      })),
      source,
      environmentValue: env.ACCESS_STAKE_KINDS_ALLOWLIST,
    };
  }),

  /** Set the creator ids, or pass null to drop the row and use the environment value again */
  setStakeKindsAllowlist: adminProcedure
    .input(stakeKindsAllowlistInput)
    .mutation(async ({ ctx, input }) => {
      await setStakeKindsAllowlist(input.userIds, ctx.user!.sub);
      return { ok: true };
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

    const parse = (row: { setting_value: string } | null, fallback: number): number => {
      const value = Number(row?.setting_value);
      return Number.isFinite(value) ? value : fallback;
    };

    return {
      batchHour: parse(batchHour, 14),
      minEntries: parse(minEntries, 5),
      maxWaitHours: parse(maxWaitHours, 6),
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
