import { privateProcedure, router } from "./trpc";
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { prisma } from "../services/DB";
import { createPublicClient, http } from "viem";
import { mainnet } from "viem/chains";
import { CREATOR_POOL_FACTORY_ABI } from "@amped-bio/web3";

const CREATOR_POOL_FACTORY_ADDRESS = "0xd4A49616cB954A2338ea1794C1EDa9d1254B23f0";

export const poolsRouter = router({
  create: privateProcedure
    .input(
      z.object({
        name: z.string(),
        creatorCut: z.number(),
        description: z.string().optional(),
        image_file_id: z.number().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.user.sub;

      try {
        const pool = await prisma.creatorPool.create({
          data: {
            userId,
            name: input.name,
            creatorCut: input.creatorCut,
            description: input.description,
            image_file_id: input.image_file_id,
          },
        });
        return pool;
      } catch (error) {
        console.error("Error creating pool:", error);
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to create pool",
        });
      }
    }),

  updateAddress: privateProcedure
    .input(
      z.object({
        id: z.number(),
        poolAddress: z.string(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.user.sub;

      try {
        const pool = await prisma.creatorPool.findUnique({
          where: { id: input.id, userId },
          include: { user: { include: { wallet: true } } },
        });

        if (!pool) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Pool not found",
          });
        }

        if (!pool.user.wallet) {
          throw new TRPCError({
            code: "PRECONDITION_FAILED",
            message: "User does not have a wallet",
          });
        }

        const publicClient = createPublicClient({
          chain: mainnet,
          transport: http(),
        });

        const contractPoolAddress = await publicClient.readContract({
          address: CREATOR_POOL_FACTORY_ADDRESS,
          abi: CREATOR_POOL_FACTORY_ABI,
          functionName: "getPoolForCreator",
          args: [pool.user.wallet.address as `0x${string}`],
        });

        if (contractPoolAddress.toLowerCase() !== input.poolAddress.toLowerCase()) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Pool address does not match on-chain address",
          });
        }

        const updatedPool = await prisma.creatorPool.update({
          where: { id: input.id },
          data: {
            poolAddress: input.poolAddress,
          },
        });
        return updatedPool;
      } catch (error) {
        console.error("Error updating pool address:", error);
        if (error instanceof TRPCError) throw error;
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to update pool address",
        });
      }
    }),
});
