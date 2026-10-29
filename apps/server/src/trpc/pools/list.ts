import { publicProcedure, router } from "../trpc";
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { prisma } from "@repo/database";
import type { Address, PublicClient } from "viem";
import { createPublicClient } from "viem";
import { calculatePoolAPY, getChainConfig, getRpcTransport } from "@repo/web3";
import type { PoolTabRewardPool } from "@repo/constants";
import { s3Service } from "../../services/S3Service";
import {
  cache,
  CACHE_TTL,
  getAPYCacheKey,
  getPoolsCacheKey,
  getRedisClient,
} from "../../utils/cache";
import { enforceRateLimits } from "../../utils/rateLimit";
import { getVisitorIp } from "../../services/analytics/visitorIp";
import { poolsListVersionKey } from "../../services/poolStats";
import {
  POOL_LIST_FILTERS,
  POOL_LIST_SORTS,
  countQuery,
  cursorAfter,
  decodeCursor,
  encodeCursor,
  pageQuery,
  parseSearch,
  sitemapQuery,
  type PageRow,
} from "../../services/poolList";

/**
 * Pool list paging (Build Board D7, PL2). Spec: docs/features/pools-list-paging.md section 4.
 * pools.fan.getPools stays as it is until PL4, so builds deployed before PL3 keep working.
 */

const FIRST_PAGE_TTL_SECONDS = 60;
const SITEMAP_TTL_SECONDS = 3600;
const APY_REFRESH_LOCK_SECONDS = 60;

export interface PoolListPage {
  pools: PoolTabRewardPool[];
  nextCursor: string | null;
  /** First page only */
  total: number | null;
}

/** Cached form: bigints travel as text through JSON. */
type CachedPage = Omit<PoolListPage, "pools"> & {
  pools: (Omit<PoolTabRewardPool, "stakedAmount"> & { stakedAmount: string })[];
};

async function listVersion(chainId: string): Promise<number> {
  return (await cache.get<number>(poolsListVersionKey(chainId))) ?? 0;
}

/**
 * One APY refresh per pool at a time across instances. The page never waits:
 * a miss returns no APY and the next request after the refresh has it.
 */
function scheduleApyRefresh(chainId: number, addresses: Address[]) {
  if (addresses.length === 0) return;
  setImmediate(async () => {
    try {
      const redis = getRedisClient();
      const mine: Address[] = [];
      for (const address of addresses) {
        const key = `pools:apy:lock:${chainId}:${address}`;
        const locked = redis
          ? await redis.set(key, "1", "EX", APY_REFRESH_LOCK_SECONDS, "NX").catch(() => "OK")
          : "OK";
        if (locked === "OK") mine.push(address);
      }
      if (mine.length === 0) return;
      const chain = getChainConfig(chainId);
      if (!chain) return;
      const client = createPublicClient({ chain, transport: getRpcTransport(chain) });
      const results = await calculatePoolAPY(mine, chainId, client as PublicClient);
      for (const [address, apy] of Object.entries(results)) {
        if (apy !== null) {
          await cache.set(getAPYCacheKey(chainId, address as Address), apy, CACHE_TTL.APY);
        }
      }
    } catch (error) {
      console.warn("[pools.list] APY refresh failed", error);
    }
  });
}

async function toCards(rows: PageRow[], chainId: string): Promise<PoolTabRewardPool[]> {
  const chain = Number(chainId);
  const missingApy: Address[] = [];
  const cards = await Promise.all(
    rows.map(async row => {
      const address = row.poolAddress as Address;
      const [live, apy] = await Promise.all([
        cache.get<{ totalStake?: string }>(getPoolsCacheKey(chain, address)),
        cache.get<number>(getAPYCacheKey(chain, address)),
      ]);
      if (apy === null) missingApy.push(address);
      // Decision P3: database columns, replaced by the live total when cached.
      // Fans always come from the column, so the creator never counts (P4).
      let stakedAmount = BigInt(row.totalStakeWei.split(".")[0] || "0");
      if (live?.totalStake) {
        try {
          stakedAmount = BigInt(live.totalStake);
        } catch {
          // keep the column value
        }
      }
      const card: PoolTabRewardPool = {
        id: Number(row.id),
        name: row.nameKey,
        description: row.description,
        chainId: row.chainId,
        address,
        image:
          row.imageFileId && row.s3Key
            ? { id: Number(row.imageFileId), url: s3Service.getFileUrl(row.s3Key) }
            : null,
        stakedAmount,
        fans: Number(row.activeFans),
        apy: apy ?? undefined,
      };
      return card;
    })
  );
  scheduleApyRefresh(chain, missingApy);
  return cards;
}

