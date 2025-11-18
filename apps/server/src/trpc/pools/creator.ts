import { privateProcedure, publicProcedure, router } from "../trpc";
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { prisma } from "../../services/DB";
import { Address, createPublicClient, http, zeroAddress } from "viem";
import { getChainConfig, CREATOR_POOL_FACTORY_ABI } from "@ampedbio/web3";
import { ALLOWED_POOL_IMAGE_FILE_EXTENSIONS, ALLOWED_POOL_IMAGE } from "@ampedbio/constants";
import { env } from "../../env";
import { s3Service } from "../../services/S3Service";
import { uploadedFileService } from "../../services/UploadedFileService";

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

export const poolsCreatorRouter = router({
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
            wallet: {
              select: {
                userId: true,
                address: true,
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
          userId: pool.wallet.userId, // Include the actual user ID
          creatorAddress: pool.wallet.address, // Include the creator's wallet address
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

  updateDescription: privateProcedure
    .input(
      z.object({
        chainId: z.string(),
        description: z.string().min(1).max(500),
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

  getPoolDashboard: publicProcedure
    .input(
      z.object({
        poolId: z.number(),
      })
    )
    .query(async ({ input }) => {
      const { poolId } = input;

      try {
        // Total Stake
        const stakeEvents = await prisma.stakeEvent.findMany({
          where: { poolId },
        });

        const totalStake = stakeEvents.reduce((acc, event) => {
          if (event.eventType === "stake") {
            return acc + event.amount;
          } else {
            return acc - event.amount;
          }
        }, 0n);

        // Count only users with an active stake in the pool using StakedPool
        const totalActiveFans = await prisma.stakedPool.count({
          where: {
            poolId: poolId,
            stakeAmount: {
              gt: 0n, // Only count pools with stakeAmount greater than 0
            },
          },
        });

        // Top Fans - get from StakedPool to ensure consistency with active stakes
        const stakedPools = await prisma.stakedPool.findMany({
          where: {
            poolId: poolId,
          },
          include: {
            userWallet: {
              include: {
                user: {
                  include: {
                    profileImage: true,
                  },
                },
              },
            },
          },
        });

        // Sort staked pools by stake amount descending
        stakedPools.sort((a, b) => (a.stakeAmount > b.stakeAmount ? -1 : 1));

        // Get top 10 for later use
        const topStakedPools = stakedPools
          .filter(stakedPool => stakedPool.stakeAmount > 0n) // Only include users with positive stake
          .slice(0, 10); // Get top 10

        // Map sorted staked pools to top fans format
        const topFans = topStakedPools.map(stakedPool => {
          return {
            onelink: stakedPool.userWallet.user?.onelink || stakedPool.userWallet.address,
            amount: stakedPool.stakeAmount.toString(),
            avatar: stakedPool.userWallet.user?.profileImage
              ? s3Service.getFileUrl(stakedPool.userWallet.user.profileImage.s3_key)
              : null,
          };
        });

        // Recent Activity
        const recentActivity = await prisma.stakeEvent.findMany({
          where: { poolId },
          orderBy: {
            createdAt: "desc",
          },
          take: 10,
          include: {
            userWallet: {
              include: {
                user: {
                  include: {
                    profileImage: true,
                  },
                },
              },
            },
          },
        });

        const now = new Date();
        const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
        const startOfWeek = new Date(now.setDate(now.getDate() - 7));

        const stakeAtStartOfMonth = stakeEvents
          .filter(event => new Date(event.createdAt) < startOfMonth)
          .reduce((acc, event) => {
            if (event.eventType === "stake") {
              return acc + event.amount;
            } else {
              return acc - event.amount;
            }
          }, 0n);

        const totalStakeChange = totalStake - stakeAtStartOfMonth;
        const totalStakePercentageChange =
          stakeAtStartOfMonth === 0n
            ? totalStakeChange > 0n
              ? 100
              : 0
            : Number((totalStakeChange * 10000n) / stakeAtStartOfMonth) / 100;

        const newFansThisWeek = await prisma.stakeEvent.groupBy({
          by: ["userWalletId"],
          where: {
            poolId,
            createdAt: {
              gte: startOfWeek,
            },
            eventType: "stake",
          },
          _count: {
            userWalletId: true,
          },
        });

        const thirtyDaysAgo = new Date(now.setDate(now.getDate() - 30));

        const dailyStakeEvents = await prisma.stakeEvent.findMany({
          where: {
            poolId,
            createdAt: {
              gte: thirtyDaysAgo,
            },
          },
        });

        const dailyStakeData = Array.from({ length: 30 }, (_, i) => {
          const date = new Date();
          date.setDate(date.getDate() - i);
          const dayStart = new Date(date.setHours(0, 0, 0, 0));
          const dayEnd = new Date(date.setHours(23, 59, 59, 999));

          const netStake = dailyStakeEvents
            .filter(
              event => new Date(event.createdAt) >= dayStart && new Date(event.createdAt) <= dayEnd
            )
            .reduce((acc, event) => {
              if (event.eventType === "stake") {
                return acc + event.amount;
              } else {
                return acc - event.amount;
              }
            }, 0n);

          return {
            date: dayStart.toISOString().split("T")[0],
            stake: netStake.toString(),
          };
        }).reverse();

        return {
          totalStake: totalStake.toString(),
          totalFans: totalActiveFans,
          topFans,
          recentActivity: recentActivity.map(event => ({
            ...event,
            amount: event.amount.toString(),
            onelink: event.userWallet.user?.onelink || event.userWallet.address,
            avatar: event.userWallet.user?.profileImage
              ? s3Service.getFileUrl(event.userWallet.user.profileImage.s3_key)
              : null,
          })),
          totalStakePercentageChange,
          newFansThisWeek: newFansThisWeek.length,
          dailyStakeData,
        };
      } catch (error) {
        console.error("Error fetching pool dashboard:", error);
        if (error instanceof TRPCError) throw error;
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to fetch pool dashboard",
        });
      }
    }),
});
