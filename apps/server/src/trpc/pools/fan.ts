import { privateProcedure, publicProcedure, router } from "../trpc";
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { prisma } from "../../services/DB";
import { Address, createPublicClient, http, decodeEventLog, formatEther } from "viem";
import { getChainConfig, L2_BASE_TOKEN_ABI, CREATOR_POOL_ABI, getPoolName } from "@ampedbio/web3";
import { s3Service } from "../../services/S3Service";

export const poolsFanRouter = router({
  getPools: publicProcedure
    .input(
      z.object({
        search: z.string().optional(),
      })
    )
    .query(async ({ input }) => {
      try {
        const whereClause: any = {};
        if (input.search) {
          whereClause.OR = [
            { description: { contains: input.search, mode: "insensitive" } },
            { title: { contains: input.search, mode: "insensitive" } },
          ];
        }

        const pools = await prisma.creatorPool.findMany({
          where: whereClause,
          include: {
            poolImage: {
              select: {
                s3_key: true,
                bucket: true,
              },
            },
            wallet: {
              select: {
                address: true,
              },
            },
            _count: {
              select: {
                stakedPools: true,
              },
            },
            stakedPools: {
              select: {
                stakeAmount: true,
              },
            },
          },
        });

        return Promise.all(
          pools.map(async pool => {
            const totalStake = pool.stakedPools.reduce(
              (sum: bigint, staked) => sum + BigInt(staked.stakeAmount),
              0n
            );
            const totalStakeInEther = parseFloat(formatEther(totalStake));
            const poolName = await getPoolName(pool.poolAddress as Address, parseInt(pool.chainId));

            // Count only users with positive stake amounts
            const activeStakers = pool.stakedPools.filter(
              staked => BigInt(staked.stakeAmount) > 0n
            ).length;

            return {
              ...pool,
              imageUrl: pool.poolImage ? s3Service.getFileUrl(pool.poolImage.s3_key) : null,
              title: pool.description || `Pool ${pool.id}`,
              name: poolName,
              totalReward: totalStakeInEther,
              participants: activeStakers,
              category: "staking",
              createdBy: "Unknown",
              stakedAmount: totalStakeInEther,
              earnedRewards: 0,
              estimatedRewards: 0,
              creatorAddress: pool.wallet?.address || null,
            };
          })
        );
      } catch (error) {
        console.error("Error fetching pools:", error);
        if (error instanceof TRPCError) throw error;
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to fetch pools",
        });
      }
    }),

  getUserPoolStake: privateProcedure
    .input(
      z.object({
        chainId: z.string(),
      })
    )
    .query(async ({ ctx, input }) => {
      const userId = ctx.user.sub;

      try {
        const userWallet = await prisma.userWallet.findUnique({
          where: { userId },
        });

        if (!userWallet) {
          throw new TRPCError({
            code: "PRECONDITION_FAILED",
            message: "User does not have a wallet",
          });
        }

        const pool = await prisma.creatorPool.findUnique({
          where: {
            walletId_chainId: {
              walletId: userWallet.id,
              chainId: input.chainId,
            },
          },
        });

        if (!pool) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Pool not found",
          });
        }

        const stakedPool = await prisma.stakedPool.findUnique({
          where: {
            userWalletId_poolId: {
              userWalletId: userWallet.id,
              poolId: pool.id,
            },
          },
        });

        return {
          userWalletId: userWallet.id,
          poolId: pool.id,
          stakeAmount: stakedPool?.stakeAmount?.toString() || "0",
          hasStake: !!stakedPool,
        };
      } catch (error) {
        console.error("Error getting user pool stake:", error);
        if (error instanceof TRPCError) throw error;
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to get user pool stake",
        });
      }
    }),

  getUserStakes: privateProcedure.query(async ({ ctx }) => {
    const userId = ctx.user.sub;

    try {
      const userWallet = await prisma.userWallet.findUnique({
        where: { userId },
      });

      if (!userWallet) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: "User does not have a wallet",
        });
      }

      const userStakes = await prisma.stakedPool.findMany({
        where: {
          userWalletId: userWallet.id,
        },
        include: {
          pool: {
            include: {
              poolImage: {
                select: {
                  s3_key: true,
                },
              },
            },
          },
        },
      });

      return userStakes.map(stake => {
        const { pool } = stake;
        return {
          ...stake,
          stakeAmount: stake.stakeAmount,
          pool: {
            ...pool,
            imageUrl: pool.poolImage ? s3Service.getFileUrl(pool.poolImage.s3_key) : null,
          },
        };
      });
    } catch (error) {
      console.error("Error getting user stakes:", error);
      if (error instanceof TRPCError) throw error;
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: "Failed to get user stakes",
      });
    }
  }),

  confirmStake: privateProcedure
    .input(
      z.object({
        chainId: z.string(),
        hash: z.string().regex(/^0x[0-9a-fA-F]{64}$/, "Invalid transaction hash format"),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.user.sub;

      try {
        const userWallet = await prisma.userWallet.findUnique({
          where: { userId },
        });

        if (!userWallet) {
          throw new TRPCError({
            code: "PRECONDITION_FAILED",
            message: "User does not have a wallet",
          });
        }

        const chain = getChainConfig(parseInt(input.chainId));

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

        const transactionReceipt = await publicClient.getTransactionReceipt({
          hash: input.hash as `0x${string}`,
        });

        if (!transactionReceipt) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Transaction not found or not confirmed on the blockchain",
          });
        }

        const parsedStakes: { delegator: Address; delegatee: Address; amount: bigint }[] = [];
        for (const log of transactionReceipt.logs) {
          try {
            const decodedLog = decodeEventLog({
              abi: CREATOR_POOL_ABI,
              eventName: "FanStaked",
              data: log.data,
              topics: log.topics,
            });
            const args = decodedLog.args as any;
            // Ensure the amount is properly handled as a BigInt for Prisma
            const stakeAmount = typeof args.amount === "bigint" ? args.amount : BigInt(args.amount);
            parsedStakes.push({
              delegator: transactionReceipt.from,
              delegatee: log.address,
              amount: stakeAmount,
            });
          } catch (error) {
            // Not a FanStaked event, ignore
            continue;
          }
        }

        if (parsedStakes.length === 0) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "No FanStaked event found in transaction logs",
          });
        }

        for (const stake of parsedStakes) {
          const pool = await prisma.creatorPool.findUnique({
            where: {
              poolAddress: stake.delegatee,
            },
          });

          if (!pool) {
            throw new TRPCError({
              code: "NOT_FOUND",
              message: `Pool with address ${stake.delegatee} not found in database`,
            });
          }

          if (transactionReceipt.from.toLowerCase() !== stake.delegator.toLowerCase()) {
            throw new TRPCError({
              code: "BAD_REQUEST",
              message: `Transaction sender does not match the delegator in the stake event (${transactionReceipt.from} vs ${stake.delegator})`,
            });
          }

          if (pool.chainId !== input.chainId) {
            throw new TRPCError({
              code: "FORBIDDEN",
              message: "Stake event is for a pool on a different chain than specified",
            });
          }

          // Convert the BigInt amount to a string for storage
          const amountToStore = stake.amount.toString();

          // For string-based amounts, get the existing stake as a string and add to it
          const existingStake = await prisma.stakedPool.findUnique({
            where: {
              userWalletId_poolId: {
                userWalletId: userWallet.id,
                poolId: pool.id,
              },
            },
            select: {
              stakeAmount: true,
            },
          });

          // Convert strings to BigInt for calculation, then back to string for storage
          const existingAmount = BigInt(existingStake?.stakeAmount || "0");
          const newStakeAmount = (existingAmount + BigInt(amountToStore)).toString();

          await prisma.stakedPool.upsert({
            where: {
              userWalletId_poolId: {
                userWalletId: userWallet.id,
                poolId: pool.id,
              },
            },
            update: {
              stakeAmount: newStakeAmount,
              updatedAt: new Date(),
            },
            create: {
              userWalletId: userWallet.id,
              poolId: pool.id,
              stakeAmount: amountToStore,
            },
          });

          await prisma.stakeEvent.create({
            data: {
              userWalletId: userWallet.id,
              poolId: pool.id,
              amount: amountToStore,
              eventType: "stake",
              transactionHash: input.hash,
            },
          });

          console.info(
            `Stake confirmed for user ${userId} in pool ${pool.id}, amount: ${stake.amount.toString()}`
          );
        }

        return {
          success: true,
          message: `Successfully confirmed ${parsedStakes.length} stake(s)`,
          stakes: parsedStakes.map(stake => ({
            delegator: stake.delegator,
            delegatee: stake.delegatee,
            amount: stake.amount.toString(),
          })),
        };
      } catch (error) {
        console.error("Error confirming stake:", error);
        if (error instanceof TRPCError) throw error;
        if (error instanceof Error) {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: `Failed to confirm stake: ${error.message}`,
          });
        }
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to confirm stake",
        });
      }
    }),

  confirmUnstake: privateProcedure
    .input(
      z.object({
        chainId: z.string(),
        hash: z.string().regex(/^0x[0-9a-fA-F]{64}$/, "Invalid transaction hash format"),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.user.sub;

      try {
        const userWallet = await prisma.userWallet.findUnique({
          where: { userId },
        });

        if (!userWallet) {
          throw new TRPCError({
            code: "PRECONDITION_FAILED",
            message: "User does not have a wallet",
          });
        }

        const chain = getChainConfig(parseInt(input.chainId));

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

        const transactionReceipt = await publicClient.getTransactionReceipt({
          hash: input.hash as `0x${string}`,
        });

        if (!transactionReceipt) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Transaction not found or not confirmed on the blockchain",
          });
        }

        const parsedUnstakes: { delegator: Address; delegatee: Address; amount: bigint }[] = [];
        for (const log of transactionReceipt.logs) {
          try {
            const decodedLog = decodeEventLog({
              abi: L2_BASE_TOKEN_ABI,
              eventName: "FanUnstaked",
              data: log.data,
              topics: log.topics,
            });
            const args = decodedLog.args as any;
            // Ensure the amount is properly handled as a BigInt for Prisma
            const unstakeAmount =
              typeof args.amount === "bigint" ? args.amount : BigInt(args.amount);
            parsedUnstakes.push({
              delegator: transactionReceipt.from,
              delegatee: args._from || (args.delegatee as Address),
              amount: unstakeAmount,
            });
          } catch (error) {
            // Not a FanUnstaked event, ignore
            continue;
          }
        }

        if (parsedUnstakes.length === 0) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "No FanUnstaked event found in transaction logs",
          });
        }

        for (const unstake of parsedUnstakes) {
          const pool = await prisma.creatorPool.findUnique({
            where: {
              poolAddress: unstake.delegatee,
            },
          });

          if (!pool) {
            throw new TRPCError({
              code: "NOT_FOUND",
              message: `Pool with address ${unstake.delegatee} not found in database`,
            });
          }

          if (transactionReceipt.from.toLowerCase() !== unstake.delegator.toLowerCase()) {
            throw new TRPCError({
              code: "BAD_REQUEST",
              message: `Transaction sender does not match the delegator in the unstake event (${transactionReceipt.from} vs ${unstake.delegator})`,
            });
          }

          if (pool.chainId !== input.chainId) {
            throw new TRPCError({
              code: "FORBIDDEN",
              message: "Unstake event is for a pool on a different chain than specified",
            });
          }

          // Convert the BigInt amount to a string for storage
          const amountToStore = unstake.amount.toString();

          // For string-based amounts, get the existing stake as a string and subtract from it
          const existingStake = await prisma.stakedPool.findUnique({
            where: {
              userWalletId_poolId: {
                userWalletId: userWallet.id,
                poolId: pool.id,
              },
            },
            select: {
              stakeAmount: true,
            },
          });

          // Convert strings to BigInt for calculation, then back to string for storage
          const existingAmount = BigInt(existingStake?.stakeAmount || "0");

          if (existingAmount < BigInt(amountToStore)) {
            throw new TRPCError({
              code: "BAD_REQUEST",
              message: `Unstake amount exceeds current stake. Current stake: ${existingAmount}, Requested unstake: ${amountToStore}`,
            });
          }

          const newStakeAmount = (existingAmount - BigInt(amountToStore)).toString();

          await prisma.stakedPool.upsert({
            where: {
              userWalletId_poolId: {
                userWalletId: userWallet.id,
                poolId: pool.id,
              },
            },
            update: {
              stakeAmount: newStakeAmount,
              updatedAt: new Date(),
            },
            create: {
              userWalletId: userWallet.id,
              poolId: pool.id,
              stakeAmount: (-BigInt(amountToStore)).toString(), // Negative amount for new unstake
            },
          });

          await prisma.stakeEvent.create({
            data: {
              userWalletId: userWallet.id,
              poolId: pool.id,
              amount: amountToStore,
              eventType: "unstake",
              transactionHash: input.hash,
            },
          });

          console.info(
            `Unstake confirmed for user ${userId} in pool ${pool.id}, amount: ${unstake.amount.toString()}`
          );
        }

        return {
          success: true,
          message: `Successfully confirmed ${parsedUnstakes.length} unstake(s)`,
          unstakes: parsedUnstakes.map(unstake => ({
            delegator: unstake.delegator,
            delegatee: unstake.delegatee,
            amount: unstake.amount.toString(),
          })),
        };
      } catch (error) {
        console.error("Error confirming unstake:", error);
        if (error instanceof TRPCError) throw error;
        if (error instanceof Error) {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: `Failed to confirm unstake: ${error.message}`,
          });
        }
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to confirm unstake",
        });
      }
    }),
});
