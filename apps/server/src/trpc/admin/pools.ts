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

  /**
   * Sets or updates the creation transaction hash (txid) for a pool.
   * Used by admins to manually link a pool to its on-chain creation transaction.
   * This txid is required by syncPool to locate the pool's creation block.
   */
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

  /**
   * Synchronizes all on-chain events for a specific pool from its creation block to present.
   *
   * 1. Validates the pool exists and has a creationTxid set.
   * 2. Fetches the creation block via getTransactionReceipt using the saved txid.
   * 3. Queries all Stake / Unstake events from L2_BASE_TOKEN filtered by pool address.
   * 4. Queries all RewardClaimed events from the pool contract.
   * 5. Decodes all events, batch-finds known wallets, and batch-checks already-indexed events.
   * 6. Computes net balance changes per wallet and writes everything in a single DB transaction.
   * 7. Updates lastClaim timestamps for RewardClaimed events.
   * 8. Recalculates and saves the pool's revoStaked and fans counts.
   *
   * Returns a summary with processed/skipped/alreadyIndexed counts for each event type.
   */
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

      // Initialize summary counters at the top so all code paths are covered
      let summaryStakesProcessed = 0;
      let summaryStakesSkipped = 0;
      let summaryStakesAlready = 0;
      let summaryUnstakesProcessed = 0;
      let summaryUnstakesSkipped = 0;
      let summaryUnstakesAlready = 0;

      // 6. Decode all events and batch-process them
      //
      // Instead of N events × 5 DB queries, we:
      //   1. Decode all events in memory
      //   2. Batch-find all wallets with one query
      //   3. Batch-check existing events with one query
      //   4. Write everything in a single transaction

      interface ParsedEvent {
        address: string;
        amount: bigint;
        txHash: string;
        type: "stake" | "unstake";
      }
      const allEvents: ParsedEvent[] = [];

      // --- Decode all Stake events ---
      for (const log of stakeLogs) {
        try {
          const decoded = decodeEventLog({
            abi: L2_BASE_TOKEN_ABI,
            eventName: "Stake",
            data: log.data,
            topics: log.topics,
          });
          const args = decoded.args as any;
          allEvents.push({
            address: (args.staker as string).toLowerCase(),
            amount: typeof args.amount === "bigint" ? args.amount : BigInt(args.amount),
            txHash: log.transactionHash!,
            type: "stake",
          });
        } catch (error) {
          console.error("Error decoding Stake log:", error);
        }
      }

      // --- Decode all Unstake events ---
      for (const log of unstakeLogs) {
        try {
          const decoded = decodeEventLog({
            abi: L2_BASE_TOKEN_ABI,
            eventName: "Unstake",
            data: log.data,
            topics: log.topics,
          });
          const args = decoded.args as any;
          allEvents.push({
            address: (args.unstaker as string).toLowerCase(),
            amount: typeof args.amount === "bigint" ? args.amount : BigInt(args.amount),
            txHash: log.transactionHash!,
            type: "unstake",
          });
        } catch (error) {
          console.error("Error decoding Unstake log:", error);
        }
      }

      verboseLog(`Decoded ${allEvents.length} total stake/unstake events`);

      if (allEvents.length > 0) {
        // --- Batch-find all wallets ---
        const uniqueAddresses = [...new Set(allEvents.map(e => e.address))];
        const wallets = await prisma.userWallet.findMany({
          where: { address: { in: uniqueAddresses } },
          select: { id: true, address: true },
        });
        const walletByAddress = new Map(wallets.map(w => [w.address, w.id]));

        // Filter events to only those with known wallets
        const knownEvents = allEvents.filter(e => walletByAddress.has(e.address));
        summaryStakesSkipped = allEvents.length - knownEvents.length;

        if (knownEvents.length > 0) {
          // --- Batch-check which events already exist ---
          const existingEventKeys = new Set(
            (
              await prisma.stakeEvent.findMany({
                where: {
                  poolId: pool.id,
                  OR: knownEvents.map(e => ({
                    transactionHash: e.txHash,
                    userWalletId: walletByAddress.get(e.address)!,
                  })),
                },
                select: {
                  transactionHash: true,
                  userWalletId: true,
                  eventType: true,
                },
              })
            ).map(e => `${e.transactionHash}-${e.userWalletId}`)
          );

          // Separate new vs already-indexed and split by type
          const newStakes: ParsedEvent[] = [];
          const newUnstakes: ParsedEvent[] = [];

          for (const e of knownEvents) {
            const key = `${e.txHash}-${walletByAddress.get(e.address)!}`;
            if (existingEventKeys.has(key)) {
              if (e.type === "stake") summaryStakesAlready++;
              else summaryUnstakesAlready++;
            } else {
              if (e.type === "stake") newStakes.push(e);
              else newUnstakes.push(e);
            }
          }

          summaryStakesProcessed = newStakes.length;
          summaryUnstakesProcessed = newUnstakes.length;

          verboseLog(
            `Events: ${knownEvents.length} known wallets, ${summaryStakesAlready + summaryUnstakesAlready} already indexed, ${newStakes.length + newUnstakes.length} to process`
          );

          const allNew = [...newStakes, ...newUnstakes];

          if (allNew.length > 0) {
            // --- Aggregate net amount per wallet ---
            const netAmounts = new Map<number, bigint>();
            for (const e of allNew) {
              const wid = walletByAddress.get(e.address)!;
              netAmounts.set(
                wid,
                (netAmounts.get(wid) || 0n) + (e.type === "stake" ? e.amount : -e.amount)
              );
            }

            // Fetch current stakes for these wallets
            const currentStakes = await prisma.stakedPool.findMany({
              where: {
                poolId: pool.id,
                userWalletId: { in: [...netAmounts.keys()] },
              },
              select: { userWalletId: true, stakeAmount: true },
            });
            const currentByWallet = new Map(
              currentStakes.map(s => [s.userWalletId, BigInt(s.stakeAmount || "0")])
            );

            // Write everything in a single transaction
            await prisma.$transaction(async tx => {
              // Upsert StakedPool for each wallet with net change
              for (const [walletId, netChange] of netAmounts) {
                const currentAmount = currentByWallet.get(walletId) || 0n;
                const newAmount = currentAmount + netChange;
                const finalAmount = newAmount >= 0n ? newAmount : 0n;

                await tx.stakedPool.upsert({
                  where: {
                    userWalletId_poolId: {
                      userWalletId: walletId,
                      poolId: pool.id,
                    },
                  },
                  update: { stakeAmount: finalAmount.toString(), updatedAt: new Date() },
                  create: {
                    userWalletId: walletId,
                    poolId: pool.id,
                    stakeAmount: finalAmount.toString(),
                  },
                });
              }

              // Batch-create all new StakeEvents
              await tx.stakeEvent.createMany({
                data: allNew.map(e => ({
                  userWalletId: walletByAddress.get(e.address)!,
                  poolId: pool.id,
                  amount: e.amount.toString(),
                  eventType: e.type,
                  transactionHash: e.txHash,
                })),
              });
            });

            verboseLog(
              `Batch write done: ${allNew.length} events, ${netAmounts.size} stakedPools upserted`
            );
          }
        }
      }

      // 8. Process RewardClaimed events (batch)
      let claimsProcessed = 0;
      let claimsSkipped = 0;

      if (rewardClaimedLogs.length > 0) {
        // Decode claims and batch-find wallets
        const claimEvents: { address: string; blockNumber: bigint }[] = [];
        for (const log of rewardClaimedLogs) {
          try {
            const decoded = decodeEventLog({
              abi: CREATOR_POOL_ABI,
              eventName: "RewardClaimed",
              data: log.data,
              topics: log.topics,
            });
            const args = decoded.args as any;
            claimEvents.push({
              address: (args.fan as string).toLowerCase(),
              blockNumber: log.blockNumber!,
            });
          } catch {
            // skip
          }
        }

        if (claimEvents.length > 0) {
          const claimAddresses = [...new Set(claimEvents.map(c => c.address))];
          const claimWallets = await prisma.userWallet.findMany({
            where: { address: { in: claimAddresses } },
            select: { id: true, address: true },
          });
          const claimWalletByAddress = new Map(claimWallets.map(w => [w.address, w.id]));

          // Resolve unique block timestamps in batch (via getBlock, cached)
          const uniqueBlocks = [...new Set(claimEvents.map(c => c.blockNumber.toString()))].map(s =>
            BigInt(s)
          );
          const blockTimestampCache = new Map<bigint, Date>();
          for (const bn of uniqueBlocks) {
            try {
              const block = await publicClient.getBlock({ blockNumber: bn });
              blockTimestampCache.set(bn, new Date(Number(block.timestamp) * 1000));
            } catch {
              blockTimestampCache.set(bn, new Date(Number(bn) * 1000));
            }
          }

          // Update lastClaim for each known wallet (grouped to avoid N updates)
          const walletLastClaim = new Map<number, Date>();
          for (const ce of claimEvents) {
            const wid = claimWalletByAddress.get(ce.address);
            if (!wid) {
              claimsSkipped++;
              continue;
            }
            const ts = blockTimestampCache.get(ce.blockNumber)!;
            const existing = walletLastClaim.get(wid);
            if (!existing || ts > existing) {
              walletLastClaim.set(wid, ts);
            }
          }

          // Batch-update lastClaim
          for (const [wid, ts] of walletLastClaim) {
            await prisma.stakedPool.updateMany({
              where: { userWalletId: wid, poolId: pool.id },
              data: { lastClaim: ts },
            });
          }

          claimsProcessed = walletLastClaim.size;
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
            processed: summaryStakesProcessed,
            skipped: summaryStakesSkipped,
            alreadyIndexed: summaryStakesAlready,
          },
          unstakes: {
            processed: summaryUnstakesProcessed,
            skipped: summaryUnstakesSkipped,
            alreadyIndexed: summaryUnstakesAlready,
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
