import { TRPCError } from "@trpc/server";
import { z } from "zod";
import type { Prisma } from "@repo/database";
import { privateProcedure, publicProcedure, router } from "./trpc";
import { prisma } from "../services/DB";
import { enforceRateLimits } from "../utils/rateLimit";
import { hexToId, idToHex } from "../services/analytics/ids";
import { getFileUrl } from "../utils/fileUrlResolver";
import {
  FOLLOWER_COUNT_FLOOR,
  csvCell,
  decodeRestoreToken,
  encodeRestoreToken,
  publicCount,
} from "../services/follow/rules";

export { FOLLOWER_COUNT_FLOOR };

/**
 * Fan Graph (Build Board #22). Spec: docs/features/fan-graph.md.
 *
 * A follow counts while the follower's email is verified and the account is
 * not suspended. That is checked at read time, so a follow from an unverified
 * account starts "pending" and counts on its own once the email is confirmed.
 * Nothing here ever returns a follower's email or wallet address.
 */

const RESTORE_TOKEN_TTL_MS = 8_000;
// Follow then unfollow inside this window counts once in stats
const UNDO_WINDOW_MS = 10 * 60 * 1000;
const PAGE_SIZE = 30;

const FOLLOW_SOURCES = ["page", "explore", "pool", "broadcast", "qr"] as const;
const handleInput = z.string().trim().min(1).max(64);

/** Only follows from accounts that count: verified email, not suspended. */
const COUNTED_FOLLOWER: Prisma.UserWhereInput = { email_verified: true, block: "no" };

function rangeStart(range: "7d" | "30d" | "90d"): Date {
  const days = range === "7d" ? 7 : range === "30d" ? 30 : 90;
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000);
}

/** A published, not suspended creator page, found by handle. */
async function findCreator(handle: string) {
  const lower = handle.replace(/^@/, "").toLowerCase();
  const creator = await prisma.user.findFirst({
    where: { handle: lower, page_status: "PUBLISHED", block: "no" },
    select: { id: true, name: true, handle: true, show_follower_count: true },
  });
  if (!creator) throw new TRPCError({ code: "NOT_FOUND", message: "Page not found" });
  return creator;
}

async function countFollowers(creatorId: number) {
  return prisma.follow.count({ where: { creator_id: creatorId, follower: COUNTED_FOLLOWER } });
}

/** User ids among `userIds` with a stake above zero in any of the creator's pools. */
async function poolFanIds(creatorId: number, userIds?: number[]): Promise<Set<number>> {
  const wallet = await prisma.userWallet.findUnique({
    where: { userId: creatorId },
    select: { creatorPools: { select: { id: true } } },
  });
  const poolIds = wallet?.creatorPools.map(pool => pool.id) ?? [];
  if (poolIds.length === 0) return new Set();
  const stakes = await prisma.stakedPool.findMany({
    where: {
      poolId: { in: poolIds },
      NOT: { stakeAmount: "0" },
      ...(userIds ? { userWallet: { userId: { in: userIds } } } : {}),
    },
    select: { userWallet: { select: { userId: true } } },
  });
  return new Set(stakes.map(stake => stake.userWallet.userId));
}

/**
 * Batch check: which of `creatorIds` has the viewer as a pool fan (stake > 0
 * in any of that creator's pools). Returns a Set of creator IDs.
 */
async function batchPoolFanCreatorIds(
  creatorIds: number[],
  viewerId: number
): Promise<Set<number>> {
  const wallets = await prisma.userWallet.findMany({
    where: { userId: { in: creatorIds } },
    select: { userId: true, creatorPools: { select: { id: true } } },
  });
  const poolToCreator = new Map<number, number>();
  const allPoolIds: number[] = [];
  for (const wallet of wallets) {
    for (const pool of wallet.creatorPools) {
      allPoolIds.push(pool.id);
      poolToCreator.set(pool.id, wallet.userId);
    }
  }
  if (allPoolIds.length === 0) return new Set();
  const stakes = await prisma.stakedPool.findMany({
    where: {
      poolId: { in: allPoolIds },
      NOT: { stakeAmount: "0" },
      userWallet: { userId: viewerId },
    },
    select: { poolId: true },
  });
  const fanCreators = new Set<number>();
  for (const stake of stakes) {
    const creatorId = poolToCreator.get(stake.poolId);
    if (creatorId !== undefined) fanCreators.add(creatorId);
  }
  return fanCreators;
}

