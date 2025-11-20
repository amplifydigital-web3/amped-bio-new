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
        filter: z
          .enum(["all", "no-fans", "more-than-10-fans", "more-than-10k-stake"])
          .optional()
          .default("all"),
        sort: z.enum(["newest", "name-asc", "name-desc"]).optional().default("newest"),
      })
    )
    .query(async ({ input }) => {
      try {
        const whereClause: any = {};
        if (input.search) {
          whereClause.OR = [
            { description: { contains: input.search } },
            { poolAddress: { contains: input.search } }, // Adding pool address search as well
            { wallet: { user: { name: { contains: input.search } } } }, // Search by creator's name
          ];
        }

        // Build the pools query with the where clause
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
                userId: true,
                user: {
                  select: {
                    id: true,
                    name: true,
                  },
                },
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

        // Apply filtering logic after getting pool data from blockchain
        const results = await Promise.allSettled(
          pools.map(async pool => {
            // Get the chain configuration for the pool
            const chain = getChainConfig(parseInt(pool.chainId));

            // Initialize totalStake to the current db value
            let totalStake: bigint = BigInt(pool.revoStaked);

            // Query the totalStaked from the pool contract if we have the necessary data
            if (pool.poolAddress && chain) {
              try {
                const publicClient = createPublicClient({
                  chain: chain,
                  transport: http(),
                });

                console.log(
                  `Attempting to fetch creatorStaked and totalFanStaked from contract for pool ${pool.id} at address ${pool.poolAddress}`
                );

                // Fetch both creatorStaked and totalFanStaked values from the contract as instructed by colleague
                const creatorStakedValue = await publicClient.readContract({
                  address: pool.poolAddress as Address,
                  abi: CREATOR_POOL_ABI,
                  functionName: "creatorStaked",
                });

                const totalFanStakedValue = await publicClient.readContract({
                  address: pool.poolAddress as Address,
                  abi: CREATOR_POOL_ABI,
                  functionName: "totalFanStaked",
                });

                console.log(
                  `Successfully fetched creatorStaked from contract for pool ${pool.id}: ${creatorStakedValue.toString()}`
                );
                console.log(
                  `Successfully fetched totalFanStaked from contract for pool ${pool.id}: ${totalFanStakedValue.toString()}`
                );

                // Calculate the total stake as sum of creatorStaked and totalFanStaked as instructed by colleague
                const totalStakeValue = (creatorStakedValue + totalFanStakedValue) as bigint;

                // Update the database with the value from the contract
                try {
                  await prisma.creatorPool.update({
                    where: { id: pool.id },
                    data: { revoStaked: totalStakeValue.toString() },
                  });
                  console.log(`Successfully updated revoStaked in database for pool ${pool.id}`);
                } catch (updateError) {
                  console.error(
                    `Error updating revoStaked in database for pool ${pool.id}:`,
                    updateError
                  );
                  // Continue anyway, we'll still return the blockchain value
                }

                totalStake = totalStakeValue;
              } catch (error) {
                console.error(
                  `Error fetching totalStaked from contract for pool ${pool.id}:`,
                  error
                );
                // If contract query fails, we'll keep the db value
              }
            } else {
              console.log(
                `Skipping contract query for pool ${pool.id} - missing poolAddress (${pool.poolAddress}) or chain (${chain})`
              );
            }

            const poolName = await getPoolName(pool.poolAddress as Address, parseInt(pool.chainId));

            // Count only users with positive stake amounts
            const activeStakers = pool.stakedPools.filter(
              staked => BigInt(staked.stakeAmount) > 0n
            ).length;

            return {
              ...pool,
              revoStaked: totalStake, // Include the updated revoStaked in the response
              imageUrl: pool.poolImage ? s3Service.getFileUrl(pool.poolImage.s3_key) : null,
              name: poolName || `Pool ${pool.id}`, // Using blockchain name, fallback to id-based name
              totalReward: totalStake, // Return as wei (bigint)
              participants: activeStakers,
              createdBy: pool.wallet!.userId!,
              stakedAmount: totalStake, // Return as wei (bigint)
              earnedRewards: 0n, // Return as wei (bigint)
              creatorAddress: pool.wallet?.address || null,
            };
          })
        );

        // Filter out rejected promises and return only successful results
        const processedPools = results
          .filter((result): result is PromiseFulfilledResult<any> => {
            if (result.status === "rejected") {
              console.error("Error processing pool:", result.reason);
              return false;
            }
            return true;
          })
          .map(result => result.value);

        // Apply filters to the processed pools
        let filteredPools = processedPools;
        if (input.filter === "no-fans") {
          filteredPools = processedPools.filter(pool => pool.participants === 0);
        } else if (input.filter === "more-than-10-fans") {
          filteredPools = processedPools.filter(pool => pool.participants > 10);
        } else if (input.filter === "more-than-10k-stake") {
          // Convert 10k ether to wei for comparison: 10000 * 10^18
          const tenKEtherInWei = BigInt(10000) * BigInt(10) ** BigInt(18);
          filteredPools = processedPools.filter(pool => pool.stakedAmount > tenKEtherInWei);
        }

        // Apply sorting
        switch (input.sort) {
          case "name-asc":
            filteredPools.sort((a, b) => a.name.localeCompare(b.name));
            break;
          case "name-desc":
            filteredPools.sort((a, b) => b.name.localeCompare(a.name));
            break;
          case "newest":
            // Since pools don't have a created_at field in the current model, we'll sort by ID
            filteredPools.sort((a, b) => b.id - a.id);
            break;
          default:
            break;
        }

        return filteredPools;
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
          stakeAmount: BigInt(stakedPool?.stakeAmount || "0"), // Return as wei (bigint)
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

  getUserStakes: privateProcedure
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

        // Get the chain configuration for the specified chainId
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

        const userStakes = await prisma.stakedPool.findMany({
          where: {
            userWalletId: userWallet.id,
            pool: {
              chainId: input.chainId, // Only fetch stakes for the specified chain
            },
          },
          include: {
            pool: {
              include: {
                poolImage: {
                  select: {
                    s3_key: true,
                  },
                },
                wallet: {
                  select: {
                    userId: true,
                    address: true,
                  },
                },
              },
            },
          },
        });

        // Prepare arrays for batch processing
        const poolsToFetch = userStakes.filter(
          stake => stake.pool.poolAddress && userWallet.address
        );

        // Fetch updated staking values from blockchain for all applicable stakes
        const blockchainStakeResults = await Promise.allSettled(
          poolsToFetch.map(async stake => {
            console.log(
              `Attempting to fetch updated stake amount from contract for pool ${stake.pool.id} at address ${stake.pool.poolAddress} for user ${userWallet.address}`
            );

            // Fetch the current user's stake amount from the contract
            const fanStakeAmount = await publicClient.readContract({
              address: stake.pool.poolAddress as Address,
              abi: CREATOR_POOL_ABI,
              functionName: "fanStakes",
              args: [userWallet.address as Address],
            });

            console.log(
              `Successfully fetched stake amount from contract for pool ${stake.pool.id} and user ${userWallet.address}: ${fanStakeAmount.toString()}`
            );

            return {
              poolId: stake.pool.id,
              stakeAmount: fanStakeAmount.toString(),
            };
          })
        );

        // Process results and handle both fulfilled and rejected promises
        const blockchainStakeData = blockchainStakeResults
          .map((result, index) => {
            if (result.status === "fulfilled") {
              return result.value;
            } else {
              // Log the error for debugging
              console.error(
                `Error fetching stake amount from contract for pool ${poolsToFetch[index].pool.id} and user ${userWallet.address}:`,
                result.reason
              );
              // Return null for failed requests to be handled appropriately
              return null;
            }
          })
          .filter(data => data !== null); // Filter out null values

        // Prepare final result with blockchain stake amounts
        const resultStakes = await Promise.all(
          userStakes.map(async stake => {
            // Check if we have a blockchain update for this stake
            const blockchainData = blockchainStakeData.find(
              data => data && data.poolId === stake.pool.id
            );

            // Use blockchain value if available, otherwise use original database value
            const currentStakeAmount = blockchainData
              ? blockchainData.stakeAmount
              : stake.stakeAmount.toString();

            const poolName = await getPoolName(
              stake.pool.poolAddress as Address,
              parseInt(stake.pool.chainId)
            );

            return {
              ...stake,
              stakeAmount: BigInt(currentStakeAmount), // Return as wei (bigint) without formatting
              pool: {
                ...stake.pool,
                name: poolName || `Pool ${stake.pool.id}`, // Using blockchain name, fallback to id-based name
                imageUrl: stake.pool.poolImage
                  ? s3Service.getFileUrl(stake.pool.poolImage.s3_key)
                  : null,
                userId: stake.pool.wallet.userId, // Include the actual user ID
                creatorAddress: stake.pool.wallet.address, // Include the creator's wallet address
              },
            };
          })
        );

        return resultStakes;
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
