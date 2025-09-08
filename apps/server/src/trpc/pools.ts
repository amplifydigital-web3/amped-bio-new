import { privateProcedure, router } from "./trpc";
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { prisma } from "../services/DB";
import { createPublicClient, http } from "viem";
import { getChainConfig, CREATOR_POOL_FACTORY_ABI } from "@ampedbio/web3";

export const poolsRouter = router({
  create: privateProcedure
    .input(
      z.object({
        description: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.user.sub;
      let pool: Awaited<ReturnType<typeof prisma.creatorPool.create>> | null = null;

      try {
        pool = await prisma.creatorPool.create({
          data: {
            userId,
            description: input.description,
          },
        });
        return pool;
      } catch (error) {
        console.error("Error creating pool:", error);
        if (pool) {
          try {
            await prisma.creatorPool.delete({
              where: { id: pool.id },
            });
          } catch (cleanupError) {
            console.error("Error during pool creation cleanup:", cleanupError);
          }
        }
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
        chainId: z.number(),
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

        const chain = getChainConfig(input.chainId);

        if (!chain) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Unsupported chain ID",
          });
        }

        const publicClient = createPublicClient({
          chain: chain,
          transport: http(),
        });

        const contractPoolAddress = await publicClient.readContract({
          address: chain.contracts.CREATOR_POOL_FACTORY.address,
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

  setImageForPool: privateProcedure
    .input(
      z.object({
        id: z.number(),
        image_file_id: z.number(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.user.sub;

      try {
        const pool = await prisma.creatorPool.findUnique({
          where: { id: input.id, userId },
        });

        if (!pool) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Pool not found",
          });
        }

        const updatedPool = await prisma.creatorPool.update({
          where: { id: input.id },
          data: {
            image_file_id: input.image_file_id,
          },
        });
        return updatedPool;
      } catch (error) {
        console.error("Error setting pool image:", error);
        if (error instanceof TRPCError) throw error;
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to set pool image",
        });
      }
    }),
});
