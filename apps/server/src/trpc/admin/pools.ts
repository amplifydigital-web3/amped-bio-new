import { adminProcedure, router } from "../trpc";
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { prisma } from "../../services/DB";
import { createPublicClient, http, decodeEventLog, type Address, type Log } from "viem";
import { getChainConfig, L2_BASE_TOKEN_ABI, CREATOR_POOL_ABI } from "@ampedbio/web3";

export const adminPoolsRouter = router({
  getAllPools: adminProcedure.query(async () => {
    try {
      const pools = await prisma.creatorPool.findMany({
        include: {
          wallet: {
            select: {
              user: {
                select: {
                  handle: true,
                  email: true,
                },
              },
            },
          },
        },
      });
      return pools;
    } catch (error) {
      console.error("Error fetching all pools:", error);
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: "Failed to fetch pools",
      });
    }
  }),

  setHidden: adminProcedure
    .input(
      z.object({
        poolId: z.number(),
        hidden: z.boolean(),
      })
    )
    .mutation(async ({ input }) => {
      const { poolId, hidden } = input;

      try {
        const updatedPool = await prisma.creatorPool.update({
          where: { id: poolId },
          data: {
            hidden: hidden,
          },
        });

        return {
          ...updatedPool,
          message: `Pool visibility set to ${hidden}`,
        };
      } catch (error) {
        console.error("Error updating pool visibility:", error);
        if (error instanceof TRPCError) throw error;
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to update pool visibility",
        });
      }
    }),

  setCreationTxid: adminProcedure
    .input(
      z.object({
        poolId: z.number(),
        creationTxid: z.string().regex(/^0x[0-9a-fA-F]{64}$/, "Invalid transaction hash format"),
      })
    )
    .mutation(async ({ input }) => {
      const { poolId, creationTxid } = input;

      try {
        const pool = await prisma.creatorPool.findUnique({
          where: { id: poolId },
        });

        if (!pool) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: `Pool with id ${poolId} not found`,
          });
        }

        const updatedPool = await prisma.creatorPool.update({
          where: { id: poolId },
          data: {
            creationTxid,
          },
        });

        return {
          id: updatedPool.id,
          creationTxid: updatedPool.creationTxid,
          message: "Transaction hash updated successfully",
        };
      } catch (error) {
        console.error("Error updating pool transaction hash:", error);
        if (error instanceof TRPCError) throw error;
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to update pool transaction hash",
        });
      }
    }),

  syncPool: adminProcedure
    .input(
      z.object({
        poolId: z.number(),
      })
    )
    .mutation(async ({ input }) => {
      const verboseLog = (...args: unknown[]) => {
        console.info("[syncPool]", ...args);
      };

      verboseLog("=== START ===", { poolId: input.poolId });

      // 1. Find the pool in DB
      const pool = await prisma.creatorPool.findUnique({
        where: { id: input.poolId },
      });

      if (!pool) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: `Pool with id ${input.poolId} not found`,
        });
      }

      if (!pool.poolAddress) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `Pool ${input.poolId} has no poolAddress set. Sync the pool creation first.`,
        });
      }

      const chain = getChainConfig(parseInt(pool.chainId));

      if (!chain) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `Unsupported chain ID: ${pool.chainId}`,
        });
      }

      verboseLog("Pool found:", {
        id: pool.id,
        poolAddress: pool.poolAddress,
        chainId: pool.chainId,
        chainName: chain.name,
      });

      const publicClient = createPublicClient({
        chain: chain,
        transport: http(),
      });

      const tokenAddress = chain.contracts.L2_BASE_TOKEN.address;
      const poolAddress = pool.poolAddress as Address;

      // 2. Find the creation block using the saved creationTxid
      if (!pool.creationTxid) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: `Pool ${input.poolId} has no creationTxid. Set it first in the admin panel (Actions > Set Tx).`,
        });
      }

      verboseLog("Using creationTxid:", pool.creationTxid);
      let creationBlock: bigint;
      try {
        const receipt = await publicClient.getTransactionReceipt({
          hash: pool.creationTxid as `0x${string}`,
        });
        creationBlock = receipt.blockNumber;
        verboseLog("Creation block:", creationBlock.toString());
      } catch (error) {
        console.error("Failed to fetch receipt from creationTxid:", error);
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `Invalid or unreachable creationTxid: ${pool.creationTxid}. Verify the hash and update it in the admin panel.`,
        });
      }

      // 3. Get all Stake events for this pool from L2_BASE_TOKEN
      // TODO: For pools with thousands of events, implement paginated getLogs
      //       (some RPC providers cap at 10k blocks/blogs per request)
      verboseLog("Fetching events from block", creationBlock.toString());
      const stakeLogs: Log[] = [];
      const unstakeLogs: Log[] = [];

      try {
        const fetchedStakeLogs = await publicClient.getLogs({
          address: tokenAddress,
          event: {
            type: "event",
            name: "Stake",
            inputs: [
              { type: "address", name: "staker", indexed: true },
              { type: "address", name: "pool", indexed: true },
              { type: "uint256", name: "amount", indexed: false },
            ],
          } as const,
          args: {
            pool: poolAddress,
          } as any,
          fromBlock: creationBlock,
          toBlock: "latest",
        });
        stakeLogs.push(...fetchedStakeLogs);
        verboseLog(`Found ${fetchedStakeLogs.length} Stake logs`);
      } catch (error) {
        console.error("Error fetching Stake logs:", error);
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: `Failed to fetch Stake logs: ${(error as Error).message}`,
        });
      }

      // 4. Get all Unstake events for this pool from L2_BASE_TOKEN
      try {
        const fetchedUnstakeLogs = await publicClient.getLogs({
          address: tokenAddress,
          event: {
            type: "event",
            name: "Unstake",
            inputs: [
              { type: "address", name: "unstaker", indexed: true },
              { type: "address", name: "pool", indexed: true },
              { type: "uint256", name: "amount", indexed: false },
            ],
          } as const,
          args: {
            pool: poolAddress,
          } as any,
          fromBlock: creationBlock,
          toBlock: "latest",
        });
        unstakeLogs.push(...fetchedUnstakeLogs);
        verboseLog(`Found ${fetchedUnstakeLogs.length} Unstake logs`);
      } catch (error) {
        console.error("Error fetching Unstake logs:", error);
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: `Failed to fetch Unstake logs: ${(error as Error).message}`,
        });
      }

      // 5. Get RewardClaimed events from the pool contract
      verboseLog("Fetching RewardClaimed events...");
      let rewardClaimedLogs: Log[] = [];
      try {
        const fetched = await publicClient.getLogs({
          address: poolAddress,
          event: {
            type: "event",
            name: "RewardClaimed",
            inputs: [
              { type: "address", name: "fan", indexed: true },
              { type: "uint256", name: "amount", indexed: false },
            ],
          } as const,
          fromBlock: creationBlock,
          toBlock: "latest",
        });
        rewardClaimedLogs = fetched;
        verboseLog(`Found ${fetched.length} RewardClaimed logs`);
      } catch (error) {
        console.error("Error fetching RewardClaimed logs:", error);
        // Non-fatal — continue processing
        rewardClaimedLogs = [];
      }

      // 6. Process Stake events
      let stakesProcessed = 0;
      let stakesSkipped = 0;
      let stakesAlreadyIndexed = 0;

      for (const log of stakeLogs) {
        try {
          const decodedLog = decodeEventLog({
            abi: L2_BASE_TOKEN_ABI,
            eventName: "Stake",
            data: log.data,
            topics: log.topics,
          });
          const args = decodedLog.args as any;
          const stakerAddress = (args.staker as string).toLowerCase();
          const amount = typeof args.amount === "bigint" ? args.amount : BigInt(args.amount);
          const txHash = log.transactionHash!;

          // Find or skip wallet not in DB
          const userWallet = await prisma.userWallet.findUnique({
            where: { address: stakerAddress },
          });

          if (!userWallet) {
            stakesSkipped++;
            continue;
          }

          // Check if already indexed
          const existingEvent = await prisma.stakeEvent.findUnique({
            where: {
              transactionHash_userWalletId_poolId: {
                transactionHash: txHash,
                userWalletId: userWallet.id,
                poolId: pool.id,
              },
            },
          });

          if (existingEvent) {
            stakesAlreadyIndexed++;
            continue;
          }

          // Upsert StakedPool
          const existingStake = await prisma.stakedPool.findUnique({
            where: {
              userWalletId_poolId: {
                userWalletId: userWallet.id,
                poolId: pool.id,
              },
            },
            select: { stakeAmount: true },
          });

          const existingAmount = BigInt(existingStake?.stakeAmount || "0");
          const newStakeAmount = (existingAmount + amount).toString();

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
              stakeAmount: amount.toString(),
            },
          });

          // Create StakeEvent
          await prisma.stakeEvent.create({
            data: {
              userWalletId: userWallet.id,
              poolId: pool.id,
              amount: amount.toString(),
              eventType: "stake",
              transactionHash: txHash,
            },
          });

          stakesProcessed++;
        } catch (error) {
          console.error("Error processing Stake log:", error);
          stakesSkipped++;
        }
      }

      // 7. Process Unstake events
      let unstakesProcessed = 0;
      let unstakesSkipped = 0;
      let unstakesAlreadyIndexed = 0;

      for (const log of unstakeLogs) {
        try {
          const decodedLog = decodeEventLog({
            abi: L2_BASE_TOKEN_ABI,
            eventName: "Unstake",
            data: log.data,
            topics: log.topics,
          });
          const args = decodedLog.args as any;
          const unstakerAddress = (args.unstaker as string).toLowerCase();
          const amount = typeof args.amount === "bigint" ? args.amount : BigInt(args.amount);
          const txHash = log.transactionHash!;

          // Find or skip wallet not in DB
          const userWallet = await prisma.userWallet.findUnique({
            where: { address: unstakerAddress },
          });

          if (!userWallet) {
            unstakesSkipped++;
            continue;
          }

          // Check if already indexed
          const existingEvent = await prisma.stakeEvent.findUnique({
            where: {
              transactionHash_userWalletId_poolId: {
                transactionHash: txHash,
                userWalletId: userWallet.id,
                poolId: pool.id,
              },
            },
          });

          if (existingEvent) {
            unstakesAlreadyIndexed++;
            continue;
          }

          // Upsert StakedPool
          const existingStake = await prisma.stakedPool.findUnique({
            where: {
              userWalletId_poolId: {
                userWalletId: userWallet.id,
                poolId: pool.id,
              },
            },
            select: { stakeAmount: true },
          });

          const existingAmount = BigInt(existingStake?.stakeAmount || "0");

          if (existingAmount < amount) {
            verboseLog(
              `Unstake amount ${amount.toString()} exceeds current stake ${existingAmount.toString()} for wallet ${unstakerAddress}. Setting to 0.`
            );
            // Instead of erroring, we set to 0 to avoid blocking the sync
          }

          const newStakeAmount =
            existingAmount >= amount ? (existingAmount - amount).toString() : "0";

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
              stakeAmount: (-amount).toString(),
            },
          });

          // Create StakeEvent
          await prisma.stakeEvent.create({
            data: {
              userWalletId: userWallet.id,
              poolId: pool.id,
              amount: amount.toString(),
              eventType: "unstake",
              transactionHash: txHash,
            },
          });

          unstakesProcessed++;
        } catch (error) {
          console.error("Error processing Unstake log:", error);
          unstakesSkipped++;
        }
      }

      // 8. Process RewardClaimed events (update lastClaim on StakedPool)
      // Cache block timestamps to avoid redundant RPC calls
      const blockTimestampCache = new Map<bigint, Date>();
      let claimsProcessed = 0;
      let claimsSkipped = 0;

      for (const log of rewardClaimedLogs) {
        try {
          const decodedLog = decodeEventLog({
            abi: CREATOR_POOL_ABI,
            eventName: "RewardClaimed",
            data: log.data,
            topics: log.topics,
          });
          const args = decodedLog.args as any;
          const fanAddress = (args.fan as string).toLowerCase();

          const userWallet = await prisma.userWallet.findUnique({
            where: { address: fanAddress },
          });

          if (!userWallet) {
            claimsSkipped++;
            continue;
          }

          // Resolve block timestamp (cached per block)
          let blockTimestamp = blockTimestampCache.get(log.blockNumber!);
          if (!blockTimestamp) {
            try {
              const block = await publicClient.getBlock({ blockNumber: log.blockNumber! });
              blockTimestamp = new Date(Number(block.timestamp) * 1000);
              blockTimestampCache.set(log.blockNumber!, blockTimestamp);
            } catch {
              // Fallback: approximate from block number if RPC fails
              blockTimestamp = new Date(Number(log.blockNumber!) * 1000);
              blockTimestampCache.set(log.blockNumber!, blockTimestamp);
            }
          }

          await prisma.stakedPool.updateMany({
            where: {
              userWalletId: userWallet.id,
              poolId: pool.id,
            },
            data: {
              lastClaim: blockTimestamp,
            },
          });

          claimsProcessed++;
        } catch (error) {
          console.error("Error processing RewardClaimed log:", error);
          claimsSkipped++;
        }
      }

      // 9. Recalculate total fans and revoStaked for the pool
      verboseLog("Recalculating pool aggregation data...");
      const allStakedPools = await prisma.stakedPool.findMany({
        where: { poolId: pool.id },
        select: { stakeAmount: true },
      });

      // Sum the string amounts as BigInt
      let totalStakedBigInt = 0n;
      for (const sp of allStakedPools) {
        totalStakedBigInt += BigInt(sp.stakeAmount || "0");
      }
      const totalStaked = totalStakedBigInt.toString();
      const fansCount = allStakedPools.length;

      await prisma.creatorPool.update({
        where: { id: pool.id },
        data: {
          revoStaked: totalStaked,
          fans: fansCount,
        },
      });

      verboseLog("=== END ===");

      return {
        success: true,
        message: `Pool sync completed`,
        poolId: pool.id,
        summary: {
          stakes: {
            processed: stakesProcessed,
            skipped: stakesSkipped,
            alreadyIndexed: stakesAlreadyIndexed,
          },
          unstakes: {
            processed: unstakesProcessed,
            skipped: unstakesSkipped,
            alreadyIndexed: unstakesAlreadyIndexed,
          },
          claims: {
            processed: claimsProcessed,
            skipped: claimsSkipped,
          },
          totalStaked,
          fansCount,
        },
      };
    }),

  syncTransaction: adminProcedure
    .input(
      z.object({
        chainId: z.string(),
        hash: z.string().regex(/^0x[0-9a-fA-F]{64}$/, "Invalid transaction hash format"),
      })
    )
    .mutation(async ({ input }) => {
      try {
        console.log("=== syncTransaction START ===");
        console.log("Input received:", { chainId: input.chainId, hash: input.hash });

        const chain = getChainConfig(parseInt(input.chainId));

        if (!chain) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Unsupported chain ID",
          });
        }
        console.log("Chain found:", { chainId: input.chainId, chainName: chain.name });

        const publicClient = createPublicClient({
          chain: chain,
          transport: http(),
        });

        console.log("Fetching transaction receipt...");
        const transactionReceipt = await publicClient.getTransactionReceipt({
          hash: input.hash as `0x${string}`,
        });

        if (!transactionReceipt) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Transaction not found or not confirmed on the blockchain",
          });
        }
        console.log("Transaction receipt found:", {
          from: transactionReceipt.from,
          to: transactionReceipt.to,
          blockNumber: transactionReceipt.blockNumber,
          logsCount: transactionReceipt.logs.length,
        });

        const transactionSender = transactionReceipt.from.toLowerCase();
        console.log("Transaction sender:", transactionSender);

        console.log("Searching for user wallet in database...");
        const userWallet = await prisma.userWallet.findUnique({
          where: { address: transactionSender },
        });

        if (!userWallet) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: `User wallet with address ${transactionSender} not found in database`,
          });
        }
        console.log("User wallet found:", {
          id: userWallet.id,
          address: userWallet.address,
          userId: userWallet.userId,
        });

        console.log("=== Searching for STAKE events ===");
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
            if (!args.staker || !args.pool || args.amount === undefined) {
              console.warn("Stake event missing required fields:", args);
              continue;
            }
            const amount = typeof args.amount === "bigint" ? args.amount : BigInt(args.amount);
            const poolAddress = args.pool.toLowerCase();
            console.log("Stake event decoded:", {
              staker: args.staker,
              pool: args.pool,
              amount: amount.toString(),
            });
            parsedStakes.push({
              delegator: args.staker.toLowerCase(),
              delegatee: poolAddress,
              amount,
            });
          } catch (error) {
            console.error("Error decoding stake event log:", error);
            continue;
          }
        }

        console.log("=== Searching for UNSTAKE events ===");
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
            if (!args.unstaker || !args.pool || args.amount === undefined) {
              console.warn("Unstake event missing required fields:", args);
              continue;
            }
            const amount = typeof args.amount === "bigint" ? args.amount : BigInt(args.amount);
            const poolAddress = args.pool.toLowerCase();
            console.log("Unstake event decoded:", {
              unstaker: args.unstaker,
              pool: args.pool,
              amount: amount.toString(),
            });
            parsedUnstakes.push({
              delegator: args.unstaker.toLowerCase(),
              delegatee: poolAddress,
              amount,
            });
          } catch (error) {
            console.error("Error decoding unstake event log:", error);
            continue;
          }
        }

        if (parsedStakes.length === 0 && parsedUnstakes.length === 0) {
          console.log("=== ERROR: No events found ===");
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "No Stake or Unstake event found in transaction logs",
          });
        }

        for (const stake of parsedStakes) {
          console.log("Processing stake event:", {
            delegatee: stake.delegatee,
            delegator: stake.delegator,
            amount: stake.amount.toString(),
          });

          if (stake.delegator.toLowerCase() !== transactionSender) {
            console.log("Skipping stake event - staker doesn't match transaction sender");
            continue;
          }

          console.log("Searching for pool in database...");
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
          console.log("Pool found:", {
            id: pool.id,
            poolAddress: pool.poolAddress,
          });

          if (pool.chainId !== input.chainId) {
            throw new TRPCError({
              code: "FORBIDDEN",
              message: "Stake event is for a pool on a different chain than specified",
            });
          }

          console.log("Checking if event already processed...");
          const existingEvent = await prisma.stakeEvent.findUnique({
            where: {
              transactionHash_userWalletId_poolId: {
                transactionHash: input.hash,
                userWalletId: userWallet.id,
                poolId: pool.id,
              },
            },
          });

          if (existingEvent) {
            throw new TRPCError({
              code: "BAD_REQUEST",
              message: `Transaction ${input.hash} already processed for userWalletId ${userWallet.id} and poolId ${pool.id}. Event type: ${existingEvent.eventType}`,
            });
          }
          console.log("Event not processed yet - safe to proceed");

          console.log("Fetching existing stake...");
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

          const existingAmount = BigInt(existingStake?.stakeAmount || "0");
          const newStakeAmount = (existingAmount + stake.amount).toString();
          console.log("Stake calculation:", {
            existingAmount: existingAmount.toString(),
            stakeAmount: stake.amount.toString(),
            newStakeAmount,
          });

          console.log("Upserting stakedPool...");
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
              stakeAmount: stake.amount.toString(),
            },
          });
          console.log("StakedPool upserted successfully");

          console.log("Creating stakeEvent...");
          await prisma.stakeEvent.create({
            data: {
              userWalletId: userWallet.id,
              poolId: pool.id,
              amount: stake.amount.toString(),
              eventType: "stake",
              transactionHash: input.hash,
            },
          });
          console.log("StakeEvent created successfully");

          console.log(
            `=== STAKE event processed successfully === for user ${userWallet.userId} in pool ${pool.id}, amount: ${stake.amount.toString()}`
          );
        }

        for (const unstake of parsedUnstakes) {
          console.log("Processing unstake event:", {
            delegatee: unstake.delegatee,
            delegator: unstake.delegator,
            amount: unstake.amount.toString(),
          });

          if (unstake.delegator.toLowerCase() !== transactionSender) {
            console.log("Skipping unstake event - unstaker doesn't match transaction sender");
            continue;
          }

          console.log("Searching for pool in database...");
          const pool = await prisma.creatorPool.findUnique({
            where: {
              poolAddress: unstake.delegatee,
            },
          });

          if (!pool) {
            throw new TRPCError({
              code: "NOT_FOUND",
              message: `Pool with address ${unstake.delegatee} not found in database.`,
            });
          }
          console.log("Pool found:", {
            id: pool.id,
            poolAddress: pool.poolAddress,
          });

          if (pool.chainId !== input.chainId) {
            throw new TRPCError({
              code: "FORBIDDEN",
              message: "Unstake event is for a pool on a different chain than specified",
            });
          }

          console.log("Checking if event already processed...");
          const existingEvent = await prisma.stakeEvent.findUnique({
            where: {
              transactionHash_userWalletId_poolId: {
                transactionHash: input.hash,
                userWalletId: userWallet.id,
                poolId: pool.id,
              },
            },
          });

          if (existingEvent) {
            throw new TRPCError({
              code: "BAD_REQUEST",
              message: `Transaction ${input.hash} already processed for userWalletId ${userWallet.id} and poolId ${pool.id}. Event type: ${existingEvent.eventType}`,
            });
          }
          console.log("Event not processed yet - safe to proceed");

          console.log("Fetching existing stake...");
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

          const existingAmount = BigInt(existingStake?.stakeAmount || "0");
          console.log("Existing stake:", existingAmount.toString());

          if (existingAmount < unstake.amount) {
            throw new TRPCError({
              code: "BAD_REQUEST",
              message: `Unstake amount exceeds current stake. Current stake: ${existingAmount}, Requested unstake: ${unstake.amount}`,
            });
          }

          const newStakeAmount = (existingAmount - unstake.amount).toString();
          console.log("Unstake calculation:", {
            existingAmount: existingAmount.toString(),
            unstakeAmount: unstake.amount.toString(),
            newStakeAmount,
          });

          console.log("Upserting stakedPool...");
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
              stakeAmount: (-unstake.amount).toString(),
            },
          });
          console.log("StakedPool upserted successfully");

          console.log("Creating stakeEvent...");
          await prisma.stakeEvent.create({
            data: {
              userWalletId: userWallet.id,
              poolId: pool.id,
              amount: unstake.amount.toString(),
              eventType: "unstake",
              transactionHash: input.hash,
            },
          });
          console.log("StakeEvent created successfully");

          console.log(
            `=== UNSTAKE event processed successfully === for user ${userWallet.userId} in pool ${pool.id}, amount: ${unstake.amount.toString()}`
          );
        }

        console.log("=== Returning syncTransaction success ===");
        const result = {
          success: true,
          message: `Successfully synced ${parsedStakes.length + parsedUnstakes.length} transaction(s)`,
          stakes: parsedStakes.map(stake => ({
            delegator: stake.delegator,
            delegatee: stake.delegatee,
            amount: stake.amount.toString(),
          })),
          unstakes: parsedUnstakes.map(unstake => ({
            delegator: unstake.delegator,
            delegatee: unstake.delegatee,
            amount: unstake.amount.toString(),
          })),
        };
        console.log("Response:", result);
        console.log("=== syncTransaction END ===");
        return result;
      } catch (error) {
        console.error("=== ERROR in syncTransaction ===");
        console.error("Error syncing transaction:", error);
        if (error instanceof TRPCError) {
          console.error("TRPCError:", { code: error.code, message: error.message });
          throw error;
        }
        if (error instanceof Error) {
          console.error("Error message:", error.message);
          console.error("Error stack:", error.stack);
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: `Failed to sync transaction: ${error.message}`,
          });
        }
        console.error("Unknown error type:", error);
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to sync transaction",
        });
      }
    }),
});
