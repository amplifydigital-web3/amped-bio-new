import { privateProcedure, router } from "../trpc";
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { prisma } from "../../services/DB";
import { Address, createPublicClient, http, decodeEventLog } from "viem";
import { getChainConfig, L2_BASE_TOKEN_ABI, CREATOR_POOL_ABI, getPoolName } from "@ampedbio/web3";
import { s3Service } from "../../services/S3Service";
import { SlimRewardPool, UserStakedPool, PoolTabRewardPool } from "@ampedbio/constants";

export const poolsFanRouter = router({
  getPools: privateProcedure
    .input(
      z.object({
        chainId: z.string(),
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
    .query(async ({ ctx, input }): Promise<PoolTabRewardPool[]> => {
      try {
        const chain = getChainConfig(parseInt(input.chainId));

        if (!chain) {
          return [];
        }

        const whereClause: any = {
          chainId: input.chainId, // Only fetch pools from the specified chain
        };

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

        const publicClient = createPublicClient({
          chain: chain,
          transport: http(),
        });

        // Execute multicall for the specific chain
        const blockchainStakeData = new Map<
          number,
          { creatorStaked: bigint; totalFanStaked: bigint }
        >();

        // Create multicall requests for all pools
        const multicallRequests: {
          address: Address;
          abi: typeof CREATOR_POOL_ABI;
          functionName: "creatorStaked" | "totalFanStaked";
        }[] = [];

        pools.forEach(pool => {
          if (pool.poolAddress) {
            // Add creatorStaked request
            multicallRequests.push({
              address: pool.poolAddress as Address,
              abi: CREATOR_POOL_ABI,
              functionName: "creatorStaked" as const,
            });

            // Add totalFanStaked request
            multicallRequests.push({
              address: pool.poolAddress as Address,
              abi: CREATOR_POOL_ABI,
              functionName: "totalFanStaked" as const,
            });
          }
        });

        // Execute all contract calls in a single batch
        if (multicallRequests.length > 0) {
          try {
            const results = await publicClient.multicall({
              contracts: multicallRequests,
            });

            // Process the results, mapping them back to the correct pools
            for (let i = 0; i < pools.length; i++) {
              const pool = pools[i];
              const creatorStakedIndex = i * 2; // creatorStaked is at even indices
              const totalFanStakedIndex = i * 2 + 1; // totalFanStaked is at odd indices

              const creatorStakedResult = results[creatorStakedIndex];
              const totalFanStakedResult = results[totalFanStakedIndex];

              if (
                creatorStakedResult.status === "success" &&
                totalFanStakedResult.status === "success"
              ) {
                const creatorStaked = creatorStakedResult.result as bigint;
                const totalFanStaked = totalFanStakedResult.result as bigint;

                blockchainStakeData.set(pool.id, {
                  creatorStaked,
                  totalFanStaked,
                });
              } else {
                console.error(
                  `Error fetching stake data from contract for pool ${pool.id}:`,
                  creatorStakedResult.status === "failure" ? creatorStakedResult.error : null,
                  totalFanStakedResult.status === "failure" ? totalFanStakedResult.error : null
                );
              }
            }
          } catch (error) {
            console.error(`Multicall failed for chain ${input.chainId}:`, error);
          }
        }

        // Get current user's wallet
        const userId = ctx.user.sub;
        const userWallet = await prisma.userWallet.findUnique({
          where: { userId },
        });

        // Prepare arrays for batch processing user stake amounts (only for pools where user has stakes)
        const userStakeAmountsData = new Map<number, bigint>();
        if (userWallet) {
          // Filter pools where the user has stakes
          const userStakedPools = pools.filter(pool => {
            if (pool.poolAddress) {
              // Check if the user has a stake in this pool
              const userStake = pool.stakedPools.find(
                stake => stake.userWalletId === userWallet.id && stake.poolId === pool.id
              );
              return userStake !== undefined;
            }
            return false;
          });

          // Create multicall requests for all pools where the user has stakes
          const multicallRequests: {
            address: Address;
            abi: typeof CREATOR_POOL_ABI;
            functionName: "fanStakes";
            args: [Address];
          }[] = userStakedPools.map(pool => ({
            address: pool.poolAddress as Address,
            abi: CREATOR_POOL_ABI,
            functionName: "fanStakes" as const,
            args: [userWallet.address as Address],
          }));

          // Execute all contract calls in a single batch
          if (multicallRequests.length > 0) {
            try {
              const results = await publicClient.multicall({
                contracts: multicallRequests,
              });

              // Process the results, mapping them back to the correct pools
              for (let i = 0; i < userStakedPools.length; i++) {
                const pool = userStakedPools[i];
                const result = results[i];

                if (result.status === "success") {
                  const stakeAmount = result.result as bigint;
                  userStakeAmountsData.set(pool.id, stakeAmount);
                } else {
                  console.error(
                    `Error fetching user stake from contract for pool ${pool.id}:`,
                    result.error
                  );
                  // In case of failure, we'll use the DB value later
                }
              }
            } catch (error) {
              console.error(`Multicall for user stakes failed for chain ${input.chainId}:`, error);
            }
          }
        }

        // Prepare arrays for batch processing user pending rewards
        const userPendingRewardsData = new Map<number, bigint>();
        if (userWallet) {
          // Filter pools that have pool addresses
          const poolsWithAddresses = pools.filter(pool => pool.poolAddress);

          // Create multicall requests for all pools for user's pending rewards
          const multicallRequests: {
            address: Address;
            abi: typeof CREATOR_POOL_ABI;
            functionName: "pendingReward";
            args: [Address];
          }[] = poolsWithAddresses.map(pool => ({
            address: pool.poolAddress as Address,
            abi: CREATOR_POOL_ABI,
            functionName: "pendingReward" as const,
            args: [userWallet.address as Address],
          }));

          // Execute all contract calls in a single batch
          if (multicallRequests.length > 0) {
            try {
              const results = await publicClient.multicall({
                contracts: multicallRequests,
              });

              // Process the results, mapping them back to the correct pools
              for (let i = 0; i < poolsWithAddresses.length; i++) {
                const pool = poolsWithAddresses[i];
                const result = results[i];

                if (result.status === "success") {
                  const pendingReward = result.result as bigint;
                  userPendingRewardsData.set(pool.id, pendingReward);
                } else {
                  console.error(
                    `Error fetching user pending rewards from contract for pool ${pool.id}:`,
                    result.error
                  );
                  // In case of failure, we'll return 0n later
                }
              }
            } catch (error) {
              console.error(
                `Multicall for user pending rewards failed for chain ${input.chainId}:`,
                error
              );
            }
          }
        }

        // Arrays to collect updates for batch processing
        const poolsToUpdate: { id: number; revoStaked: string }[] = [];

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
                console.log(
                  `Attempting to fetch creatorStaked and totalFanStaked from contract for pool ${pool.id} at address ${pool.poolAddress}`
                );

                // Get the values from our batch results
                const stakeData = blockchainStakeData.get(pool.id);

                if (stakeData) {
                  console.log(
                    `Successfully fetched creatorStaked from contract for pool ${pool.id}: ${stakeData.creatorStaked.toString()}`
                  );
                  console.log(
                    `Successfully fetched totalFanStaked from contract for pool ${pool.id}: ${stakeData.totalFanStaked.toString()}`
                  );

                  // Calculate the total stake as sum of creatorStaked and totalFanStaked as instructed by colleague
                  const totalStakeValue = (stakeData.creatorStaked +
                    stakeData.totalFanStaked) as bigint;

                  // Collect the update for batch processing later
                  poolsToUpdate.push({
                    id: pool.id,
                    revoStaked: totalStakeValue.toString(),
                  });

                  totalStake = totalStakeValue;
                } else {
                  console.log(
                    `Could not fetch stake data from contract for pool ${pool.id}, using DB value`
                  );
                }
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
            let userStakeAmount = 0n;
            if (userWallet) {
              const userStake = pool.stakedPools.find(
                stake => stake.userWalletId === userWallet.id && stake.poolId === pool.id
              );
              if (userStake) {
                // Get the user's stake amount from our batch results
                const blockchainStakeAmount = userStakeAmountsData.get(pool.id);

                if (blockchainStakeAmount !== undefined) {
                  userStakeAmount = blockchainStakeAmount;
                } else {
                  // If blockchain query failed, use the database value
                  userStakeAmount = BigInt(userStake.stakeAmount);
                  console.log(
                    `Using DB value for user stake in pool ${pool.id} due to failed blockchain query`
                  );
                }
              }
            }

            // Get user's pending rewards from our batch results
            let userPendingRewards = 0n;
            if (userWallet && userPendingRewardsData.has(pool.id)) {
              userPendingRewards = userPendingRewardsData.get(pool.id)!;
            }

            const rewardPool: PoolTabRewardPool = {
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
              stakedAmount: totalStake, // Return as wei (bigint)
              fans: activeStakers,
            };
            return rewardPool;
          })
        );

        // Batch update all pools that need updating
        if (poolsToUpdate.length > 0) {
          try {
            // Build the SQL query for batch update in MySQL
            const poolIds = poolsToUpdate.map(update => update.id).join(",");
            const caseWhens = poolsToUpdate
              .map(update => `WHEN id = ${update.id} THEN '${update.revoStaked}'`)
              .join(" ");

            await prisma.$executeRawUnsafe(`
              UPDATE creator_pools
              SET revoStaked = CASE
                ${caseWhens}
                ELSE revoStaked
              END
              WHERE id IN (${poolIds})
            `);

            console.log(`Successfully batch updated revoStaked for ${poolsToUpdate.length} pools`);
          } catch (batchUpdateError) {
            console.error(`Error in batch update of revoStaked:`, batchUpdateError);
            // Continue anyway, as we still have the correct values in memory for the response
          }
        }

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
          filteredPools = processedPools.filter(pool => pool.fans === 0);
        } else if (input.filter === "more-than-10-fans") {
          filteredPools = processedPools.filter(pool => pool.fans > 10);
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
            filteredPools.sort((a, b) => b.fans - a.fans);
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

  getUserStakedPools: privateProcedure
    .input(
      z.object({
        chainId: z.string(),
      })
    )
    .query(async ({ ctx, input }): Promise<Array<UserStakedPool>> => {
      const userId = ctx.user.sub;

      try {
        const userWallet = await prisma.userWallet.findUnique({
          where: { userId },
        });

        if (!userWallet) {
          return [];
        }

        // Get the chain configuration for the specified chainId
        const chain = getChainConfig(parseInt(input.chainId));

        if (!chain) {
          return [];
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
              select: {
                id: true,
                poolAddress: true,
                image_file_id: true,
                poolImage: {
                  select: {
                    s3_key: true,
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

        // Create multicall requests for all the fanStakes we need to fetch
        const multicallRequests = poolsToFetch.map(stake => ({
          address: stake.pool.poolAddress as Address,
          abi: CREATOR_POOL_ABI,
          functionName: "fanStakes" as const,
          args: [userWallet.address as Address],
        }));

        // Execute all contract calls in a single batch
        const blockchainStakeData: { poolId: number; stakeAmount: string }[] = [];
        if (multicallRequests.length > 0) {
          const results = await publicClient.multicall({
            contracts: multicallRequests,
          });

          // Process the results, handling both fulfilled and rejected promises
          results.forEach((result, index) => {
            const poolId = poolsToFetch[index].pool.id;

            if (result.status === "success") {
              blockchainStakeData.push({
                poolId,
                stakeAmount: result.result.toString(),
              });
              console.log(
                `[multicall] Successfully fetched stake amount from contract for pool ${poolId} and user ${userWallet.address}: ${result.result.toString()}`
              );
            } else {
              console.error(
                `[multicall] Error fetching stake amount from contract for pool ${poolId} and user ${userWallet.address}:`,
                result.error
              );
              // Continue processing other results
            }
          });
        }

        // Prepare arrays for additional multicall requests
        const poolsForMulticall = userStakes.filter(
          stake => stake.pool.poolAddress && userWallet.address
        );

        // Create multicall requests for user pending rewards and pool names in parallel
        const pendingRewardRequests = poolsForMulticall.map(stake => ({
          address: stake.pool.poolAddress as Address,
          abi: CREATOR_POOL_ABI,
          functionName: "pendingReward" as const,
          args: [userWallet.address as Address],
        }));

        // Create multicall requests for pool names
        const poolNameRequests = poolsForMulticall.map(stake => ({
          address: stake.pool.poolAddress as Address,
          abi: CREATOR_POOL_ABI,
          functionName: "poolName" as const,
        }));

        // Execute the database update, pending reward fetch, and pool name fetch in parallel
        const [dbUpdateResult, pendingRewardResults, poolNameResults] = await Promise.all([
          // Database update promise
          (async () => {
            if (blockchainStakeData.length > 0) {
              // Build the raw query with proper parameterization for MySQL using CASE WHEN statement
              const caseWhens = blockchainStakeData
                .map(
                  stakeData =>
                    `WHEN userWalletId = ${userWallet.id} AND poolId = ${stakeData.poolId} THEN '${stakeData.stakeAmount}'`
                )
                .join(" ");

              const poolIds = blockchainStakeData.map(stakeData => stakeData.poolId).join(",");

              // Use raw SQL to update multiple stakedPool records in a single query using CASE WHEN
              await prisma.$executeRawUnsafe(`
                  UPDATE staked_pools
                  SET stakeAmount = CASE
                    ${caseWhens}
                    ELSE stakeAmount
                  END
                  WHERE userWalletId = ${userWallet.id}
                  AND poolId IN (${poolIds})
                `);

              console.log(
                `Successfully updated ${blockchainStakeData.length} stakedPool records for userWalletId: ${userWallet.id}`
              );
            }
            return blockchainStakeData; // Return to maintain the same data flow
          })(),

          // Pending reward fetch promise
          (async () => {
            const poolPendingRewards: (bigint | null)[] = [];
            if (pendingRewardRequests.length > 0) {
              const results = await publicClient.multicall({
                contracts: pendingRewardRequests,
              });

              // Process the pending reward results
              results.forEach((result, index) => {
                if (result.status === "success") {
                  poolPendingRewards[index] = result.result as bigint;
                  console.log(
                    `[multicall] Successfully fetched pending reward from contract for pool ${poolsForMulticall[index].pool.id} and user ${userWallet.address}: ${result.result.toString()}`
                  );
                } else {
                  console.error(
                    `[multicall] Error fetching pending reward from contract for pool ${poolsForMulticall[index].pool.id} and user ${userWallet.address}:`,
                    result.error
                  );
                  // If blockchain query fails, return null as there's no fallback in the database for pending rewards
                  poolPendingRewards[index] = null;
                }
              });
            }
            return poolPendingRewards;
          })(),

          // Pool name fetch promise
          (async () => {
            const poolNames: (string | null)[] = [];
            if (poolNameRequests.length > 0) {
              const results = await publicClient.multicall({
                contracts: poolNameRequests,
              });

              // Process the pool name results
              results.forEach((result, index) => {
                if (result.status === "success") {
                  const name = result.result as string;
                  poolNames[index] = name || `Pool ${poolsForMulticall[index].pool.id}`;
                  console.log(
                    `[multicall] Successfully fetched pool name from contract for pool ${poolsForMulticall[index].pool.id}: ${name}`
                  );
                } else {
                  console.error(
                    `[multicall] Error fetching pool name from contract for pool ${poolsForMulticall[index].pool.id}:`,
                    result.error
                  );
                  // If blockchain query fails, return null to fallback to placeholder name
                  poolNames[index] = null;
                }
              });
            }
            return poolNames;
          })(),
        ]);

        // Prepare final result with blockchain stake amounts, pending rewards, and pool names
        const resultStakes = userStakes.map((stake, index) => {
          // Check if we have a blockchain update for this stake (using the result from the parallel operation)
          const blockchainData = dbUpdateResult.find(data => data && data.poolId === stake.pool.id);

          // Use blockchain value if available, otherwise use original database value
          const currentStakeAmount = blockchainData
            ? blockchainData.stakeAmount
            : stake.stakeAmount.toString();

          // Get the pending rewards from multicall results (now using the result from the parallel operation)
          const userPendingRewards = pendingRewardResults[index];

          // Get the pool name from multicall results, fallback to placeholder if not available
          const poolName = poolNameResults[index] || `Pool ${stake.pool.id}`;

          const slimRewardPool: SlimRewardPool = {
            id: stake.pool.id,
            address: stake.pool.poolAddress!,
            image:
              stake.pool.image_file_id && stake.pool.poolImage
                ? {
                    id: stake.pool.image_file_id,
                    url: s3Service.getFileUrl(stake.pool.poolImage.s3_key),
                  }
                : null,
            name: poolName, // Now using the blockchain name directly from multicall
            pendingRewards: userPendingRewards,
            stakedByYou: BigInt(currentStakeAmount), // Amount of REVO that the requesting user has staked in this pool
          };

          const userStakedPool: UserStakedPool = {
            userWalletId: stake.userWalletId,
            pool: slimRewardPool,
          };
          return userStakedPool;
        });

        // Filter out stakes where the user has 0 stake amount
        const filteredResultStakes = resultStakes.filter(stake => stake.pool.stakedByYou > 0n);

        return filteredResultStakes;
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

  getPoolDetailsForModal: privateProcedure
    .input(
      z.object({
        poolId: z.number(),
      })
    )
    .query(async ({ input }) => {
      try {
        const pool = await prisma.creatorPool.findUnique({
          where: { id: input.poolId },
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
              },
            },
            _count: {
              select: {
                stakedPools: true,
              },
            },
          },
        });

        if (!pool) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Pool not found",
          });
        }

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

            // Get the totalFanStaked from the pool contract
            const totalFanStaked = (await publicClient.readContract({
              address: pool.poolAddress as Address,
              abi: CREATOR_POOL_ABI,
              functionName: "totalFanStaked",
            })) as bigint;

            // Get the creatorStaked from the pool contract
            const creatorStaked = (await publicClient.readContract({
              address: pool.poolAddress as Address,
              abi: CREATOR_POOL_ABI,
              functionName: "creatorStaked",
            })) as bigint;

            // Calculate the total stake as sum of creatorStaked and totalFanStaked
            totalStake = (creatorStaked + totalFanStaked) as bigint;

            // Update the database with the value from the contract
            try {
              await prisma.creatorPool.update({
                where: { id: pool.id },
                data: { revoStaked: totalStake.toString() },
              });
            } catch (updateError) {
              console.error(
                `Error updating revoStaked in database for pool ${pool.id}:`,
                updateError
              );
              // Continue anyway, we'll still return the blockchain value
            }
          } catch (error) {
            console.error(`Error fetching totalStaked from contract for pool ${pool.id}:`, error);
            // If contract query fails, we'll keep the db value
          }
        }

        // Get pool name, fallback to ID if chain is not supported
        const poolName = chain
          ? await getPoolName(pool.poolAddress as Address, parseInt(pool.chainId))
          : `Pool ${pool.id}`;

        // Count only users with positive stake amounts
        const activeStakers = await prisma.stakedPool.count({
          where: {
            poolId: pool.id,
            stakeAmount: { not: "0" }, // Count only stakes with amount > 0
          },
        });

        // Return only the data that is actually displayed in the modal
        return {
          id: pool.id,
          name: poolName || `Pool ${pool.id}`,
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
          totalReward: totalStake,
          stakedAmount: totalStake, // Include for compatibility
          fans: activeStakers,
          pendingRewards: 0n, // Default value - will be fetched by client-side hook
          stakedByYou: 0n, // Default value - will be fetched by client-side hook
          creator: {
            userId: pool.wallet!.userId!,
            address: pool.wallet!.address!,
          },
        };
      } catch (error) {
        console.error("Error fetching pool details for modal:", error);
        if (error instanceof TRPCError) throw error;
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to fetch pool details for modal",
        });
      }
    }),
});
