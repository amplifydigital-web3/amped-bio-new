import { privateProcedure, publicProcedure, router } from "../trpc";
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { prisma } from "@repo/database";
import type { PoolSearchResult } from "@repo/constants";
import { s3Service } from "../../services/S3Service";
import { blockSearchQuery, parseSearch, type BlockSearchRow } from "../../services/poolList";

// Screen Review 038. Pool search for the Creator pool block in the editor.
// Search runs on the pool list rules (Build Board D7, PL3): the same listed
// pools and search tiers as pools.list.listPools.

const poolSearchSelect = {
  id: true,
  name: true,
  poolAddress: true,
  poolImage: { select: { s3_key: true } },
  wallet: { select: { user: { select: { handle: true } } } },
  activeFans: true,
} as const;

type PoolSearchRow = {
  id: number;
  name: string | null;
  poolAddress: string | null;
  poolImage: { s3_key: string } | null;
  wallet: { user: { handle: string | null } | null } | null;
  activeFans: number;
};

// Fans from active_fans: other wallets with a positive stake (decision P4)
function toPoolSearchResult(pool: PoolSearchRow): PoolSearchResult {
  return {
    id: pool.id,
    name: pool.name || `Pool ${pool.id}`,
    address: pool.poolAddress!,
    fans: pool.activeFans,
    creatorHandle: pool.wallet?.user?.handle || null,
    imageUrl: pool.poolImage ? s3Service.getFileUrl(pool.poolImage.s3_key) : null,
  };
}

export const poolsBlockEditorRouter = router({
  /**
   * Pool search for the Creator pool block (Screen Review 038 I06, I11). The
   * pool list rules (spec section 5): listed pools only (not hidden, creator
   * not suspended). Text matches the pool name, the creator @handle, the
   * creator display name and the description, by tier (name or handle prefix,
   * then contains, then description), then most fans. A full 0x address
   * returns that exact pool, which also resolves a saved block.
   */
  search: publicProcedure
    .input(
      z.object({
        chainId: z.string(),
        search: z.string().trim().min(2, "Search must be at least 2 characters").max(64),
        limit: z.number().int().min(1).max(10).optional().default(8),
      })
    )
    .query(async ({ input }): Promise<PoolSearchResult[]> => {
      try {
        const term = parseSearch(input.search);
        const rows = await prisma.$queryRaw<BlockSearchRow[]>(
          blockSearchQuery(input.chainId, term, term.kind === "address" ? 1 : input.limit)
        );
        // Fans from active_fans, so the creator never counts (decision P4)
        return rows.map(row => ({
          id: Number(row.id),
          name: row.nameKey,
          address: row.poolAddress,
          fans: Number(row.activeFans),
          creatorHandle: row.handle || null,
          imageUrl: row.s3Key ? s3Service.getFileUrl(row.s3Key) : null,
        }));
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
