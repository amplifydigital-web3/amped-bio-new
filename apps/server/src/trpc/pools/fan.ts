import { privateProcedure, router } from "../trpc";
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { prisma } from "../../services/DB";
import { Address, createPublicClient, http, decodeEventLog } from "viem";
import { getChainConfig, L2_BASE_TOKEN_ABI, CREATOR_POOL_ABI, getPoolName } from "@ampedbio/web3";
import { s3Service } from "../../services/S3Service";
import { RewardPool } from "@ampedbio/constants";

export const poolsFanRouter = router({
  getPools: privateProcedure
    .input(
      z.object({
        search: z.string().optional(),
        filter: z
          .enum(["all", "no-fans", "more-than-10-fans", "more-than-10k-stake"])
          .optional()
          .default("all"),
        sort: z
          .enum(["newest", "name-asc", "name-desc", "most-fans", "most-staked"])
          .optional()
          .default("newest"),
      })
    )
    .query(async ({ ctx, input }): Promise<RewardPool[]> => {
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
                userWalletId: true,
                poolId: true,
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

            // Get pool name, fallback to ID if chain is not supported
            const poolName = chain
              ? await getPoolName(pool.poolAddress as Address, parseInt(pool.chainId))
              : `Pool ${pool.id}`;

            // Count only users with positive stake amounts
            const activeStakers = pool.stakedPools.filter(
              staked => BigInt(staked.stakeAmount) > 0n
            ).length;

            // Get current user's stake in this pool
            const userId = ctx.user.sub;
            const userWallet = await prisma.userWallet.findUnique({
              where: { userId },
            });

            let userStakeAmount = 0n;
            if (userWallet) {
              const userStake = pool.stakedPools.find(
                stake => stake.userWalletId === userWallet.id && stake.poolId === pool.id
              );
              if (userStake) {
                // For consistency, also check blockchain for updated stake amount
                if (pool.poolAddress && chain) {
                  try {
                    const publicClient = createPublicClient({
                      chain: chain,
                      transport: http(),
                    });

                    const fanStakeAmount = await publicClient.readContract({
                      address: pool.poolAddress as Address,
                      abi: CREATOR_POOL_ABI,
                      functionName: "fanStakes",
                      args: [userWallet.address as Address],
                    });

                    userStakeAmount = fanStakeAmount as bigint;
                  } catch (error) {
                    // If blockchain query fails, use the database value
                    userStakeAmount = BigInt(userStake.stakeAmount);
                    console.error(
                      `Error fetching user stake from blockchain for pool ${pool.id}:`,
                      error
                    );
                  }
                } else {
                  userStakeAmount = BigInt(userStake.stakeAmount);
                }
              }
            }

            // Get user's pending rewards from the pool contract
            let userPendingRewards = 0n;
            if (userWallet && pool.poolAddress && chain) {
              try {
                const publicClient = createPublicClient({
                  chain: chain,
                  transport: http(),
                });

                // Use the pendingReward function to get the user's pending rewards
                userPendingRewards = (await publicClient.readContract({
                  address: pool.poolAddress as Address,
                  abi: CREATOR_POOL_ABI,
                  functionName: "pendingReward",
                  args: [userWallet.address as Address],
                })) as bigint;
              } catch (error) {
                console.error(
                  `Error fetching user pending rewards from blockchain for pool ${pool.id}:`,
                  error
                );
                // If blockchain query fails, return 0n as there's no fallback in the database for pending rewards
                userPendingRewards = 0n;
              }
            }

            const rewardPool: RewardPool = {
              id: pool.id,
              description: pool.description,
              chainId: pool.chainId,
              address: pool.poolAddress!,
              image:
                pool.image_file_id && pool.poolImage
                  ? {
                      id: pool.image_file_id,
                      url: s3Service.getFileUrl(pool.poolImage.s3_key),
                    }
                  : null,
              name: poolName || `Pool ${pool.id}`, // Using blockchain name, fallback to id-based name
              totalReward: totalStake, // Return as wei (bigint)
              stakedAmount: totalStake, // Return as wei (bigint)
              fans: activeStakers,
              pendingRewards: userPendingRewards, // User's pending rewards that can be claimed
              stakedByYou: userStakeAmount, // Amount of REVO that the requesting user has staked in this pool
              creator: {
                userId: pool.wallet!.userId!,
                address: pool.wallet!.address!,
              },
            };
            return rewardPool;
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
          case "most-fans":
            filteredPools.sort((a, b) => b.participants - a.participants);
            break;
          case "most-staked":
            filteredPools.sort((a, b) => {
              const aStake = BigInt(a.stakedAmount);
              const bStake = BigInt(b.stakedAmount);
              if (aStake < bStake) return 1; // b should come before a for descending sort
              if (aStake > bStake) return -1; // a should come before b for descending sort
              return 0;
            });
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
    .query(
      async ({
        ctx,
        input,
      }): Promise<
        Array<{
          userWalletId: number;
          poolId: number;
          stakeAmount: bigint;
          pool: RewardPool;
        }>
      > => {
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
                  _count: {
                    select: {
                      stakedPools: true,
                    },
                  },
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

              // Get user's pending rewards from the pool contract
              let userPendingRewards = 0n;
              if (userWallet && stake.pool.poolAddress && chain) {
                try {
                  const publicClient = createPublicClient({
                    chain: chain,
                    transport: http(),
                  });

                  // Use the pendingReward function to get the user's pending rewards
                  userPendingRewards = (await publicClient.readContract({
                    address: stake.pool.poolAddress as Address,
                    abi: CREATOR_POOL_ABI,
                    functionName: "pendingReward",
                    args: [userWallet.address as Address],
                  })) as bigint;
                } catch (error) {
                  console.error(
                    `Error fetching user pending rewards from blockchain for pool ${stake.pool.id}:`,
                    error
                  );
                  // If blockchain query fails, return 0n as there's no fallback in the database for pending rewards
                  userPendingRewards = 0n;
                }
              }

              const rewardPool: RewardPool = {
                id: stake.pool.id,
                description: stake.pool.description,
                chainId: stake.pool.chainId,
                address: stake.pool.poolAddress!,
                image:
                  stake.pool.image_file_id && stake.pool.poolImage
                    ? {
                        id: stake.pool.image_file_id,
                        url: s3Service.getFileUrl(stake.pool.poolImage.s3_key),
                      }
                    : null,
                name: poolName || `Pool ${stake.pool.id}`, // Using blockchain name, fallback to id-based name
                totalReward: BigInt(stake.pool.revoStaked), // Return as wei (bigint)
                stakedAmount: BigInt(stake.pool.revoStaked), // Return as wei (bigint)
                fans: stake.pool._count.stakedPools,
                pendingRewards: userPendingRewards, // User's pending rewards that can be claimed
                stakedByYou: BigInt(currentStakeAmount), // Amount of REVO that the requesting user has staked in this pool
                creator: {
                  userId: stake.pool.wallet.userId!,
                  address: stake.pool.wallet.address!,
                },
              };
              return {
                ...stake,
                stakeAmount: BigInt(currentStakeAmount), // Return as wei (bigint) without formatting
                pool: rewardPool,
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
      }
    ),

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
              abi: L2_BASE_TOKEN_ABI,
              eventName: "Stake",
              data: log.data,
              topics: log.topics,
            });
            const args = decodedLog.args as any;
            // Validate that required fields exist before processing
            if (!args.staker || !args.pool || args.amount === undefined) {
              console.warn("Stake event missing required fields:", args);
              continue; // Skip this event if required fields are missing
            }
            // Ensure the amount is properly handled as a BigInt for Prisma
            const stakeAmount = typeof args.amount === "bigint" ? args.amount : BigInt(args.amount);
            parsedStakes.push({
              delegator: args.staker.toLowerCase(),
              delegatee: args.pool.toLowerCase(), // Use the pool address from the event, not the log address, in lowercase
              amount: stakeAmount,
            });
          } catch (error) {
            // Not a Stake event, ignore
            continue;
          }
        }

        if (parsedStakes.length === 0) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "No Stake event found in transaction logs",
          });
        }

        for (const stake of parsedStakes) {
          // Convert the address to lowercase for comparison since Ethereum addresses are case-insensitive
          const poolAddressToFind = stake.delegatee?.toLowerCase();

          const pool = await prisma.creatorPool.findUnique({
            where: {
              poolAddress: poolAddressToFind,
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
              eventName: "Unstake",
              data: log.data,
              topics: log.topics,
            });
            const args = decodedLog.args as any;
            // Validate that required fields exist before processing
            if (!args.unstaker || !args.pool || args.amount === undefined) {
              console.warn("Unstake event missing required fields:", args);
              continue; // Skip this event if required fields are missing
            }
            // Ensure the amount is properly handled as a BigInt for Prisma
            const unstakeAmount =
              typeof args.amount === "bigint" ? args.amount : BigInt(args.amount);
            parsedUnstakes.push({
              delegator: args.unstaker.toLowerCase(),
              delegatee: args.pool.toLowerCase(), // Use the 'pool' address from the event as the pool address, in lowercase
              amount: unstakeAmount,
            });
          } catch (error) {
            // Not an Unstake event, ignore
            continue;
          }
        }

        if (parsedUnstakes.length === 0) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "No Unstake event found in transaction logs",
          });
        }

        // Additional validation: check if any parsed unstakes have undefined delegatee
        const invalidUnstakes = parsedUnstakes.filter(unstake => !unstake.delegatee);
        if (invalidUnstakes.length > 0) {
          console.warn("Found unstake events with undefined delegatee:", invalidUnstakes);
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: `Found ${invalidUnstakes.length} unstake events with undefined delegatee (pool address)`,
          });
        }

        for (const unstake of parsedUnstakes) {
          console.log("Processing unstake event:", {
            delegatee: unstake.delegatee,
            delegator: unstake.delegator,
            amount: unstake.amount.toString(),
          });

          // Convert the address to lowercase for comparison since Ethereum addresses are case-insensitive
          const poolAddressToFind = unstake.delegatee?.toLowerCase();

          const pool = await prisma.creatorPool.findUnique({
            where: {
              poolAddress: poolAddressToFind,
            },
          });

          if (!pool) {
            throw new TRPCError({
              code: "NOT_FOUND",
              message: `Pool with address ${unstake.delegatee} not found in database.`,
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
