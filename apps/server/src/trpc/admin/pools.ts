import { adminProcedure, router } from "../trpc";
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { prisma } from "../../services/DB";
import { createPublicClient, http, decodeEventLog, type Address } from "viem";
import { getChainConfig, L2_BASE_TOKEN_ABI } from "@ampedbio/web3";

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
