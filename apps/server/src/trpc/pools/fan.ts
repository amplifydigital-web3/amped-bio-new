import { privateProcedure, publicProcedure, router } from "../trpc";
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { prisma } from "../../services/DB";
import { Address, createPublicClient, http, decodeEventLog } from "viem";
import { getChainConfig, L2_BASE_TOKEN_ABI, CREATOR_POOL_ABI, getPoolName, calculatePoolAPY } from "@ampedbio/web3";
import { s3Service } from "../../services/S3Service";
import {
  UserStakedPool,
  PoolTabRewardPool,
  PoolDetailsForModal,
  SlimPoolForUserStakedPool,
} from "@ampedbio/constants";

export const poolsFanRouter = router({
  getPoolByAddress: publicProcedure
    .input(
      z.object({
        poolAddress: z.string(),
      })
    )
    .query(async ({ input }) => {
      try {
        const pool = await prisma.creatorPool.findUnique({
          where: { poolAddress: input.poolAddress },
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
                user: {
                  select: {
                    handle: true,
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
          },
        });

        if (!pool) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Pool not found",
          });
        }

        const chain = getChainConfig(parseInt(pool.chainId));

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

        let totalStake: bigint = BigInt(pool.revoStaked);
        let poolName = pool.name;
        let creatorCut = 0;

        try {
          if (pool.poolAddress) {
            const multicallRequests = [
              {
                address: pool.poolAddress as Address,
                abi: CREATOR_POOL_ABI,
                functionName: "totalFanStaked" as const,
              },
              {
                address: pool.poolAddress as Address,
                abi: CREATOR_POOL_ABI,
                functionName: "creatorStaked" as const,
              },
              {
                address: pool.poolAddress as Address,
                abi: CREATOR_POOL_ABI,
                functionName: "creatorCut" as const,
              },
            ];

            const results = await publicClient.multicall({
              contracts: multicallRequests,
            });

            const totalFanStakedResult = results[0];
            const creatorStakedResult = results[1];
            const creatorCutResult = results[2];

            let totalFanStaked: bigint | null = null;
            let creatorStaked: bigint | null = null;

            if (totalFanStakedResult.status === "success") {
              totalFanStaked = totalFanStakedResult.result as bigint;
            }

            if (creatorStakedResult.status === "success") {
              creatorStaked = creatorStakedResult.result as bigint;
            }

            if (creatorCutResult.status === "success") {
              creatorCut = Number(creatorCutResult.result as bigint);
            }

            if (totalFanStaked !== null && creatorStaked !== null) {
              totalStake = totalFanStaked + creatorStaked;
            }
          }

          // Fetch pool name from blockchain if not in database
          if (!poolName && pool.poolAddress) {
            poolName = await getPoolName(pool.poolAddress as Address, parseInt(pool.chainId));

            // update on DB
            if (poolName) {
              await prisma.creatorPool.update({
                where: { id: pool.id },
                data: { name: poolName },
              });
            }
          }
        } catch (error) {
          console.error(`Error fetching data from contract for pool ${pool.id}:`, error);
        }

        // Calculate APY for the pool
        let apy: number | undefined = undefined;
        if (pool.poolAddress && totalStake > 0n) {
          try {
            const calculatedAPY = await calculatePoolAPY(pool.poolAddress as Address, parseInt(pool.chainId), publicClient);
            if (calculatedAPY !== null) {
              apy = calculatedAPY;
            }
          } catch (error) {
            console.error(`Error calculating APY for pool ${pool.id}:`, error);
          }
        }

        const activeStakers = pool._count.stakedPools;

        return {
          id: pool.id,
          name: poolName ?? `Pool ${pool.id}`,
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
          stakedAmount: totalStake,
          fans: activeStakers,
          creatorFee: creatorCut,
          apy,
        };
      } catch (error) {
        console.error("Error fetching pool by address:", error);
        if (error instanceof TRPCError) throw error;
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to fetch pool",
        });
      }
    }),

  getPools: publicProcedure
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
    .query(async ({ input }): Promise<PoolTabRewardPool[]> => {
      try {
        const chain = getChainConfig(parseInt(input.chainId));

        if (!chain) {
          return [];
        }

        const whereClause: any = {
          chainId: input.chainId, // Only fetch pools from the specified chain
          AND: [
            {
              OR: [{ hidden: false }, { hidden: null }],
            },
          ],
        };

        if (input.search) {
          // Check if the search query looks like an Ethereum address (0x followed by 40 hex chars)
          const isAddress = /^0x[a-fA-F0-9]{40}$/.test(input.search.trim());

          // Add search conditions to the AND array to properly combine with other filters
          const searchConditions: any = {};

          if (isAddress) {
            // For address search, do exact match
            searchConditions.OR = [
              { poolAddress: { equals: input.search.toLowerCase() } }, // Exact match for address
            ];
          } else {
            // For text search, keep fuzzy matching
            searchConditions.OR = [
              { description: { contains: input.search } },
              { poolAddress: { contains: input.search } }, // Still allow partial address matches for text searches
              { wallet: { user: { name: { contains: input.search } } } }, // Search by creator's name
            ];
          }

          whereClause.AND.push(searchConditions);
        }

        // Build the pools query with the where clause
        const pools = await prisma.creatorPool.findMany({
          where: whereClause,
          select: {
            id: true,
            name: true,
            description: true,
            chainId: true,
            poolAddress: true,
            image_file_id: true,
            revoStaked: true,
            poolImage: {
              select: {
                s3_key: true,
              },
            },
            wallet: {
              select: {
                user: {
                  select: {
                    name: true,
                  },
                },
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

        // Create a map to store contract data
        const blockchainStakeData = new Map<
          number,
          { creatorStaked: bigint; totalFanStaked: bigint }
        >();

        type MulticallRequest = {
          address: Address;
          abi: typeof CREATOR_POOL_ABI;
          functionName: "creatorStaked" | "totalFanStaked";
        };

        // Create multicall requests for all pools
        const multicallRequests: MulticallRequest[] = [];

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

        // Execute contract calls in batches of 5 pools (10 requests per batch)
        if (multicallRequests.length > 0) {
          try {
            const BATCH_SIZE = 5 * 2; // 5 pools * 2 requests per pool
            const allResults: any[] = [];

            for (let i = 0; i < multicallRequests.length; i += BATCH_SIZE) {
              const batch = multicallRequests.slice(i, i + BATCH_SIZE);
              const batchResults = await publicClient.multicall({
                contracts: batch,
              });
              allResults.push(...batchResults);
            }

            // Process the results, mapping them back to the correct pools
            for (let i = 0; i < pools.length; i++) {
              const pool = pools[i];
              const creatorStakedIndex = i * 2; // creatorStaked is at every 2nd index (0, 2, 4, ...)
              const totalFanStakedIndex = i * 2 + 1; // totalFanStaked is at every 2nd + 1 index (1, 3, 5, ...)

              const creatorStakedResult = allResults[creatorStakedIndex];
              const totalFanStakedResult = allResults[totalFanStakedIndex];

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
                  `Error fetching data from contract for pool ${pool.id}:`,
                  creatorStakedResult.status === "failure" ? creatorStakedResult.error : null,
                  totalFanStakedResult.status === "failure" ? totalFanStakedResult.error : null
                );
              }
            }
          } catch (error) {
            console.error(`Multicall failed for chain ${input.chainId}:`, error);
          }
        }

        // Arrays to collect updates for batch processing
        const poolsToUpdate: { id: number; revoStaked: string }[] = [];

        // Apply filtering logic after getting pool data from blockchain
        const results = await Promise.allSettled(
          pools.map(async pool => {
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

            // Get pool name from database, fallback to blockchain or ID if not available
            let poolName = pool.name;

            // If not in database, try to fetch from blockchain
            if (!poolName && pool.poolAddress && chain) {
              try {
                poolName = await getPoolName(pool.poolAddress as Address, parseInt(pool.chainId));

                // update on DB
                if (poolName) {
                  await prisma.creatorPool.update({
                    where: { id: pool.id },
                    data: { name: poolName },
                  });
                }
              } catch (error) {
                console.error(
                  `Error fetching pool name from blockchain for pool ${pool.id}:`,
                  error
                );
              }
            }

            // Count only users with positive stake amounts
            const activeStakers = pool.stakedPools.filter(
              staked => BigInt(staked.stakeAmount) > 0n
            ).length;

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
              name: poolName ?? `Pool ${pool.id}`,
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

        // Calculate APY for each pool (in parallel)
        const apyPromises = processedPools.map(async (pool) => {
          if (!pool.address || pool.stakedAmount === 0n) return { poolId: pool.id, apy: null };
          try {
            const apy = await calculatePoolAPY(pool.address as Address, parseInt(input.chainId), publicClient);
            return { poolId: pool.id, apy };
          } catch (error) {
            console.error(`Error calculating APY for pool ${pool.id}:`, error);
            return { poolId: pool.id, apy: null };
          }
        });

        const apyResults = await Promise.allSettled(apyPromises);
        const apyMap = new Map<number, number | undefined>(
          apyResults
            .filter((r): r is PromiseFulfilledResult<{ poolId: number; apy: number | null }> => r.status === "fulfilled" && r.value.apy !== null)
            .map((r) => [r.value.poolId, r.value.apy!])
        );

        // Add APY to processed pools
        const poolsWithAPY = processedPools.map(pool => ({
          ...pool,
          apy: apyMap.get(pool.id),
        }));

        // Apply filters to the processed pools
        let filteredPools = poolsWithAPY;
        if (input.filter === "no-fans") {
          filteredPools = poolsWithAPY.filter(pool => pool.fans === 0);
        } else if (input.filter === "more-than-10-fans") {
          filteredPools = poolsWithAPY.filter(pool => pool.fans > 10);
        } else if (input.filter === "more-than-10k-stake") {
          // Convert 10k ether to wei for comparison: 10000 * 10^18
          const tenKEtherInWei = BigInt(10000) * BigInt(10) ** BigInt(18);
          filteredPools = poolsWithAPY.filter(pool => pool.stakedAmount > tenKEtherInWei);
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
      const userId = ctx.user!.sub;

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
      const userId = ctx.user!.sub;

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
                name: true,
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

        // Create multicall requests for user pending rewards
        const pendingRewardRequests = poolsForMulticall.map(stake => ({
          address: stake.pool.poolAddress as Address,
          abi: CREATOR_POOL_ABI,
          functionName: "pendingReward" as const,
          args: [userWallet.address as Address],
        }));

        // Execute the database update and pending reward fetch in parallel
        const [dbUpdateResult, pendingRewardResults] = await Promise.all([
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
        ]);

        // Prepare final result with blockchain stake amounts, pending rewards, and pool names
        const resultStakes = await Promise.all(
          userStakes.map(async (stake, index) => {
            // Check if we have a blockchain update for this stake (using the result from the parallel operation)
            const blockchainData = dbUpdateResult.find(
              data => data && data.poolId === stake.pool.id
            );

            // Use blockchain value if available, otherwise use original database value
            const currentStakeAmount = blockchainData
              ? blockchainData.stakeAmount
              : stake.stakeAmount.toString();

            // Get the pending rewards from multicall results (now using the result from the parallel operation)
            const userPendingRewards = pendingRewardResults[index];

            // Get pool name from database, fallback to blockchain or ID if not available
            let poolName = stake.pool.name;

            // If not in database, try to fetch from blockchain
            if (!poolName && stake.pool.poolAddress && chain) {
              try {
                poolName = await getPoolName(
                  stake.pool.poolAddress as Address,
                  parseInt(input.chainId)
                );

                // update on DB
                if (poolName) {
                  await prisma.creatorPool.update({
                    where: { id: stake.pool.id },
                    data: { name: poolName },
                  });
                }
              } catch (error) {
                console.error(
                  `Error fetching pool name from blockchain for pool ${stake.pool.id}:`,
                  error
                );
              }
            }

            const slimRewardPool: SlimPoolForUserStakedPool = {
              id: stake.pool.id,
              address: stake.pool.poolAddress!,
              image:
                stake.pool.image_file_id && stake.pool.poolImage
                  ? {
                      id: stake.pool.image_file_id,
                      url: s3Service.getFileUrl(stake.pool.poolImage.s3_key),
                    }
                  : null,
              name: poolName ?? `Pool ${stake.pool.id}`,
              pendingRewards: userPendingRewards,
              stakedByYou: BigInt(currentStakeAmount), // Amount of REVO that the requesting user has staked in this pool
              lastClaim: stake.lastClaim,
            };

            const userStakedPool: UserStakedPool = {
              userWalletId: stake.userWalletId,
              pool: slimRewardPool,
            };
            return userStakedPool;
          })
        );

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
      const userId = ctx.user!.sub;

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

        const transactionReceipt = await publicClient.waitForTransactionReceipt({
          hash: input.hash as `0x${string}`,
          timeout: 5 * 60 * 1000,
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
      const userId = ctx.user!.sub;

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

        const transactionReceipt = await publicClient.waitForTransactionReceipt({
          hash: input.hash as `0x${string}`,
          timeout: 5 * 60 * 1000,
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

  getPoolDetailsForModal: publicProcedure
    .input(
      z
        .object({
          poolId: z.number().optional(),
          poolAddress: z.string().optional(),
          walletAddress: z.string().optional(),
        })
        .superRefine((data, ctx) => {
          if (!data.poolId && !data.poolAddress) {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              message: "Either poolId or poolAddress must be provided.",
            });
          }
        })
    )
    .query(async ({ input, ctx: _ctx }): Promise<PoolDetailsForModal> => {
      try {
        let pool;
        if (input.poolId) {
          pool = await prisma.creatorPool.findUnique({
            where: { id: input.poolId },
            select: {
              id: true,
              name: true,
              description: true,
              chainId: true,
              poolAddress: true,
              image_file_id: true,
              revoStaked: true,
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
                      handle: true,
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
            },
          });
        } else if (input.poolAddress) {
          pool = await prisma.creatorPool.findUnique({
            where: { poolAddress: input.poolAddress.toLowerCase() },
            select: {
              id: true,
              name: true,
              description: true,
              chainId: true,
              poolAddress: true,
              image_file_id: true,
              revoStaked: true,
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
                      handle: true,
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
            },
          });
        }

        if (!pool) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Pool not found",
          });
        }

        // Get the chain configuration for the pool
        const chain = getChainConfig(parseInt(pool.chainId));

        if (!chain) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Unsupported chain ID for the pool",
          });
        }

        const publicClient = createPublicClient({
          chain: chain,
          transport: http(),
        });

        // Initialize totalStake to the current db value
        let totalStake: bigint = BigInt(pool.revoStaked);

        // Get pool name from database, fallback to blockchain or ID if not available
        let poolName = pool.name;

        // Use only the wallet address provided in the input, ignoring any user context
        const targetWalletAddress = input.walletAddress || null;

        // Prepare promises for parallel execution: blockchain data, active stakers count, and user-specific data
        const [blockchainData, activeStakers, userData] = await Promise.all([
          // Fetch blockchain data (totalFanStaked, creatorStaked)
          (async () => {
            if (!pool.poolAddress) {
              return { totalStake };
            }

            try {
              // Create multicall requests for all the data we need from the contract
              const multicallRequests = [
                {
                  address: pool.poolAddress as Address,
                  abi: CREATOR_POOL_ABI,
                  functionName: "totalFanStaked" as const,
                },
                {
                  address: pool.poolAddress as Address,
                  abi: CREATOR_POOL_ABI,
                  functionName: "creatorStaked" as const,
                },
              ];

              // Execute all contract calls in a single batch
              const results = await publicClient.multicall({
                contracts: multicallRequests,
              });

              // Process the results
              const totalFanStakedResult = results[0];
              const creatorStakedResult = results[1];

              let totalFanStaked: bigint | null = null;
              let creatorStaked: bigint | null = null;

              // Handle totalFanStaked result
              if (totalFanStakedResult.status === "success") {
                totalFanStaked = totalFanStakedResult.result as bigint;
                console.log(
                  `Successfully fetched totalFanStaked from contract for pool ${pool.id}: ${totalFanStaked.toString()}`
                );
              } else {
                console.error(
                  `Error fetching totalFanStaked from contract for pool ${pool.id}:`,
                  totalFanStakedResult.error
                );
              }

              // Handle creatorStaked result
              if (creatorStakedResult.status === "success") {
                creatorStaked = creatorStakedResult.result as bigint;
                console.log(
                  `Successfully fetched creatorStaked from contract for pool ${pool.id}: ${creatorStaked.toString()}`
                );
              } else {
                console.error(
                  `Error fetching creatorStaked from contract for pool ${pool.id}:`,
                  creatorStakedResult.error
                );
              }

              // Calculate the total stake as sum of creatorStaked and totalFanStaked only if both calls succeeded
              if (totalFanStaked !== null && creatorStaked !== null) {
                const newTotalStake = (totalFanStaked + creatorStaked) as bigint;

                // Update the database with the value from the contract
                try {
                  await prisma.creatorPool.update({
                    where: { id: pool.id },
                    data: { revoStaked: newTotalStake.toString() },
                  });
                  console.log(
                    `Successfully updated revoStaked in database for pool ${pool.id}: ${newTotalStake.toString()}`
                  );
                } catch (updateError) {
                  console.error(
                    `Error updating revoStaked in database for pool ${pool.id}:`,
                    updateError
                  );
                  // Continue anyway, we'll still return the blockchain value
                }

                return { totalStake: newTotalStake };
              } else {
                console.warn(
                  `Could not fetch both totalFanStaked and creatorStaked for pool ${pool.id}, using DB value`
                );
                return { totalStake };
              }
            } catch (error) {
              console.error(`Error fetching data from contract for pool ${pool.id}:`, error);
              // If contract query fails, we'll keep the db value
              return { totalStake };
            }
          })(),

          // Count only users with positive stake amounts
          prisma.stakedPool.count({
            where: {
              poolId: pool.id,
              stakeAmount: { not: "0" }, // Count only stakes with amount > 0
            },
          }),

          // Fetch user-specific data (stakedByYou and pendingRewards) if wallet address is available
          (async () => {
            if (!pool.poolAddress || !targetWalletAddress) {
              return { stakedByYou: null, pendingRewards: null };
            }

            try {
              // Get user wallet record by address to get userWalletId
              const targetUserWallet = await prisma.userWallet.findUnique({
                where: { address: targetWalletAddress.toLowerCase() },
              });

              // Create multicall requests for user-specific data
              const userMulticallRequests = [
                {
                  address: pool.poolAddress as Address,
                  abi: CREATOR_POOL_ABI,
                  functionName: "fanStakes" as const,
                  args: [targetWalletAddress as Address],
                },
                {
                  address: pool.poolAddress as Address,
                  abi: CREATOR_POOL_ABI,
                  functionName: "pendingReward" as const,
                  args: [targetWalletAddress as Address],
                },
              ];

              // Execute user-specific contract calls in a single batch
              const userResults = await publicClient.multicall({
                contracts: userMulticallRequests,
              });

              // Process the results
              const fanStakesResult = userResults[0];
              const pendingRewardResult = userResults[1];

              let stakedByYou: bigint | null = null;
              let pendingRewards: bigint | null = null;

              // Handle fanStakes result
              if (fanStakesResult.status === "success") {
                stakedByYou = fanStakesResult.result as bigint;
                console.log(
                  `Successfully fetched stakedByYou from contract for pool ${pool.id} and address ${targetWalletAddress}: ${stakedByYou.toString()}`
                );
              } else {
                console.error(
                  `Error fetching stakedByYou from contract for pool ${pool.id} and address ${targetWalletAddress}:`,
                  fanStakesResult.error
                );
              }

              // Handle pendingReward result
              if (pendingRewardResult.status === "success") {
                pendingRewards = pendingRewardResult.result as bigint;
                console.log(
                  `Successfully fetched pendingRewards from contract for pool ${pool.id} and address ${targetWalletAddress}: ${pendingRewards.toString()}`
                );
              } else {
                console.error(
                  `Error fetching pendingRewards from contract for pool ${pool.id} and address ${targetWalletAddress}:`,
                  pendingRewardResult.error
                );
              }

              // Update the stakedPool record in database if we got blockchain data and we have the user wallet
              if (fanStakesResult.status === "success" && targetUserWallet) {
                try {
                  await prisma.stakedPool.upsert({
                    where: {
                      userWalletId_poolId: {
                        userWalletId: targetUserWallet.id,
                        poolId: pool.id,
                      },
                    },
                    update: {
                      stakeAmount: (stakedByYou || 0n).toString(),
                      updatedAt: new Date(),
                    },
                    create: {
                      userWalletId: targetUserWallet.id,
                      poolId: pool.id,
                      stakeAmount: (stakedByYou || "0").toString(),
                    },
                  });
                  console.log(
                    `Successfully updated stakedPool record for userWalletId: ${targetUserWallet.id}, poolId: ${pool.id}, amount: ${(stakedByYou || 0n).toString()}`
                  );
                } catch (updateError) {
                  console.error(
                    `Error updating stakedPool record for userWalletId: ${targetUserWallet.id}, poolId: ${pool.id}:`,
                    updateError
                  );
                  // Continue anyway, we'll still return the blockchain value
                }
              }

              // Fetch stakedPool to get lastClaim information
              let lastClaim: Date | null = null;

              if (targetUserWallet) {
                try {
                  const stakedPoolRecord = await prisma.stakedPool.findUnique({
                    where: {
                      userWalletId_poolId: {
                        userWalletId: targetUserWallet.id,
                        poolId: pool.id,
                      },
                    },
                  });

                  lastClaim = stakedPoolRecord?.lastClaim ?? null;
                } catch (error) {
                  console.error(`Error fetching lastClaim for pool ${pool.id}:`, error);
                  // Continue anyway, lastClaim info is not critical
                }
              }

              return { stakedByYou, pendingRewards, lastClaim };
            } catch (error) {
              console.error(`Error fetching user data from contract for pool ${pool.id}:`, error);
              // If contract query fails, return null values
              return { stakedByYou: null, pendingRewards: null, lastClaim: null };
            }
          })(),
        ]);

        // Update values with data from blockchain calls
        totalStake = blockchainData.totalStake;

        // Fetch pool name from blockchain if not in database
        if (!poolName && pool.poolAddress && chain) {
          try {
            poolName = await getPoolName(pool.poolAddress as Address, parseInt(pool.chainId));

            // update on DB
            if (poolName) {
              await prisma.creatorPool.update({
                where: { id: pool.id },
                data: { name: poolName },
              });
            }
          } catch (error) {
            console.error(`Error fetching pool name from blockchain for pool ${pool.id}:`, error);
          }
        }
        const stakedByYou = userData.stakedByYou;
        const pendingRewards = userData.pendingRewards;
        const lastClaim = userData.lastClaim ?? null;

        // Calculate APY for the pool
        let apy: number | undefined = undefined;
        if (pool.poolAddress && totalStake > 0n) {
          try {
            const calculatedAPY = await calculatePoolAPY(pool.poolAddress as Address, parseInt(pool.chainId), publicClient);
            if (calculatedAPY !== null) {
              apy = calculatedAPY;
            }
          } catch (error) {
            console.error(`Error calculating APY for pool ${pool.id}:`, error);
          }
        }

        // Return only the data that is actually displayed in the modal
        return {
          id: pool.id,
          name: poolName ?? `Pool ${pool.id}`,
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
          pendingRewards,
          stakedByYou,
          lastClaim,
          apy,
          creator: {
            userId: pool.wallet!.userId!,
            address: pool.wallet!.address!,
            handle: pool.wallet!.user?.handle || null,
            name: pool.wallet!.user?.name || "Unknown Creator",
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

  confirmClaim: privateProcedure
    .input(
      z.object({
        poolId: z.number(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.user!.sub;

      try {
        // Get user wallet
        const userWallet = await prisma.userWallet.findUnique({
          where: { userId },
        });

        if (!userWallet) {
          throw new TRPCError({
            code: "PRECONDITION_FAILED",
            message: "User does not have a wallet",
          });
        }

        // Update stakedPool with lastClaim
        await prisma.stakedPool.update({
          where: {
            userWalletId_poolId: {
              userWalletId: userWallet.id,
              poolId: input.poolId,
            },
          },
          data: {
            lastClaim: new Date(),
          },
        });

        return {
          success: true,
        };
      } catch (error) {
        console.error("Error confirming claim:", error);
        if (error instanceof TRPCError) throw error;
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to confirm claim",
        });
      }
    }),
});
