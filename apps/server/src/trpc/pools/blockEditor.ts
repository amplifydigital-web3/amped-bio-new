import { privateProcedure, publicProcedure, router } from "../trpc";
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { prisma } from "@repo/database";
import type { PoolSearchResult } from "@repo/constants";
import { s3Service } from "../../services/S3Service";

// Screen Review 038. Pool search for the Creator pool block in the editor.
// Replaces fan.searchPoolsForBlockEditor, which the client no longer calls.

const poolSearchSelect = {
  id: true,
  name: true,
  poolAddress: true,
  poolImage: { select: { s3_key: true } },
  wallet: { select: { user: { select: { handle: true } } } },
  stakedPools: { select: { stakeAmount: true } },
} as const;

type PoolSearchRow = {
  id: number;
  name: string | null;
  poolAddress: string | null;
  poolImage: { s3_key: string } | null;
  wallet: { user: { handle: string | null } | null } | null;
  stakedPools: { stakeAmount: string }[];
};

// Fans count only wallets with a positive stake
function toPoolSearchResult(pool: PoolSearchRow): PoolSearchResult {
  return {
    id: pool.id,
    name: pool.name || `Pool ${pool.id}`,
    address: pool.poolAddress!,
    fans: pool.stakedPools.filter(staked => BigInt(staked.stakeAmount) > 0n).length,
    creatorHandle: pool.wallet?.user?.handle || null,
    imageUrl: pool.poolImage ? s3Service.getFileUrl(pool.poolImage.s3_key) : null,
  };
}

export const poolsBlockEditorRouter = router({
  /**
   * Pool search for the Creator pool block (Screen Review 038 I06, I11). Every
   * non hidden pool on the chain is searchable. Text matches the pool name,
   * the creator @handle, the creator display name, the description and the
   * address, ranked by name prefix, then name, then the rest. A full 0x
   * address returns that exact pool, which also resolves a saved block.
   */
  search: publicProcedure
    .input(
      z.object({
        chainId: z.string(),
        search: z.string().trim().min(2, "Search must be at least 2 characters"),
        limit: z.number().int().min(1).max(8).optional().default(8),
      })
    )
    .query(async ({ input }): Promise<PoolSearchResult[]> => {
      try {
        const search = input.search.trim();
        const isAddress = /^0x[a-fA-F0-9]{40}$/.test(search);
        const handle = search.replace(/^@/, "");

        const pools = await prisma.creatorPool.findMany({
          where: {
            chainId: input.chainId,
            poolAddress: { not: null },
            AND: [
              { OR: [{ hidden: false }, { hidden: null }] },
              isAddress
                ? { poolAddress: { equals: search.toLowerCase() } }
                : {
                    OR: [
                      { name: { contains: search } },
                      { wallet: { user: { handle: { contains: handle } } } },
                      { wallet: { user: { name: { contains: search } } } },
                      { description: { contains: search } },
                      { poolAddress: { contains: search } },
                    ],
                  },
            ],
          },
          // Rank in memory, so take a wider set than the page shows
          take: isAddress ? 1 : 40,
          select: poolSearchSelect,
        });

        const results = pools.map(toPoolSearchResult);
        if (isAddress) return results;

        const term = search.toLowerCase();
        const rank = (pool: PoolSearchResult) => {
          const name = pool.name.toLowerCase();
          if (name.startsWith(term)) return 0;
          if (name.includes(term)) return 1;
          if (pool.creatorHandle?.toLowerCase().includes(handle.toLowerCase())) return 2;
          return 3;
        };
        return results.sort((a, b) => rank(a) - rank(b) || b.fans - a.fans).slice(0, input.limit);
      } catch (error) {
        console.error("Error searching pools for block editor:", error);
        if (error instanceof TRPCError) throw error;
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to search pools",
        });
      }
    }),

  /** The signed in creator's own pool on the chain, for Your pool (038 I02). */
  myPool: privateProcedure
    .input(z.object({ chainId: z.string() }))
    .query(async ({ ctx, input }): Promise<PoolSearchResult | null> => {
      try {
        const pool = await prisma.creatorPool.findFirst({
          where: {
            chainId: input.chainId,
            poolAddress: { not: null },
            wallet: { userId: ctx.user!.sub },
          },
          select: poolSearchSelect,
        });
        return pool ? toPoolSearchResult(pool) : null;
      } catch (error) {
        console.error("Error loading the creator pool for block editor:", error);
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to load your pool",
        });
      }
    }),
});