const followerFilterSchema = z.enum(["all", "new", "poolFans", "public"]).default("all");

async function followerWhere(
  creatorId: number,
  filter: z.infer<typeof followerFilterSchema>,
  q?: string
): Promise<Prisma.FollowWhereInput> {
  const where: Prisma.FollowWhereInput = {
    creator_id: creatorId,
    follower: {
      ...COUNTED_FOLLOWER,
      ...(q
        ? {
            OR: [
              { name: { contains: q } },
              { handle: { contains: q.replace(/^@/, "").toLowerCase() } },
            ],
          }
        : {}),
    },
  };
  if (filter === "new") where.created_at = { gte: rangeStart("7d") };
  if (filter === "public") where.show_publicly = true;
  if (filter === "poolFans") {
    const ids = [...(await poolFanIds(creatorId))];
    where.follower_id = { in: ids };
  }
  return where;
}

export const followRouter = router({
  /** Count and the viewer's own state, for the creator page capsule. */
  status: publicProcedure.input(z.object({ handle: handleInput })).query(async ({ ctx, input }) => {
    const creator = await findCreator(input.handle);
    const count = await countFollowers(creator.id);
    const base = { ...publicCount(count, creator.show_follower_count), creatorName: creator.name };
    if (!ctx.user) return { ...base, isOwner: false, viewer: null };

    const viewerId = ctx.user.sub;
    if (viewerId === creator.id) return { ...base, isOwner: true, viewer: null };

    const [row, viewer] = await Promise.all([
      prisma.follow.findUnique({
        where: { follower_id_creator_id: { follower_id: viewerId, creator_id: creator.id } },
        select: { show_publicly: true, email_updates: true },
      }),
      prisma.user.findUnique({
        where: { id: viewerId },
        select: { email_verified: true, follow_disclosure_seen_at: true },
      }),
    ]);
    return {
      ...base,
      isOwner: false,
      viewer: {
        following: !!row,
        pending: !!row && !viewer?.email_verified,
        showPublicly: row?.show_publicly ?? false,
        emailUpdates: row?.email_updates ?? false,
        disclosureSeen: !!viewer?.follow_disclosure_seen_at,
      },
    };
  }),

  follow: privateProcedure
    .input(
      z.object({
        handle: handleInput,
        source: z.enum(FOLLOW_SOURCES).default("page"),
        campaignId: z
          .string()
          .regex(/^[0-9a-f]{32}$/)
          .optional(),
        // Set when the follow comes from the first-follow sheet
        showPublicly: z.boolean().optional(),
        emailUpdates: z.boolean().optional(),
        fromDisclosure: z.boolean().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const viewerId = ctx.user!.sub;
      await enforceRateLimits(
        [
          { key: `follow:min:${viewerId}`, limit: 30, windowSeconds: 60 },
          { key: `follow:day:${viewerId}`, limit: 500, windowSeconds: 24 * 60 * 60 },
        ],
        "You're following too fast. Try again in a minute."
      );
      const creator = await findCreator(input.handle);
      if (creator.id === viewerId) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "You can't follow your own page." });
      }
      const blocked = await prisma.followBlock.findUnique({
        where: { creator_id_user_id: { creator_id: creator.id, user_id: viewerId } },
      });
      if (blocked)
        throw new TRPCError({ code: "FORBIDDEN", message: "You can't follow this creator." });

      // The campaign must belong to the creator, or it is dropped
      let campaignId: Buffer | null = null;
      if (input.campaignId) {
        const campaign = await prisma.analyticsCampaign.findFirst({
          where: { id: hexToId(input.campaignId), user_id: creator.id },
          select: { id: true },
        });
        campaignId = campaign ? Buffer.from(campaign.id) : null;
      }

      const emailUpdates = input.emailUpdates ?? false;
      await prisma.follow.upsert({
        where: { follower_id_creator_id: { follower_id: viewerId, creator_id: creator.id } },
        update: {},
        create: {
          follower_id: viewerId,
          creator_id: creator.id,
          source: input.source,
          campaign_id: campaignId,
          show_publicly: input.showPublicly ?? false,
          email_updates: emailUpdates,
          email_updates_at: emailUpdates ? new Date() : null,
        },
      });
      if (input.fromDisclosure) {
        await prisma.user.updateMany({
          where: { id: viewerId, follow_disclosure_seen_at: null },
          data: { follow_disclosure_seen_at: new Date() },
        });
      }
      const viewer = await prisma.user.findUnique({
        where: { id: viewerId },
        select: { email_verified: true },
      });
      return { following: true, pending: !viewer?.email_verified };
    }),

  unfollow: privateProcedure
    .input(z.object({ handle: handleInput }))
    .mutation(async ({ ctx, input }) => {
      const viewerId = ctx.user!.sub;
      await enforceRateLimits(
        [
          { key: `follow:min:${viewerId}`, limit: 30, windowSeconds: 60 },
          { key: `follow:day:${viewerId}`, limit: 500, windowSeconds: 24 * 60 * 60 },
        ],
        "You're following too fast. Try again in a minute."
      );
      const creator = await findCreator(input.handle);
      const row = await prisma.follow.findUnique({
        where: { follower_id_creator_id: { follower_id: viewerId, creator_id: creator.id } },
        select: { id: true, created_at: true },
      });
      if (row) {
        await prisma.follow.delete({ where: { id: row.id } });
        // A follow undone within 10 minutes is not counted as someone leaving
        if (Date.now() - row.created_at.getTime() > UNDO_WINDOW_MS) {
          await prisma.followRemoval.create({
            data: { creator_id: creator.id, reason: "unfollow" },
          });
        }
      }
      return { following: false };
    }),

  /** The fan's own per-creator settings. */
  update: privateProcedure
    .input(
      z.object({
        handle: handleInput,
        showPublicly: z.boolean().optional(),
        emailUpdates: z.boolean().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const creator = await findCreator(input.handle);
      const data: Prisma.FollowUpdateManyMutationInput = {};
      if (input.showPublicly !== undefined) data.show_publicly = input.showPublicly;
      if (input.emailUpdates !== undefined) {
        data.email_updates = input.emailUpdates;
        data.email_updates_at = new Date();
      }
      const result = await prisma.follow.updateMany({
        where: { follower_id: ctx.user!.sub, creator_id: creator.id },
        data,
      });
      if (result.count === 0)
        throw new TRPCError({ code: "NOT_FOUND", message: "You don't follow this creator." });
      return { ok: true };
    }),

  /** Explore, Following: the viewer's follows, newest first. Private to the viewer. */
  listFollowing: privateProcedure
    .input(z.object({ cursor: z.number().int().optional() }).optional())
    .query(async ({ ctx, input }) => {
      const viewerId = ctx.user!.sub;
      const rows = await prisma.follow.findMany({
        where: { follower_id: viewerId, creator: { page_status: "PUBLISHED", block: "no" } },
        orderBy: { id: "desc" },
        take: PAGE_SIZE + 1,
        ...(input?.cursor ? { cursor: { id: input.cursor }, skip: 1 } : {}),
        select: {
          id: true,
          created_at: true,
          show_publicly: true,
          email_updates: true,
          creator: {
            select: { id: true, name: true, handle: true, image: true, image_file_id: true },
          },
        },
      });
      const page = rows.slice(0, PAGE_SIZE);
      const creatorIds = page.map(row => row.creator.id);
      const fanCreatorIds = await batchPoolFanCreatorIds(creatorIds, viewerId);
      const items = await Promise.all(
        page.map(async row => ({
          creatorId: row.creator.id,
          name: row.creator.name,
          handle: row.creator.handle,
          image: await getFileUrl({
            legacyImageField: row.creator.image,
            imageFileId: row.creator.image_file_id,
          }).catch(() => null),
          followedAt: row.created_at,
          showPublicly: row.show_publicly,
          emailUpdates: row.email_updates,
          poolFan: fanCreatorIds.has(row.creator.id),
        }))
      );
      return { items, nextCursor: rows.length > PAGE_SIZE ? page[page.length - 1].id : null };
    }),

  /** People, Followers. Names, handles, dates and sources only. */
  listFollowers: privateProcedure
    .input(
      z.object({
        q: z.string().trim().max(64).optional(),
        filter: followerFilterSchema,
        sort: z.enum(["newest", "oldest", "name"]).default("newest"),
        cursor: z.number().int().min(0).optional(),
      })
    )
    .query(async ({ ctx, input }) => {
      await enforceRateLimits(
        [{ key: `followers:list:${ctx.user!.sub}`, limit: 60, windowSeconds: 60 }],
        "Too many requests. Try again in a minute."
      );
      const creatorId = ctx.user!.sub;
      const where = await followerWhere(creatorId, input.filter, input.q || undefined);
      const orderBy: Prisma.FollowOrderByWithRelationInput[] =
        input.sort === "oldest"
          ? [{ created_at: "asc" }, { id: "asc" }]
          : input.sort === "name"
            ? [{ follower: { name: "asc" } }, { id: "asc" }]
            : [{ created_at: "desc" }, { id: "desc" }];
      const offset = input.cursor ?? 0;
      const [total, rows] = await Promise.all([
        prisma.follow.count({ where }),
        prisma.follow.findMany({
          where,
          orderBy,
          skip: offset,
          take: PAGE_SIZE + 1,
          select: {
            follower_id: true,
            created_at: true,
            source: true,
            show_publicly: true,
            campaign: { select: { name: true } },
            follower: {
              select: { name: true, handle: true, image: true, image_file_id: true },
            },
          },
        }),
      ]);
      const page = rows.slice(0, PAGE_SIZE);
      const fans = await poolFanIds(
        creatorId,
        page.map(row => row.follower_id)
      );
      const items = await Promise.all(
        page.map(async row => ({
          userId: row.follower_id,
          name: row.follower.name,
          handle: row.follower.handle,
          image: await getFileUrl({
            legacyImageField: row.follower.image,
            imageFileId: row.follower.image_file_id,
          }).catch(() => null),
          followedAt: row.created_at,
          source: row.source,
          campaignName: row.campaign?.name ?? null,
          showPublicly: row.show_publicly,
          poolFan: fans.has(row.follower_id),
        }))
      );
      return { total, items, nextCursor: rows.length > PAGE_SIZE ? offset + PAGE_SIZE : null };
    }),

  /** People totals and sources for a range. Unfollows are counts only. */
  stats: privateProcedure
    .input(z.object({ range: z.enum(["7d", "30d", "90d"]).default("30d") }))
    .query(async ({ ctx, input }) => {
      const creatorId = ctx.user!.sub;
      const since = rangeStart(input.range);
      const counted = { creator_id: creatorId, follower: COUNTED_FOLLOWER };
      const [total, newInRange, unfollows, pageFollows, views, bySource, byCampaign, fans, me] =
        await Promise.all([
          prisma.follow.count({ where: counted }),
          prisma.follow.count({ where: { ...counted, created_at: { gte: since } } }),
          prisma.followRemoval.count({
            where: { creator_id: creatorId, created_at: { gte: since } },
          }),
          prisma.follow.count({
            where: { ...counted, source: "page", created_at: { gte: since } },
          }),
          prisma.analyticsEvent.count({
            where: { user_id: creatorId, type: "view", created_at: { gte: since } },
          }),
          prisma.follow.groupBy({
            by: ["source"],
            where: { ...counted, created_at: { gte: since }, campaign_id: null },
            _count: { _all: true },
          }),
          prisma.follow.groupBy({
            by: ["campaign_id"],
            where: { ...counted, created_at: { gte: since }, campaign_id: { not: null } },
            _count: { _all: true },
          }),
          poolFanIds(creatorId),
          prisma.user.findUnique({
            where: { id: creatorId },
            select: { show_follower_count: true },
          }),
        ]);
      const poolFanFollowers =
        fans.size === 0
          ? 0
          : await prisma.follow.count({ where: { ...counted, follower_id: { in: [...fans] } } });
      const campaignIds = byCampaign
        .map(row => row.campaign_id)
        .filter((id): id is Uint8Array => !!id);
      const campaigns = campaignIds.length
        ? await prisma.analyticsCampaign.findMany({
            where: { id: { in: campaignIds.map(id => Buffer.from(id)) } },
            select: { id: true, name: true },
          })
        : [];
      const campaignName = new Map(campaigns.map(c => [idToHex(c.id), c.name]));
      const sources = [
        ...bySource.map(row => ({
          label: row.source,
          kind: "source" as const,
          count: row._count._all,
        })),
        ...byCampaign.map(row => ({
          label: (row.campaign_id && campaignName.get(idToHex(row.campaign_id))) || "Campaign",
          kind: "campaign" as const,
          count: row._count._all,
        })),
      ].sort((a, b) => b.count - a.count);
      return {
        total,
        newInRange,
        unfollowsInRange: unfollows,
        // Follows from the page per page view, both counted for every visit
        followRate: views > 0 ? Math.round((pageFollows / views) * 1000) / 10 : null,
        poolFans: poolFanFollowers,
        poolFanShare: total > 0 ? Math.round((poolFanFollowers / total) * 100) : 0,
        sources,
        showFollowerCount: me?.show_follower_count ?? true,
      };
    }),

  removeFollower: privateProcedure
    .input(z.object({ userId: z.number().int().positive() }))
    .mutation(async ({ ctx, input }) => {
      const creatorId = ctx.user!.sub;
      const row = await prisma.follow.findUnique({
        where: { follower_id_creator_id: { follower_id: input.userId, creator_id: creatorId } },
      });
      if (!row)
        throw new TRPCError({ code: "NOT_FOUND", message: "This account doesn't follow you." });
      const [_, removal] = await prisma.$transaction([
        prisma.follow.delete({ where: { id: row.id } }),
        prisma.followRemoval.create({ data: { creator_id: creatorId, reason: "removed" } }),
      ]);
      const token = encodeRestoreToken({
        r: removal.id,
        f: row.follower_id,
        c: row.creator_id,
        p: row.show_publicly,
        e: row.email_updates,
        ea: row.email_updates_at?.toISOString() ?? null,
        s: row.source,
        k: row.campaign_id ? idToHex(row.campaign_id) : null,
        t: row.created_at.toISOString(),
        x: Date.now() + RESTORE_TOKEN_TTL_MS,
      });
      return { restoreToken: token };
    }),

  /** Undo for Remove follower, within 8 seconds. Restores the row as it was. */
  restoreFollower: privateProcedure
    .input(z.object({ token: z.string().min(10).max(2000) }))
    .mutation(async ({ ctx, input }) => {
      const row = decodeRestoreToken(input.token);
      if (!row || row.c !== ctx.user!.sub) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Undo is no longer available." });
      }
      const blocked = await prisma.followBlock.findUnique({
        where: { creator_id_user_id: { creator_id: row.c, user_id: row.f } },
      });
      if (blocked)
        throw new TRPCError({ code: "BAD_REQUEST", message: "Undo is no longer available." });
      await prisma.follow.upsert({
        where: { follower_id_creator_id: { follower_id: row.f, creator_id: row.c } },
        update: {},
        create: {
          follower_id: row.f,
          creator_id: row.c,
          show_publicly: row.p,
          email_updates: row.e,
          email_updates_at: row.ea ? new Date(row.ea) : null,
          source: row.s,
          campaign_id: row.k ? hexToId(row.k) : null,
          created_at: new Date(row.t),
        },
      });
      // The removal is undone, so it no longer counts as a departure
      if (row.r) await prisma.followRemoval.delete({ where: { id: row.r } });
      return { ok: true };
    }),

  blockFollower: privateProcedure
    .input(z.object({ userId: z.number().int().positive() }))
    .mutation(async ({ ctx, input }) => {
      const creatorId = ctx.user!.sub;
      if (input.userId === creatorId) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "You can't block yourself." });
      }
      const deleted = await prisma.follow.deleteMany({
        where: { follower_id: input.userId, creator_id: creatorId },
      });
      await prisma.followBlock.upsert({
        where: { creator_id_user_id: { creator_id: creatorId, user_id: input.userId } },
        update: {},
        create: { creator_id: creatorId, user_id: input.userId },
      });
      if (deleted.count > 0) {
        await prisma.followRemoval.create({ data: { creator_id: creatorId, reason: "blocked" } });
      }
      return { ok: true };
    }),

  unblock: privateProcedure
    .input(z.object({ userId: z.number().int().positive() }))
    .mutation(async ({ ctx, input }) => {
      await prisma.followBlock.deleteMany({
        where: { creator_id: ctx.user!.sub, user_id: input.userId },
      });
      return { ok: true };
    }),

  listBlocked: privateProcedure.query(async ({ ctx }) => {
    const rows = await prisma.followBlock.findMany({
      where: { creator_id: ctx.user!.sub },
      orderBy: { created_at: "desc" },
      take: 200,
      select: { created_at: true, user: { select: { id: true, name: true, handle: true } } },
    });
    return rows.map(row => ({
      userId: row.user.id,
      name: row.user.name,
      handle: row.user.handle,
      blockedAt: row.created_at,
    }));
  }),

  /** CSV with no email column (decision 7). */
  exportFollowers: privateProcedure
    .input(z.object({ filter: followerFilterSchema }))
    .mutation(async ({ ctx, input }) => {
      const creatorId = ctx.user!.sub;
      await enforceRateLimits(
        [{ key: `followers:export:${creatorId}`, limit: 5, windowSeconds: 24 * 60 * 60 }],
        "You can export 5 times a day. Try again tomorrow."
      );
      const where = await followerWhere(creatorId, input.filter);
      const rows = await prisma.follow.findMany({
        where,
        orderBy: { created_at: "desc" },
        take: 100_000,
        select: {
          follower_id: true,
          created_at: true,
          source: true,
          show_publicly: true,
          campaign: { select: { name: true } },
          follower: { select: { name: true, handle: true } },
        },
      });
      const fans = await poolFanIds(creatorId);
      const lines = [
        ["name", "handle", "followed_at", "source", "pool_fan", "shown_publicly"]
          .map(csvCell)
          .join(","),
        ...rows.map(row =>
          [
            row.follower.name,
            row.follower.handle ?? "",
            row.created_at.toISOString(),
            row.campaign?.name ? `campaign: ${row.campaign.name}` : row.source,
            fans.has(row.follower_id),
            row.show_publicly,
          ]
            .map(csvCell)
            .join(",")
        ),
      ];
      return { csv: lines.join("\n"), rows: rows.length };
    }),

  /** Followers who chose to appear publicly. Empty while the creator hides the count. */
  publicList: publicProcedure
    .input(z.object({ handle: handleInput, cursor: z.number().int().optional() }))
    .query(async ({ input }) => {
      const creator = await findCreator(input.handle);
      if (!creator.show_follower_count) return { items: [], nextCursor: null };
      const rows = await prisma.follow.findMany({
        where: {
          creator_id: creator.id,
          show_publicly: true,
          follower: COUNTED_FOLLOWER,
        },
        orderBy: { id: "desc" },
        take: PAGE_SIZE + 1,
        ...(input.cursor ? { cursor: { id: input.cursor }, skip: 1 } : {}),
        select: { id: true, follower: { select: { name: true, handle: true } } },
      });
      const page = rows.slice(0, PAGE_SIZE);
      return {
        items: page.map(row => ({ name: row.follower.name, handle: row.follower.handle })),
        nextCursor: rows.length > PAGE_SIZE ? page[page.length - 1].id : null,
      };
    }),

  setCountVisibility: privateProcedure
    .input(z.object({ show: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      await prisma.user.update({
        where: { id: ctx.user!.sub },
        data: { show_follower_count: input.show },
      });
      return { show: input.show };
    }),
});
