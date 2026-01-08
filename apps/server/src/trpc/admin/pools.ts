import { adminProcedure, router } from "../trpc";
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { prisma } from "../../services/DB";
import { createPublicClient, http, decodeEventLog } from "viem";
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
                  onelink: true,
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

        let syncedData: {
          poolId: number;
          amount: bigint;
          userWalletId: number;
        } | null = null;

        let foundEventType: "stake" | "unstake" | null = null;

        console.log("=== Searching for STAKE events ===");
        for (const log of transactionReceipt.logs) {
          try {
            const decodedLog = decodeEventLog({
              abi: L2_BASE_TOKEN_ABI,
              eventName: "Stake",
              data: log.data,
              topics: (log as any).topics,
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

            if (args.staker.toLowerCase() !== transactionSender) {
              console.log("Skipping stake event - staker doesn't match transaction sender");
              continue;
            }

            console.log("Searching for pool in database...");
            const pool = await prisma.creatorPool.findUnique({
              where: { poolAddress: poolAddress },
            });

            if (!pool) {
              throw new TRPCError({
                code: "NOT_FOUND",
                message: `Pool with address ${poolAddress} not found in database`,
              });
            }
            console.log("Pool found:", {
              id: pool.id,
              poolAddress: pool.poolAddress,
              name: pool.name,
            });

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
              select: { stakeAmount: true },
            });

            const existingAmount = BigInt(existingStake?.stakeAmount || "0");
            const newStakeAmount = (existingAmount + amount).toString();
            console.log("Stake calculation:", {
              existingAmount: existingAmount.toString(),
              stakeAmount: amount.toString(),
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
                stakeAmount: amount.toString(),
              },
            });
            console.log("StakedPool upserted successfully");

            console.log("Creating stakeEvent...");
            await prisma.stakeEvent.create({
              data: {
                userWalletId: userWallet.id,
                poolId: pool.id,
                amount: amount.toString(),
                eventType: "stake",
                transactionHash: input.hash,
              },
            });
            console.log("StakeEvent created successfully");

            syncedData = {
              poolId: pool.id,
              amount,
              userWalletId: userWallet.id,
            };
            foundEventType = "stake";
            console.log("=== STAKE event processed successfully ===", syncedData);
          } catch (err) {
            console.error("Error processing STAKE event log:", err);
            if (err instanceof Error) {
              console.error("Error message:", err.message);
              console.error("Error stack:", err.stack);
            }
          }
        }

        if (foundEventType === "stake") {
          console.log("=== Returning STAKE success ===");
          const result = {
            success: true,
            message: "Successfully synced stake transaction",
            synced: {
              poolId: syncedData!.poolId,
              amount: syncedData!.amount.toString(),
              userWalletId: syncedData!.userWalletId,
            },
            eventType: "stake" as const,
          };
          console.log("Response:", result);
          return result;
        }

        console.log("=== No STAKE events found, searching for UNSTAKE events ===");
        for (const log of transactionReceipt.logs) {
          try {
            const decodedLog = decodeEventLog({
              abi: L2_BASE_TOKEN_ABI,
              eventName: "Unstake",
              data: log.data,
              topics: (log as any).topics,
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

            if (args.unstaker.toLowerCase() !== transactionSender) {
              console.log("Skipping unstake event - unstaker doesn't match transaction sender");
              continue;
            }

            console.log("Searching for pool in database...");
            const pool = await prisma.creatorPool.findUnique({
              where: { poolAddress: poolAddress },
            });

            if (!pool) {
              throw new TRPCError({
                code: "NOT_FOUND",
                message: `Pool with address ${poolAddress} not found in database`,
              });
            }
            console.log("Pool found:", {
              id: pool.id,
              poolAddress: pool.poolAddress,
              name: pool.name,
            });

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
              select: { stakeAmount: true },
            });

            const existingAmount = BigInt(existingStake?.stakeAmount || "0");
            console.log("Existing stake:", existingAmount.toString());

            if (existingAmount < amount) {
              throw new TRPCError({
                code: "BAD_REQUEST",
                message: `Unstake amount exceeds current stake. Current stake: ${existingAmount}, Requested unstake: ${amount}`,
              });
            }

            const newStakeAmount = (existingAmount - amount).toString();
            console.log("Unstake calculation:", {
              existingAmount: existingAmount.toString(),
              unstakeAmount: amount.toString(),
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
                stakeAmount: (-amount).toString(),
              },
            });
            console.log("StakedPool upserted successfully");

            console.log("Creating stakeEvent...");
            await prisma.stakeEvent.create({
              data: {
                userWalletId: userWallet.id,
                poolId: pool.id,
                amount: amount.toString(),
                eventType: "unstake",
                transactionHash: input.hash,
              },
            });
            console.log("StakeEvent created successfully");

            syncedData = {
              poolId: pool.id,
              amount,
              userWalletId: userWallet.id,
            };
            foundEventType = "unstake";
            console.log("=== UNSTAKE event processed successfully ===", syncedData);
          } catch (err) {
            console.error("Error processing UNSTAKE event log:", err);
            if (err instanceof Error) {
              console.error("Error message:", err.message);
              console.error("Error stack:", err.stack);
            }
          }
        }

        if (syncedData === null) {
          console.log("=== ERROR: No events found ===");
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "No Stake or Unstake event found in transaction logs",
          });
        }

        console.log("=== Returning UNSTAKE success ===");
        const result = {
          success: true,
          message: `Successfully synced ${foundEventType} transaction`,
          synced: {
            poolId: syncedData.poolId,
            amount: syncedData.amount.toString(),
            userWalletId: syncedData.userWalletId,
          },
          eventType: foundEventType,
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
          console.error("Error:", error.message, error.stack);
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
