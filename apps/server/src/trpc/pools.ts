import { privateProcedure, router } from "./trpc";
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { prisma } from "../services/DB";
import { Address, createPublicClient, http, zeroAddress } from "viem";
import { getChainConfig, CREATOR_POOL_FACTORY_ABI } from "@ampedbio/web3";

export const poolsRouter = router({
  create: privateProcedure
    .input(
      z.object({
        description: z.string().optional(),
        chainId: z.string(), // Now required and string type for large chain IDs
      })
    )
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.user.sub;

      const wallet = await prisma.userWallet.findUnique({
        where: { userId },
      });

      if (!wallet) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: "User does not have a wallet",
        });
      }

      try {
        // Check if a pool already exists for this user and chain
        const existingPool = await prisma.creatorPool.findUnique({
          where: {
            userId_chainId: {
              userId,
              chainId: input.chainId,
            },
          },
        });

        if (existingPool) {
          throw new TRPCError({
            code: "CONFLICT",
            message: "Pool already exists for this chain",
          });
        }

        const pool = await prisma.creatorPool.create({
          data: {
            userId,
            chainId: input.chainId,
            description: input.description,
          },
        });

        return { id: pool.id };
      } catch (error) {
        console.error("Error creating pool:", error);
        if (error instanceof TRPCError) throw error;

        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to create pool",
        });
      }
    }),

  confirmPoolCreation: privateProcedure
    .input(
      z.object({
        chainId: z.string(), // Changed to string for large chain IDs
      })
    )
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.user.sub;

      try {
        // Find the pool for this specific user and chain
        const pool = await prisma.creatorPool.findUnique({
          where: {
            userId_chainId: {
              userId,
              chainId: input.chainId,
            },
          },
          include: { user: { include: { wallet: true } } },
        });

        if (!pool) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Pool not found for this chain",
          });
        }

        const chainIdNum = parseInt(input.chainId);
        const chain = getChainConfig(chainIdNum);

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

        const contractPoolAddress = (await publicClient.readContract({
          address: chain.contracts.CREATOR_POOL_FACTORY.address,
          abi: CREATOR_POOL_FACTORY_ABI,
          functionName: "getPoolForCreator",
          args: [pool.user.wallet!.address as `0x${string}`],
        })) as Address;

        if (zeroAddress === contractPoolAddress) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "No pool found for creator on-chain",
          });
        }

        await prisma.creatorPool.update({
          where: {
            userId_chainId: {
              userId: pool.userId,
              chainId: input.chainId,
            },
          },
          data: {
            poolAddress: contractPoolAddress,
          },
        });

        return { id: pool.id };
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
