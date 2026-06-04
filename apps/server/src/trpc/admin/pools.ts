import { adminProcedure, router } from "../trpc";
import { z } from "zod";
import { TRPCError, tracked } from "@trpc/server";
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
    .subscription(async function* (opts) {
      const poolId = opts.input.poolId;
      const signal = opts.signal;

      // Helper: throws if client disconnected, so we don't waste work
      const checkAborted = () => {
        if (signal?.aborted) {
          throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Client disconnected" });
        }
      };

      const emitProgress = (step: number, phase: string, message: string, extra: Record<string, any> = {}) => ({
        id: `sync-${poolId}-${step}`,
        step,
        phase,
        message,
        percent: extra.percent ?? 0,
        stakesFound: extra.stakesFound ?? 0,
        unstakesFound: extra.unstakesFound ?? 0,
        currentBlock: extra.currentBlock,
        latestBlock: extra.latestBlock,
        stakesProcessed: extra.stakesProcessed ?? 0,
        unstakesProcessed: extra.unstakesProcessed ?? 0,
        stakesSkipped: extra.stakesSkipped ?? 0,
        unstakesSkipped: extra.unstakesSkipped ?? 0,
        stakesAlreadyIndexed: extra.stakesAlreadyIndexed ?? 0,
        unstakesAlreadyIndexed: extra.unstakesAlreadyIndexed ?? 0,
        summary: extra.summary ?? undefined,
      });

      const verboseLog = (...args: unknown[]) => {
        console.info("[syncPool]", ...args);
      };

      verboseLog("=== START ===", { poolId });
      yield tracked(`sync-${poolId}-0`, emitProgress(0, "init", "Finding pool in database..."));

      // 1. Find the pool in DB
      const pool = await prisma.creatorPool.findUnique({
        where: { id: poolId },
      });

      if (!pool) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: `Pool with id ${poolId} not found`,
        });
      }

      if (!pool.poolAddress) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `Pool ${poolId} has no poolAddress set. Sync the pool creation first.`,
        });
      }

      const chain = getChainConfig(parseInt(pool.chainId));

      if (!chain) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `Unsupported chain ID: ${pool.chainId}`,
        });
      }

      yield tracked(`sync-${poolId}-1`, emitProgress(1, "init", `Connecting to blockchain: ${chain.name}...`));

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
          message: `Pool ${poolId} has no creationTxid. Set it first in the admin panel (Actions > Set Tx).`,
        });
      }

      yield tracked(`sync-${poolId}-2`, emitProgress(2, "init", "Fetching creation block from transaction hash..."));

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

      // 3. Fetch the latest block to paginate the log queries.
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

      const totalBlocks = latestBlock - creationBlock + 1n;
      verboseLog("Fetching events from", creationBlock.toString(), "to", latestBlock.toString());

      yield tracked(`sync-${poolId}-3`, emitProgress(3, "init", `Total blocks to scan: ${totalBlocks.toString()} (from ${creationBlock.toString()} to ${latestBlock.toString()})`));

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

      // 4. Fetch Stake and Unstake logs in parallel (both events on the same block range)
      checkAborted();
      yield tracked(
        `sync-${poolId}-scan-start`,
        emitProgress(10, "scanning", `Scanning Stake & Unstake events in parallel (${totalBlocks.toString()} blocks)...`, {
          percent: 5,
          currentBlock: creationBlock.toString(),
          latestBlock: latestBlock.toString(),
        })
      );

      // Paginated fetch helper (no yield inside — called from Promise.all)
      const fetchLogsPaginated = async (
        eventDef: typeof STAKE_EVENT | typeof UNSTAKE_EVENT,
        label: string
      ): Promise<Log[]> => {
        const logs: Log[] = [];
        let from = creationBlock;

        while (from <= latestBlock) {
          checkAborted();
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

      // 5. Initialize summary counters
      let summaryStakesProcessed = 0;
      let summaryStakesSkipped = 0;
      let summaryUnstakesProcessed = 0;
      let summaryUnstakesSkipped = 0;

      yield tracked(`sync-${poolId}-100`, emitProgress(100, "processing", `Decoding ${stakeLogs.length + unstakeLogs.length} events...`, {
        percent: 100,
        stakesFound: stakeLogs.length,
        unstakesFound: unstakeLogs.length,
      }));

      // 6. Decode all events
      interface ParsedEvent {
        address: string;
        amount: bigint;
        txHash: string;
        blockNumber: bigint;
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
            blockNumber: log.blockNumber!,
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
            blockNumber: log.blockNumber!,
            type: "unstake",
          });
        } catch (error) {
          console.error("Error decoding Unstake log:", error);
        }
      }

      verboseLog(`Decoded ${allEvents.length} total stake/unstake events`);

      // Fetch block timestamps for all unique block numbers
      const blockTimestamps = new Map<bigint, Date>();
      if (allEvents.length > 0) {
        const uniqueBlockNumbers = [...new Set(allEvents.map(e => e.blockNumber))];
        verboseLog(`Fetching timestamps for ${uniqueBlockNumbers.length} unique blocks...`);

        const BATCH_SIZE = 50;
        for (let i = 0; i < uniqueBlockNumbers.length; i += BATCH_SIZE) {
          checkAborted();
          const batch = uniqueBlockNumbers.slice(i, i + BATCH_SIZE);
          const blocks = await Promise.all(
            batch.map(bn => publicClient.getBlock({ blockNumber: bn }))
          );
          for (const block of blocks) {
            blockTimestamps.set(block.number!, new Date(Number(block.timestamp) * 1000));
          }
        }
        verboseLog(`Block timestamps fetched: ${blockTimestamps.size} blocks`);
      }

      // Declare variables used for summary
      let knownEvents: ParsedEvent[] = [];
      let totalStaked = "0";
      let fansCount = 0;
      let zeroBalanceCount = 0;
      let totalNewStakeAmount = 0n;
      let totalNewUnstakeAmount = 0n;
      let uniqueOnChainAddresses = new Set<string>();
      let uniqueKnownAddresses = new Set<string>();
      let unknownAddressCount = 0;

      // 7. Look up wallets, compute net amounts, then replace everything in a single transaction
      if (allEvents.length > 0) {
        yield tracked(`sync-${poolId}-200`, emitProgress(200, "processing", `Looking up ${allEvents.length} wallets in database...`, {
          percent: 100,
          stakesFound: stakeLogs.length,
          unstakesFound: unstakeLogs.length,
        }));

        // --- Batch-find all wallets ---
        const uniqueAddresses = [...new Set(allEvents.map(e => e.address))];
        const wallets = await prisma.userWallet.findMany({
          where: { address: { in: uniqueAddresses } },
          select: { id: true, address: true },
        });
        const walletByAddress = new Map(wallets.map(w => [w.address, w.id]));

        // Filter events to only those with known wallets
        knownEvents = allEvents.filter(e => walletByAddress.has(e.address));

        // Count skipped events per type (unknown wallet → can't index)
        for (const e of allEvents) {
          if (!walletByAddress.has(e.address)) {
            if (e.type === "stake") summaryStakesSkipped++;
            else summaryUnstakesSkipped++;
          }
        }

        summaryStakesProcessed = knownEvents.filter(e => e.type === "stake").length;
        summaryUnstakesProcessed = knownEvents.filter(e => e.type === "unstake").length;

        yield tracked(`sync-${poolId}-300`, emitProgress(300, "processing", `Found ${wallets.length} known wallets, computing net stakes...`, {
          percent: 100,
          stakesFound: stakeLogs.length,
          unstakesFound: unstakeLogs.length,
          stakesProcessed: summaryStakesProcessed,
          unstakesProcessed: summaryUnstakesProcessed,
          stakesSkipped: summaryStakesSkipped,
          unstakesSkipped: summaryUnstakesSkipped,
        }));

        if (knownEvents.length > 0) {
          // Compute net amount per wallet from ALL known events
          const netAmounts = new Map<number, bigint>();
          for (const e of knownEvents) {
            const wid = walletByAddress.get(e.address)!;
            const delta = e.type === "stake" ? e.amount : -e.amount;
            netAmounts.set(wid, (netAmounts.get(wid) || 0n) + delta);
            if (e.type === "stake") totalNewStakeAmount += e.amount;
            else totalNewUnstakeAmount += e.amount;
          }

          // Count fans and total staked from net amounts
          let totalStakedBigInt = 0n;
          for (const [, netAmount] of netAmounts) {
            if (netAmount > 0n) {
              totalStakedBigInt += netAmount;
              fansCount++;
            }
          }
          totalStaked = totalStakedBigInt.toString();
          zeroBalanceCount = 0;

          checkAborted();
          yield tracked(`sync-${poolId}-400`, emitProgress(400, "writing", `Replacing all ${knownEvents.length} events in a single transaction...`, {
            percent: 100,
            stakesFound: stakeLogs.length,
            unstakesFound: unstakeLogs.length,
            stakesProcessed: summaryStakesProcessed,
            unstakesProcessed: summaryUnstakesProcessed,
            stakesSkipped: summaryStakesSkipped,
            unstakesSkipped: summaryUnstakesSkipped,
          }));

          // SINGLE TRANSACTION: delete all existing records, then insert fresh
          await prisma.$transaction(async (tx) => {
            // Delete all stake events for this pool
            await tx.stakeEvent.deleteMany({
              where: { poolId: pool.id },
            });

            // Delete all staked pools for this pool
            await tx.stakedPool.deleteMany({
              where: { poolId: pool.id },
            });

            // Insert all stake events (known wallets only)
            await tx.stakeEvent.createMany({
              data: knownEvents.map(e => ({
                userWalletId: walletByAddress.get(e.address)!,
                poolId: pool.id,
                amount: e.amount.toString(),
                eventType: e.type,
                transactionHash: e.txHash,
                createdAt: blockTimestamps.get(e.blockNumber) ?? new Date(),
              })),
            });

            // Insert staked pools for wallets with positive net amount
            const stakedPoolRows: { userWalletId: number; poolId: number; stakeAmount: string }[] = [];
            for (const [walletId, netAmount] of netAmounts) {
              if (netAmount > 0n) {
                stakedPoolRows.push({
                  userWalletId: walletId,
                  poolId: pool.id,
                  stakeAmount: netAmount.toString(),
                });
              }
            }

            if (stakedPoolRows.length > 0) {
              await tx.stakedPool.createMany({
                data: stakedPoolRows,
              });
            }
          });

          verboseLog(
            `Transaction complete: ${knownEvents.length} events inserted, ${fansCount} stakedPools created`
          );
        } else {
          // No known wallets — still clean up existing data for this pool
          totalStaked = "0";
          fansCount = 0;
          zeroBalanceCount = 0;

          await prisma.$transaction(async (tx) => {
            await tx.stakeEvent.deleteMany({ where: { poolId: pool.id } });
            await tx.stakedPool.deleteMany({ where: { poolId: pool.id } });
          });

          verboseLog("No known wallets — existing pool data cleared");
        }

        // Count unique addresses for summary
        uniqueOnChainAddresses = new Set(allEvents.map(e => e.address));
        uniqueKnownAddresses = new Set(knownEvents.map(e => e.address));
        unknownAddressCount = uniqueOnChainAddresses.size - uniqueKnownAddresses.size;
      } else {
        // No on-chain events found — clean up existing data to stay consistent
        await prisma.$transaction(async (tx) => {
          await tx.stakeEvent.deleteMany({ where: { poolId: pool.id } });
          await tx.stakedPool.deleteMany({ where: { poolId: pool.id } });
        });
        verboseLog("No on-chain events found — existing pool data cleared");
      }

      // 8. Update pool totals
      yield tracked(`sync-${poolId}-500`, emitProgress(500, "finalizing", "Updating pool totals...", {
        percent: 100,
        stakesProcessed: summaryStakesProcessed,
        unstakesProcessed: summaryUnstakesProcessed,
        stakesSkipped: summaryStakesSkipped,
        unstakesSkipped: summaryUnstakesSkipped,
      }));

      await prisma.creatorPool.update({
        where: { id: pool.id },
        data: {
          revoStaked: totalStaked,
          fans: fansCount,
        },
      });

      verboseLog("=== END ===");
      verboseLog(`Final state: ${fansCount} active fans, ${zeroBalanceCount} zero-balance records, ${totalStaked} total REVO staked`);
      verboseLog(`On-chain: ${uniqueOnChainAddresses.size} unique addresses, ${uniqueKnownAddresses.size} known, ${unknownAddressCount} unknown`);

      // Detailed console log for admin visibility
      console.log("============================================");
      console.log("           SYNC POOL SUMMARY                 ");
      console.log("============================================");
      console.log("");
      console.log("--- POOL INFO ---");
      console.log(`Pool ID:            ${poolId}`);
      console.log(`Pool Address:       ${poolAddress}`);
      console.log(`Chain:              ${chain.name} (${pool.chainId})`);
      console.log(`Creation TxID:      ${pool.creationTxid}`);
      console.log("");
      console.log("--- SYNC SCOPE ---");
      console.log(`Creation Block:     ${creationBlock.toString()}`);
      console.log(`Latest Block:       ${latestBlock.toString()}`);
      console.log(`Blocks Scanned:     ${totalBlocks.toString()}`);
      console.log(`Block Range Chunk:  ${BLOCK_RANGE}`);
      console.log("");
      console.log("--- ON-CHAIN EVENTS ---");
      console.log(`Total events found: ${allEvents.length}`);
      console.log(`  Stake events:     ${stakeLogs.length}`);
      console.log(`  Unstake events:   ${unstakeLogs.length}`);
      console.log(`Unique addresses:   ${uniqueOnChainAddresses.size}`);
      console.log("");
      console.log("--- PROCESSING RESULTS ---");
      console.log(`Known wallets:       ${uniqueKnownAddresses.size}`);
      console.log(`Unknown wallets:     ${unknownAddressCount}`);
      console.log(`  → These ${unknownAddressCount} addresses are NOT registered in amped.bio`);
      console.log(`  → Their stakes are SKIPPED and won't appear in wallet views`);
      console.log(`  → They will appear once they connect their wallet to amped.bio`);
      console.log(`New stakes indexed:   ${summaryStakesProcessed} (${totalNewStakeAmount.toString()} REVO)`);
      console.log(`New unstakes indexed: ${summaryUnstakesProcessed} (${totalNewUnstakeAmount.toString()} REVO)`);
      console.log(`Skipped (unknown):    ${summaryStakesSkipped + summaryUnstakesSkipped}`);
      console.log("");
      console.log("--- DATABASE FINAL STATE ---");
      console.log(`Active fans:          ${fansCount}`);
      console.log(`Zero-balance records: ${zeroBalanceCount}`);
      console.log(`Total REVO staked:    ${totalStaked}`);
      console.log("");
      console.log("============================================");

      const scope = {
        chainName: chain.name,
        chainId: pool.chainId,
        creationTxid: pool.creationTxid,
        creationBlock: creationBlock.toString(),
        latestBlock: latestBlock.toString(),
        totalBlocks: totalBlocks.toString(),
        blockRange: Number(BLOCK_RANGE),
      };

      yield tracked(`sync-${poolId}-999`, emitProgress(999, "complete", `Sync completed! Total: ${totalStaked} REVO staked by ${fansCount} fans`, {
        percent: 100,
        stakesProcessed: summaryStakesProcessed,
        unstakesProcessed: summaryUnstakesProcessed,
        stakesSkipped: summaryStakesSkipped,
        unstakesSkipped: summaryUnstakesSkipped,
        summary: {
          stakes: {
            processed: summaryStakesProcessed,
            skipped: summaryStakesSkipped,
            alreadyIndexed: 0,
          },
          unstakes: {
            processed: summaryUnstakesProcessed,
            skipped: summaryUnstakesSkipped,
            alreadyIndexed: 0,
          },
          totalStaked,
          fansCount,
          totalOnChainEvents: allEvents.length,
          uniqueOnChainAddresses: uniqueOnChainAddresses.size,
          unknownAddressCount,
          zeroBalanceCount,
          totalNewStakeAmount: totalNewStakeAmount.toString(),
          totalNewUnstakeAmount: totalNewUnstakeAmount.toString(),
          scope,
        },
      }));
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
