import { adminProcedure, router } from "../trpc";
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { prisma } from "../../services/DB";
import { createPublicClient, http, decodeEventLog, type Address, type Log } from "viem";
import { getChainConfig, L2_BASE_TOKEN_ABI, CREATOR_POOL_FACTORY_ABI } from "@ampedbio/web3";

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
   * Auto-fetches the creation transaction hash for a pool by looking up the
   * CreatorPoolCreated event from the CREATOR_POOL_FACTORY contract on the pool's chain.
   * The event is filtered by the pool's address to find the exact transaction that created it.
   */
  fetchCreationTxid: adminProcedure
    .input(
      z.object({
        poolAddress: z.string().regex(/^0x[0-9a-fA-F]{40}$/, "Invalid pool address"),
        chainId: z.number(),
      })
    )
    .query(async ({ input }) => {
      const chain = getChainConfig(input.chainId);

      if (!chain) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `Unsupported chain ID: ${input.chainId}`,
        });
      }

      const factoryAddress = chain.contracts.CREATOR_POOL_FACTORY.address;

      if (!factoryAddress || factoryAddress === "0x0000000000000000000000000000000000000000") {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `No CREATOR_POOL_FACTORY contract configured for chain ${input.chainId}`,
        });
      }

      const publicClient = createPublicClient({
        chain: chain,
        transport: http(),
      });

      try {
        const logs = await publicClient.getLogs({
          address: factoryAddress as Address,
          event: {
            type: "event",
            name: "CreatorPoolCreated",
            inputs: [
              { type: "address", name: "creator", indexed: true },
              { type: "address", name: "pool", indexed: true },
              { type: "address", name: "node", indexed: true },
              { type: "uint256", name: "creatorCut", indexed: false },
              { type: "string", name: "poolName", indexed: false },
            ],
          },
          args: {
            pool: input.poolAddress as Address,
          },
          fromBlock: 0n,
          toBlock: "latest",
        });

        if (logs.length === 0) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: `No CreatorPoolCreated event found for pool address ${input.poolAddress} on chain ${input.chainId}. The pool may not have been created through the factory.`,
          });
        }

        const creationTxid = logs[0].transactionHash;

        if (!creationTxid) {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: "Found event but no transaction hash was returned.",
          });
        }

        return {
          creationTxid,
        };
      } catch (error) {
        if (error instanceof TRPCError) throw error;
        console.error("Error fetching creation txid:", error);
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: `Failed to fetch creation txid: ${(error as Error).message}`,
        });
      }
    }),

  /**
   * Synchronizes all on-chain events for a specific pool from its creation block to present.
   *
   * 1. Validates the pool exists and has a creationTxid set.
   * 2. Fetches the creation block via getTransactionReceipt using the saved txid.
   * 3. Fetches the latest block and paginates getLogs (5k blocks per chunk) for both
   *    Stake and Unstake events in parallel.
   * 4. Decodes all events, batch-finds known wallets, and batch-checks already-indexed events.
   * 5. Computes net balance changes per wallet and writes everything in a single DB transaction.
   * 6. Recalculates and saves the pool's revoStaked and fans counts.
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

      // 3. Fetch the latest block to paginate the log queries. RPC providers typically
      //    cap getLogs at ~10k blocks per request, so we split the range into chunks.
      const BLOCK_RANGE = 5_000n;
      let latestBlock: bigint;
      try {
        latestBlock = await publicClient.getBlockNumber();
      } catch (error) {
        console.error("Error fetching latest block number:", error);
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: `Failed to fetch latest block number: ${(error as Error).message}`,
        });
      }
      verboseLog("Fetching events from", creationBlock.toString(), "to", latestBlock.toString());

      const STAKE_EVENT = {
        type: "event" as const,
        name: "Stake" as const,
        inputs: [
          { type: "address" as const, name: "staker", indexed: true as const },
          { type: "address" as const, name: "pool", indexed: true as const },
          { type: "uint256" as const, name: "amount", indexed: false as const },
        ],
      };

      const UNSTAKE_EVENT = {
        type: "event" as const,
        name: "Unstake" as const,
        inputs: [
          { type: "address" as const, name: "unstaker", indexed: true as const },
          { type: "address" as const, name: "pool", indexed: true as const },
          { type: "uint256" as const, name: "amount", indexed: false as const },
        ],
      };

      const stakeLogs: Log[] = [];
      const unstakeLogs: Log[] = [];

      // --- Paginated fetch helper ---
      const fetchLogsPaginated = async (
        eventDef: typeof STAKE_EVENT | typeof UNSTAKE_EVENT,
        label: string
      ): Promise<Log[]> => {
        const logs: Log[] = [];
        let from = creationBlock;

        while (from <= latestBlock) {
          const to = from + BLOCK_RANGE - 1n > latestBlock ? latestBlock : from + BLOCK_RANGE - 1n;
          try {
            const chunk = await publicClient.getLogs({
              address: tokenAddress,
              event: eventDef,
              args: { pool: poolAddress } as any,
              fromBlock: from,
              toBlock: to,
            });
            logs.push(...chunk);
            verboseLog(`  ${label} [${from}-${to}]: ${chunk.length} logs`);
          } catch (error) {
            console.error(`Error fetching ${label} logs [${from}-${to}]:`, error);
            throw new TRPCError({
              code: "INTERNAL_SERVER_ERROR",
              message: `Failed to fetch ${label} logs at block range ${from}-${to}: ${(error as Error).message}`,
            });
          }
          from = to + 1n;
        }
        return logs;
      };

      // 4. Fetch all Stake and Unstake logs in parallel chunks
      try {
        const [stakes, unstakes] = await Promise.all([
          fetchLogsPaginated(STAKE_EVENT, "Stake"),
          fetchLogsPaginated(UNSTAKE_EVENT, "Unstake"),
        ]);
        stakeLogs.push(...stakes);
        unstakeLogs.push(...unstakes);
        verboseLog(`Total: ${stakes.length} Stake, ${unstakes.length} Unstake logs`);
      } catch (error) {
        if (error instanceof TRPCError) throw error;
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: `Failed to fetch events: ${(error as Error).message}`,
        });
      }

      // 5. Initialize summary counters at the top so all code paths are covered
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

        // Count skipped events per type (unknown wallet → can't index)
        for (const e of allEvents) {
          if (!walletByAddress.has(e.address)) {
            if (e.type === "stake") summaryStakesSkipped++;
            else summaryUnstakesSkipped++;
          }
        }

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

            // Write everything in a single transaction.
            // The existence check above is a best-effort optimisation to avoid
            // sending already-known events to the transaction.  As a safety net,
            // createMany uses skipDuplicates so that if two syncPool calls race,
            // duplicate events are silently skipped instead of throwing.
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

              // Batch-create all new StakeEvents (skip duplicates on race)
              await tx.stakeEvent.createMany({
                data: allNew.map(e => ({
                  userWalletId: walletByAddress.get(e.address)!,
                  poolId: pool.id,
                  amount: e.amount.toString(),
                  eventType: e.type,
                  transactionHash: e.txHash,
                })),
                skipDuplicates: true,
              });
            });

            verboseLog(
              `Batch write done: ${allNew.length} events, ${netAmounts.size} stakedPools upserted`
            );
          }
        }
      }

      // 7. Recalculate total fans and revoStaked for the pool
      verboseLog("Recalculating pool aggregation data...");
      const allStakedPools = await prisma.stakedPool.findMany({
        where: { poolId: pool.id },
        select: { stakeAmount: true },
      });

      // Sum the string amounts as BigInt, only counting active stakes
      let totalStakedBigInt = 0n;
      let fansCount = 0;
      for (const sp of allStakedPools) {
        const amount = BigInt(sp.stakeAmount || "0");
        if (amount > 0n) {
          totalStakedBigInt += amount;
          fansCount++;
        }
      }
      const totalStaked = totalStakedBigInt.toString();

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
