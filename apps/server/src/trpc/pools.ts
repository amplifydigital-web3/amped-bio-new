import { privateProcedure, publicProcedure, router } from "./trpc";
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { prisma } from "../services/DB";
import { Address, createPublicClient, http, zeroAddress, decodeEventLog } from "viem";
import { getChainConfig, CREATOR_POOL_FACTORY_ABI, L2_BASE_TOKEN_ABI } from "@ampedbio/web3";
import { ALLOWED_POOL_IMAGE_FILE_EXTENSIONS, ALLOWED_POOL_IMAGE } from "@ampedbio/constants";
import { env } from "../env";
import { s3Service } from "../services/S3Service";
import { uploadedFileService } from "../services/UploadedFileService";

const requestPoolImagePresignedUrlSchema = z.object({
  contentType: z.string().refine(value => ALLOWED_POOL_IMAGE.includes(value), {
    message: `Only ${ALLOWED_POOL_IMAGE_FILE_EXTENSIONS.join(", ").toUpperCase()} formats are supported`,
  }),
  fileExtension: z
    .string()
    .refine(value => ALLOWED_POOL_IMAGE_FILE_EXTENSIONS.includes(value.toLowerCase()), {
      message: `File extension must be ${ALLOWED_POOL_IMAGE_FILE_EXTENSIONS.join(", ")}`,
    }),
  fileSize: z.number().max(env.UPLOAD_LIMIT_POOL_IMAGE_MB * 1024 * 1024, {
    message: `File size must be less than ${env.UPLOAD_LIMIT_POOL_IMAGE_MB}MB`,
  }),
});

const confirmPoolImageUploadSchema = z.object({
  fileId: z.number().positive(),
  fileName: z.string().min(1),
});