const listInput = z.object({
  chainId: z.string(),
  search: z.string().trim().max(64).optional(),
  filter: z.enum(POOL_LIST_FILTERS).default("all"),
  sort: z.enum(POOL_LIST_SORTS).default("newest"),
  limit: z.number().int().min(1).max(48).default(24),
  cursor: z.string().max(256).optional(),
});

export const poolsListRouter = router({
  /**
   * One page of listed pools, cursor paged (spec 4). Filters and sorts run in
   * SQL; chain reads only for the cards on the page, from cache.
   */
  listPools: publicProcedure
    .input(listInput)
    .query(async ({ ctx, input }): Promise<PoolListPage> => {
      const term = parseSearch(input.search);
      const ip = getVisitorIp(ctx.req).ip || "unknown";
      await enforceRateLimits(
        term.kind === "none"
          ? [{ key: `pools-list:${ip}`, limit: 120, windowSeconds: 60 }]
          : [
              { key: `pools-list:${ip}`, limit: 120, windowSeconds: 60 },
              { key: `pools-search:${ip}`, limit: 30, windowSeconds: 60 },
            ],
        "Too many requests. Try again in a minute."
      );

      if (!getChainConfig(Number(input.chainId))) {
        return { pools: [], nextCursor: null, total: 0 };
      }

      const cursor = input.cursor ? decodeCursor(input.cursor, input.sort) : null;
      if (input.cursor && !cursor) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "This list changed. Reload it." });
      }

      const firstPage = !cursor;
      const cacheable = firstPage && term.kind === "none";
      let cacheKey: string | null = null;
      if (cacheable) {
        const version = await listVersion(input.chainId);
        cacheKey = `pools:list:v${version}:${input.chainId}:${input.filter}:${input.sort}:${input.limit}`;
        const cached = await cache.get<CachedPage>(cacheKey);
        if (cached) {
          return {
            ...cached,
            pools: cached.pools.map(pool => ({ ...pool, stakedAmount: BigInt(pool.stakedAmount) })),
          };
        }
      }

      try {
        const [rows, totalRows] = await Promise.all([
          prisma.$queryRaw<PageRow[]>(
            pageQuery({
              chainId: input.chainId,
              filter: input.filter,
              sort: input.sort,
              limit: input.limit,
              term,
              cursor,
            })
          ),
          firstPage
            ? prisma.$queryRaw<{ total: number | bigint }[]>(
                countQuery(input.chainId, input.filter, term)
              )
            : Promise.resolve(null),
        ]);

        const pageRows = rows.slice(0, input.limit);
        const hasMore = rows.length > input.limit;
        const page: PoolListPage = {
          pools: await toCards(pageRows, input.chainId),
          nextCursor: hasMore
            ? encodeCursor(cursorAfter(pageRows[pageRows.length - 1], input.sort))
            : null,
          total: totalRows ? Number(totalRows[0]?.total ?? 0) : null,
        };

        if (cacheKey) {
          const toCache: CachedPage = {
            ...page,
            pools: page.pools.map(pool => ({
              ...pool,
              stakedAmount: pool.stakedAmount.toString(),
            })),
          };
          await cache.set(cacheKey, toCache, FIRST_PAGE_TTL_SECONDS);
        }
        return page;
      } catch (error) {
        console.error("[pools.list] listPools failed", error);
        if (error instanceof TRPCError) throw error;
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Failed to load pools" });
      }
    }),

  /** Every listed pool for the sitemap (spec 5). No chain reads, cached 1 hour. */
  sitemapPools: publicProcedure
    .input(z.object({ chainId: z.string() }))
    .query(async ({ input }): Promise<{ address: string; updatedAt: string }[]> => {
      if (!getChainConfig(Number(input.chainId))) return [];
      const key = `pools:sitemap:${input.chainId}`;
      const cached = await cache.get<{ address: string; updatedAt: string }[]>(key);
      if (cached) return cached;
      const rows = await prisma.$queryRaw<{ address: string; updatedAt: Date }[]>(
        sitemapQuery(input.chainId)
      );
      const entries = rows.map(row => ({
        address: row.address,
        updatedAt: new Date(row.updatedAt).toISOString(),
      }));
      await cache.set(key, entries, SITEMAP_TTL_SECONDS);
      return entries;
    }),
});