export const poolsRouter = router({
  getPool: privateProcedure
    .input(
      z.object({
        chainId: z.string(), // Now required and string type for large chain IDs
      })
    )
    .query(async ({ ctx, input }) => {
      const userId = ctx.user.sub;

      try {
        const wallet = await prisma.userWallet.findUnique({
          where: { userId },
        });

        if (!wallet) {
          throw new TRPCError({
            code: "PRECONDITION_FAILED",
            message: "User does not have a wallet",
          });
        }

        // Find the pool for this wallet and chain
        const pool = await prisma.creatorPool.findUnique({
          where: {
            walletId_chainId: {
              walletId: wallet.id,
              chainId: input.chainId,
            },
          },
          include: {
            poolImage: {
              select: {
                s3_key: true,
                bucket: true,
              },
            },
          },
        });

        if (!pool) {
          return null;
        }

        // Construct the image URL from the s3_key if available
        const imageUrl = pool.poolImage ? s3Service.getFileUrl(pool.poolImage.s3_key) : null;

        // Return the pool data with additional image URL if available
        return {
          ...pool,
          imageUrl: imageUrl,
        };
      } catch (error) {
        console.error("Error fetching pool:", error);
        if (error instanceof TRPCError) throw error;
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to fetch pool",
        });
      }
    }),

  create: privateProcedure
    .input(
      z.object({
        description: z.string().optional(),
        chainId: z.string(), // Now required and string type for large chain IDs
      })
    )
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.user.sub;

      const wallet = await prisma.userWallet.findUnique({
        where: { userId },
      });

      if (!wallet) {
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

      try {
        const wallet = await prisma.userWallet.findUnique({
          where: { userId },
        });

        if (!wallet) {
          throw new TRPCError({
            code: "PRECONDITION_FAILED",
            message: "User does not have a wallet",
          });
        }

        // First, try to find an existing pool for this wallet and chain
        let pool = await prisma.creatorPool.findUnique({
          where: {
            walletId_chainId: {
              walletId: wallet.id,
              chainId: input.chainId,
            },
          },
        });

        console.info("Checked for existing pool in database:", pool);

        // If a pool exists but doesn't have an address, return it
        if (pool && !pool.poolAddress) {
          return pool;
        }

        // If a pool exists with an address, check if it still exists on-chain
        if (pool && pool.poolAddress) {
          try {
            // Check if the pool address in our DB actually exists as a valid contract on-chain
            const codeAtAddress = await publicClient.getCode({
              address: pool.poolAddress as `0x${string}`,
            });

            // If there's no code at the address, the pool contract doesn't exist
            if (codeAtAddress === "0x") {
              // The pool in our database doesn't exist on-chain anymore, clear the address
              console.info(
                `Clearing pool address ${pool.poolAddress} that no longer exists on-chain for user ${userId} and chain ${input.chainId}`
              );
              pool = await prisma.creatorPool.update({
                where: { id: pool.id },
                data: { poolAddress: null },
              });
              return pool;
            } else {
              // The contract still exists at the address, return conflict error as before
              throw new TRPCError({
                code: "CONFLICT",
                message: "Pool already exists for this chain",
              });
            }
          } catch (verificationError) {
            // If we get an error when trying to verify the contract, just return the error
            // Don't assume the pool doesn't exist and remove the address
            console.error(`Error verifying pool contract at stored address: ${verificationError}`);
            throw new TRPCError({
              code: "INTERNAL_SERVER_ERROR",
              message: "Failed to verify pool on blockchain. Please try again later.",
            });
          }
        }

        // If no pool exists, create a new one
        if (!pool) {
          pool = await prisma.creatorPool.create({
            data: {
              description: input.description,
              chainId: input.chainId,
              wallet: {
                connect: {
                  id: wallet.id,
                },
              },
            },
          });
        }

        return pool;
      } catch (error) {
        console.error("Error creating/getting pool:", error);
        if (error instanceof TRPCError) throw error;
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to create/get pool",
        });
      }
    }),

  confirmPoolCreation: privateProcedure
    .input(
      z.object({
        // poolAddress: z.string(),
        chainId: z.string(), // Changed to string for large chain IDs
      })
    )
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.user.sub;

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

      const poolAddress = (await publicClient.readContract({
        address: chain.contracts.CREATOR_POOL_FACTORY.address,
        abi: CREATOR_POOL_FACTORY_ABI,
        functionName: "getPoolForCreator",
        args: [userWallet!.address as `0x${string}`],
      })) as Address;

      console.info("Fetched pool address from chain:", poolAddress);

      if (zeroAddress === poolAddress) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "No pool found for creator on-chain",
        });
      }

      // Find the wallet for the user
      const wallet = await prisma.userWallet.findUnique({
        where: { userId },
      });

      if (!wallet) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: "User does not have a wallet",
        });
      }

      let pool = await prisma.creatorPool.findUnique({
        where: {
          walletId_chainId: {
            walletId: wallet.id,
            chainId: input.chainId,
          },
        },
      });

      if (pool !== null) {
        await prisma.creatorPool.update({
          where: { id: pool.id },
          data: { poolAddress },
        });
        return { id: pool.id };
      } else {
        pool = await prisma.creatorPool.create({
          data: {
            chainId: input.chainId,
            poolAddress,
            wallet: {
              connect: {
                id: wallet.id,
              },
            },
          },
        });
        return { id: pool.id };
      }
    }),

  deletePoolOnError: privateProcedure
    .input(
      z.object({
        chainId: z.string(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.user.sub;

      // Find the wallet for the user
      const wallet = await prisma.userWallet.findUnique({
        where: { userId },
      });

      if (!wallet) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: "User does not have a wallet",
        });
      }

      try {
        // Find and delete the pool for this specific wallet and chain
        const pool = await prisma.creatorPool.delete({
          where: {
            walletId_chainId: {
              walletId: wallet.id,
              chainId: input.chainId,
            },
          },
        });

        return { id: pool.id, deleted: true };
      } catch (error) {
        console.error("Error deleting pool:", error);
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to delete pool",
        });
      }
    }),

  setImageForPool: privateProcedure
    .input(
      z.object({
        id: z.number(),
        image_file_id: z.number(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.user.sub;

      try {
        const wallet = await prisma.userWallet.findUnique({
          where: { userId },
        });

        if (!wallet) {
          throw new TRPCError({
            code: "PRECONDITION_FAILED",
            message: "User does not have a wallet",
          });
        }

        // First, find the pool to make sure it belongs to this wallet
        const pool = await prisma.creatorPool.findUnique({
          where: { id: input.id },
        });

        if (!pool || pool.walletId !== wallet.id) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Pool not found",
          });
        }

        const updatedPool = await prisma.creatorPool.update({
          where: { id: input.id },
          data: {
            image_file_id: input.image_file_id,
          },
        });
        return updatedPool;
      } catch (error) {
        console.error("Error setting pool image:", error);
        if (error instanceof TRPCError) throw error;
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to set pool image",
        });
      }
    }),

  requestPoolImagePresignedUrl: privateProcedure
    .input(requestPoolImagePresignedUrlSchema)
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.user.sub;

      try {
        if (input.fileSize > env.UPLOAD_LIMIT_POOL_IMAGE_MB * 1024 * 1024) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: `File size exceeds the ${env.UPLOAD_LIMIT_POOL_IMAGE_MB}MB limit`,
          });
        }

        const { presignedUrl, fileKey } = await s3Service.getPresignedUploadUrl(
          "pool-images",
          userId,
          input.contentType,
          input.fileExtension
        );

        const uploadedFile = await uploadedFileService.createUploadedFile({
          s3Key: fileKey,
          bucket: process.env.AWS_S3_BUCKET_NAME || "default-bucket",
          fileName: `pool-image_${Date.now()}.${input.fileExtension}`,
          fileType: input.contentType,
          size: input.fileSize,
          userId: userId,
        });

        return {
          presignedUrl,
          fileId: uploadedFile.id,
          expiresIn: 300,
        };
      } catch (error: any) {
        console.error("Error generating presigned URL for pool image:", error);
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: `Failed to generate upload URL: ${error.message || error}`,
        });
      }
    }),

  confirmPoolImageUpload: privateProcedure
    .input(confirmPoolImageUploadSchema)
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.user.sub;

      try {
        const uploadedFile = await uploadedFileService.getFileById(input.fileId);
        if (!uploadedFile || uploadedFile.user_id !== userId) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "File record not found or access denied.",
          });
        }

        const fileKey = uploadedFile.s3_key;
        const bucket = uploadedFile.bucket;

        const fileExists = await s3Service.fileExists({ fileKey, bucket });
        if (!fileExists) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "File not found in S3. Please upload the file first.",
          });
        }

        await uploadedFileService.updateFileStatus({
          id: input.fileId,
          status: "COMPLETED",
        });

        await prisma.uploadedFile.update({
          where: { id: input.fileId },
          data: {
            file_name: input.fileName,
            updated_at: new Date(),
          },
        });

        const poolImageUrl = s3Service.getFileUrl(fileKey);

        return {
          success: true,
          poolImageUrl,
          fileId: input.fileId,
        };
      } catch (error) {
        console.error("Error updating pool image:", error);
        if (error instanceof TRPCError) {
          throw error;
        }
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to update pool image",
        });
      }
    }),

  getPools: publicProcedure
    .input(
      z.object({
        search: z.string().optional(),
      })
    )
    .query(async ({ input }) => {
      try {
        const whereClause: any = {};
        if (input.search) {
          whereClause.OR = [
            { description: { contains: input.search, mode: "insensitive" } },
            { title: { contains: input.search, mode: "insensitive" } },
          ];
        }

        const pools = await prisma.creatorPool.findMany({
          where: whereClause,
          include: {
            poolImage: {
              select: {
                s3_key: true,
                bucket: true,
              },
            },
          },
        });

        return pools.map(pool => ({
          ...pool,
          imageUrl: pool.poolImage ? s3Service.getFileUrl(pool.poolImage.s3_key) : null,
          title: pool.description || `Pool ${pool.id}`, // Placeholder for title
          totalReward: 0, // Placeholder
          currency: "REVO", // Placeholder
          participants: 0, // Placeholder
          maxParticipants: 100, // Placeholder
          endDate: new Date().toISOString(), // Placeholder
          status: "active", // Placeholder
          category: "staking", // Placeholder
          createdBy: "Unknown", // Placeholder
          stakedAmount: 0, // Placeholder
          stakeCurrency: "REVO", // Placeholder
          rewardCurrency: "REVO", // Placeholder
          earnedRewards: 0, // Placeholder
          estimatedRewards: 0, // Placeholder
        }));
      } catch (error) {
        console.error("Error fetching pools:", error);
        if (error instanceof TRPCError) throw error;
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to fetch pools",
        });
      }
    }),

  updateDescription: privateProcedure
    .input(
      z.object({
        chainId: z.string(),
        description: z.string().min(1).max(500), // Description between 1 and 500 characters
      })
    )
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.user.sub;

      try {
        const wallet = await prisma.userWallet.findUnique({
          where: { userId },
        });

        if (!wallet) {
          throw new TRPCError({
            code: "PRECONDITION_FAILED",
            message: "User does not have a wallet",
          });
        }

        // Find the pool for this wallet and chain
        const pool = await prisma.creatorPool.findUnique({
          where: {
            walletId_chainId: {
              walletId: wallet.id,
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

        // Update the pool description
        const updatedPool = await prisma.creatorPool.update({
          where: { id: pool.id },
          data: {
            description: input.description,
          },
        });

        return {
          ...updatedPool,
          message: "Pool description updated successfully",
        };
      } catch (error) {
        console.error("Error updating pool description:", error);
        if (error instanceof TRPCError) throw error;
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to update pool description",
        });
      }
    }),

  addStake: privateProcedure
    .input(
      z.object({
        chainId: z.string(),
        amount: z.string().transform(val => BigInt(val)), // Accept as string and convert to BigInt
      })
    )
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.user.sub;

      try {
        // Get the user's wallet
        const userWallet = await prisma.userWallet.findUnique({
          where: { userId },
        });

        if (!userWallet) {
          throw new TRPCError({
            code: "PRECONDITION_FAILED",
            message: "User does not have a wallet",
          });
        }

        // Get the pool for this wallet and chain
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

        // Create or update the stake record
        const stakedPool = await prisma.stakedPool.upsert({
          where: {
            userWalletId_poolId: {
              userWalletId: userWallet.id,
              poolId: pool.id,
            },
          },
          update: {
            stakeAmount: {
              increment: input.amount,
            },
            updatedAt: new Date(),
          },
          create: {
            userWalletId: userWallet.id,
            poolId: pool.id,
            stakeAmount: input.amount,
          },
        });

        return {
          success: true,
          userWalletId: userWallet.id,
          poolId: pool.id,
          newStakeAmount: stakedPool.stakeAmount.toString(),
          message: "Stake added successfully",
        };
      } catch (error) {
        console.error("Error adding stake:", error);
        if (error instanceof TRPCError) throw error;
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to add stake",
        });
      }
    }),

  removeStake: privateProcedure
    .input(
      z.object({
        chainId: z.string(),
        amount: z.string().transform(val => BigInt(val)), // Accept as string and convert to BigInt
      })
    )
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.user.sub;

      try {
        // Get the user's wallet
        const userWallet = await prisma.userWallet.findUnique({
          where: { userId },
        });

        if (!userWallet) {
          throw new TRPCError({
            code: "PRECONDITION_FAILED",
            message: "User does not have a wallet",
          });
        }

        // Get the pool for this wallet and chain
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

        // Check if the staked pool record exists
        const stakedPool = await prisma.stakedPool.findUnique({
          where: {
            userWalletId_poolId: {
              userWalletId: userWallet.id,
              poolId: pool.id,
            },
          },
        });

        if (!stakedPool) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "No stake record found for this pool",
          });
        }

        if (stakedPool.stakeAmount < input.amount) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: `Cannot remove stake of ${input.amount}, current stake is only ${stakedPool.stakeAmount}`,
          });
        }

        // Update the stake record
        const updatedStakedPool = await prisma.stakedPool.update({
          where: {
            userWalletId_poolId: {
              userWalletId: userWallet.id,
              poolId: pool.id,
            },
          },
          data: {
            stakeAmount: {
              decrement: input.amount,
            },
            updatedAt: new Date(),
          },
        });

        // If the stake amount becomes 0, delete the record
        let deleted = false;
        if (updatedStakedPool.stakeAmount === 0n) {
          await prisma.stakedPool.delete({
            where: {
              userWalletId_poolId: {
                userWalletId: userWallet.id,
                poolId: pool.id,
              },
            },
          });
          deleted = true;
        }

        return {
          success: true,
          userWalletId: userWallet.id,
          poolId: pool.id,
          remainingStakeAmount: updatedStakedPool.stakeAmount.toString(),
          deleted,
          message: deleted ? "All stake removed and record deleted" : "Stake removed successfully",
        };
      } catch (error) {
        console.error("Error removing stake:", error);
        if (error instanceof TRPCError) throw error;
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to remove stake",
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
        // Get the user's wallet
        const userWallet = await prisma.userWallet.findUnique({
          where: { userId },
        });

        if (!userWallet) {
          throw new TRPCError({
            code: "PRECONDITION_FAILED",
            message: "User does not have a wallet",
          });
        }

        // Get the pool for this wallet and chain
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

        // Get the stake amount for this user's wallet in this pool
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
          stakeAmount: stakedPool?.stakeAmount?.toString() || "0",
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

  getUserStakes: privateProcedure.query(async ({ ctx }) => {
    const userId = ctx.user.sub;

    try {
      // Get the user's wallet
      const userWallet = await prisma.userWallet.findUnique({
        where: { userId },
      });

      if (!userWallet) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: "User does not have a wallet",
        });
      }

      // Get all stakes for this user's wallet
      const userStakes = await prisma.stakedPool.findMany({
        where: {
          userWalletId: userWallet.id,
        },
        include: {
          pool: true,
        },
      });

      return userStakes.map(stake => ({
        userWalletId: stake.userWalletId,
        poolId: stake.poolId,
        poolChainId: stake.pool.chainId,
        stakeAmount: stake.stakeAmount.toString(),
        createdAt: stake.createdAt,
        updatedAt: stake.updatedAt,
      }));
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
        // Get the user's wallet
        const userWallet = await prisma.userWallet.findUnique({
          where: { userId },
        });

        if (!userWallet) {
          throw new TRPCError({
            code: "PRECONDITION_FAILED",
            message: "User does not have a wallet",
          });
        }

        // Validate the chain
        const chain = getChainConfig(parseInt(input.chainId));

        if (!chain) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Unsupported chain ID",
          });
        }

        // Create a public client to interact with the blockchain
        const publicClient = createPublicClient({
          chain: chain,
          transport: http(),
        });

        // Get transaction receipt to parse logs
        const transactionReceipt = await publicClient.getTransactionReceipt({
          hash: input.hash as `0x${string}`,
        });

        if (!transactionReceipt) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Transaction not found or not confirmed on the blockchain",
          });
        }

        // Process all logs to find Stake events
        const parsedStakes: { delegator: Address; delegatee: Address; amount: bigint }[] = [];
        for (const log of transactionReceipt.logs) {
          try {
            // Attempt to decode the event log using the ABI
            const decodedLog = decodeEventLog({
              abi: L2_BASE_TOKEN_ABI,
              eventName: "Stake",
              data: log.data,
              topics: log.topics,
            });

            // Extract the values from the decoded log
            // The decoded args format might vary, so we'll use type assertion carefully
            const args = decodedLog.args as any; // Using any temporarily until we confirm the ABI structure

            // Based on the error message, it seems the actual decoded args have 'from', 'to', and 'amount'
            // Let's assume 'from' is the delegator and 'to' is the delegatee (pool address)
            parsedStakes.push({
              delegator: args.from || (args.delegator as Address),
              delegatee: args.to || (args.delegatee as Address),
              amount: args.amount as bigint,
            });
          } catch (error) {
            // Skip logs that don't match the Stake event signature
            continue;
          }
        }

        if (parsedStakes.length === 0) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "No Stake event found in transaction logs",
          });
        }

        // For each parsed stake, update the database
        for (const stake of parsedStakes) {
          // Find the pool based on the delegatee address
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

          // Validate that the transaction sender matches the delegator in the event
          if (transactionReceipt.from.toLowerCase() !== stake.delegator.toLowerCase()) {
            throw new TRPCError({
              code: "BAD_REQUEST",
              message: `Transaction sender does not match the delegator in the stake event (${transactionReceipt.from} vs ${stake.delegator})`,
            });
          }

          // Validate that the pool belongs to the correct user wallet and chain
          if (pool.walletId !== userWallet.id || pool.chainId !== input.chainId) {
            throw new TRPCError({
              code: "FORBIDDEN",
              message:
                "Stake event is for a pool that does not belong to the current user or chain",
            });
          }

          // Create or update the stake record in the database
          await prisma.stakedPool.upsert({
            where: {
              userWalletId_poolId: {
                userWalletId: userWallet.id,
                poolId: pool.id,
              },
            },
            update: {
              stakeAmount: {
                increment: stake.amount,
              },
              updatedAt: new Date(),
            },
            create: {
              userWalletId: userWallet.id,
              poolId: pool.id,
              stakeAmount: stake.amount,
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
});
