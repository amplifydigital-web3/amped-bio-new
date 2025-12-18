import { privateProcedure, publicProcedure, router } from "../trpc";
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { prisma } from "../../services/DB";
import { Address, createPublicClient, http, zeroAddress } from "viem";
import {
  getChainConfig,
  CREATOR_POOL_FACTORY_ABI,
  getPoolName,
  CREATOR_POOL_ABI,
} from "@ampedbio/web3";
import {
  ALLOWED_POOL_IMAGE_FILE_EXTENSIONS,
  ALLOWED_POOL_IMAGE,
  RewardPool,
} from "@ampedbio/constants";
import { env } from "../../env";
import { s3Service } from "../../services/S3Service";
import { uploadedFileService } from "../../services/UploadedFileService";
import Decimal from "decimal.js";

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

const getFansSchema = z.object({
  pagination: z
    .object({
      page: z.number().min(1).default(1),
      pageSize: z.number().min(1).max(100).default(10),
    })
    .optional(),
  order: z
    .object({
      orderBy: z.enum(["createdAt", "stakeAmount"]).default("createdAt"),
      orderDirection: z.enum(["asc", "desc"]).default("desc"),
    })
    .optional(),
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

        // Get the pool name from blockchain
        const poolName = await getPoolName(pool.poolAddress as Address, parseInt(pool.chainId));

        // Construct the image URL from the s3_key if available
        const imageUrl = pool.poolImage ? s3Service.getFileUrl(pool.poolImage.s3_key) : null;

        // Count participants (stakers) in the pool
        const stakedPoolsCount = await prisma.stakedPool.count({
          where: { poolId: pool.id },
        });

        // Get current user's stake in this pool (using the userId already defined at the start of this function)
        const userWallet = await prisma.userWallet.findUnique({
          where: { userId },
        });

        let userStakeAmount = 0n;
        if (userWallet) {
          const userStake = await prisma.stakedPool.findUnique({
            where: {
              userWalletId_poolId: {
                userWalletId: userWallet.id,
                poolId: pool.id,
              },
            },
          });

          if (userStake) {
            // For consistency, also check blockchain for updated stake amount
            if (pool.poolAddress) {
              try {
                const chain = getChainConfig(parseInt(pool.chainId));
                if (chain) {
                  const publicClient = createPublicClient({
                    chain: chain,
                    transport: http(),
                  });

                  const fanStakeAmount = await publicClient.readContract({
                    address: pool.poolAddress as Address,
                    abi: CREATOR_POOL_ABI,
                    functionName: "fanStakes",
                    args: [userWallet.address as Address],
                  });

                  userStakeAmount = fanStakeAmount as bigint;
                }
              } catch (error) {
                // If blockchain query fails, use the database value
                userStakeAmount = BigInt(userStake.stakeAmount);
                console.error(
                  `Error fetching user stake from blockchain for pool ${pool.id}:`,
                  error
                );
              }
            } else {
              userStakeAmount = BigInt(userStake.stakeAmount);
            }
          }
        }

        // Get user's pending rewards from the pool contract
        let userPendingRewards = 0n;
        const chain = getChainConfig(parseInt(pool.chainId));
        if (userWallet && pool.poolAddress && chain) {
          try {
            const publicClient = createPublicClient({
              chain: chain,
              transport: http(),
            });

            // Use the pendingReward function to get the user's pending rewards
            userPendingRewards = (await publicClient.readContract({
              address: pool.poolAddress as Address,
              abi: CREATOR_POOL_ABI,
              functionName: "pendingReward",
              args: [userWallet.address as Address],
            })) as bigint;
          } catch (error) {
            console.error(
              `Error fetching user pending rewards from blockchain for pool ${pool.id}:`,
              error
            );
            // If blockchain query fails, return 0n as there's no fallback in the database for pending rewards
            userPendingRewards = 0n;
          }
        }

        const rewardPool: RewardPool = {
          id: pool.id,
          description: pool.description,
          chainId: pool.chainId,
          address: pool.poolAddress!,
          image:
            pool.image_file_id && imageUrl
              ? {
                  id: pool.image_file_id,
                  url: imageUrl,
                }
              : null,
          name: poolName || `Pool ${pool.id}`, // Using blockchain name, fallback to id-based name
          totalReward: BigInt(pool.revoStaked || "0"), // Return as wei (bigint)
          stakedAmount: BigInt(pool.revoStaked || "0"), // Return total stake as wei (bigint)
          fans: stakedPoolsCount, // Number of fans
          pendingRewards: userPendingRewards, // User's pending rewards that can be claimed
          stakedByYou: userStakeAmount, // Amount of REVO that the requesting user has staked in this pool
          creator: {
            userId: pool.wallet.userId!,
            address: pool.wallet.address!,
          },
        };
        return rewardPool;
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
              revoStaked: "0",
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
            revoStaked: "0",
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

  getPoolDashboard: privateProcedure
    .input(
      z.object({
        chainId: z.string(),
      })
    )
    .query(async ({ ctx, input }) => {
      const userId = ctx.user.sub;
      const { chainId } = input;

      try {
        // First, verify that the user owns a pool for this chainId
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
              chainId: chainId,
            },
          },
        });

        if (!pool) {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: "Access denied. You don't own a pool for this chain.",
          });
        }

        const poolId = pool.id;

        // Total Stake
        const stakeEvents = await prisma.stakeEvent.findMany({
          where: { poolId },
        });

        const totalStake = stakeEvents.reduce((acc, event) => {
          const eventAmount = BigInt(event.amount);
          if (event.eventType === "stake") {
            return acc + eventAmount;
          } else {
            return acc - eventAmount;
          }
        }, 0n);

        // Count only users with an active stake in the pool using StakedPool
        const totalActiveFans = await prisma.stakedPool.count({
          where: {
            poolId: poolId,
            stakeAmount: {
              gt: "0", // Only count pools with stakeAmount greater than 0
            },
          },
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
            const eventAmount = BigInt(event.amount);
            if (event.eventType === "stake") {
              return acc + eventAmount;
            } else {
              return acc - eventAmount;
            }
          }, 0n);

        const totalStakeChange = totalStake - stakeAtStartOfMonth;
        const totalStakePercentageChange =
          stakeAtStartOfMonth === 0n
            ? totalStakeChange > 0n
              ? 100
              : 0
            : new Decimal(totalStakeChange.toString())
                .mul(new Decimal(10000))
                .div(new Decimal(stakeAtStartOfMonth.toString()))
                .div(new Decimal(100))
                .toNumber();

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
              const eventAmount = BigInt(event.amount);
              if (event.eventType === "stake") {
                return acc + eventAmount;
              } else {
                return acc - eventAmount;
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

  getFans: privateProcedure
    .input(
      getFansSchema.extend({
        chainId: z.string(),
      })
    )
    .query(async ({ ctx, input }) => {
      const userId = ctx.user.sub;
      const { chainId, pagination, order } = input;
      const page = pagination?.page || 1;
      const pageSize = pagination?.pageSize || 10;
      const orderBy = order?.orderBy || "createdAt";
      const orderDirection = order?.orderDirection || "desc";
      const skip = (page - 1) * pageSize;

      try {
        // First, verify that the user owns a pool for this chainId
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
              chainId: chainId,
            },
          },
        });

        if (!pool) {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: "Access denied. You don't own a pool for this chain.",
          });
        }

        const poolId = pool.id;

        const fans = await prisma.stakedPool.findMany({
          where: {
            poolId: poolId,
            stakeAmount: {
              gt: "0", // Only consider active fans
            },
          },
          skip,
          take: pageSize,
          orderBy: {
            [orderBy]: orderDirection,
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

        const totalFans = await prisma.stakedPool.count({
          where: {
            poolId: poolId,
            stakeAmount: {
              gt: "0",
            },
          },
        });

        return {
          fans: fans.map(fan => ({
            id: fan.id,
            stakeAmount: fan.stakeAmount.toString(),
            createdAt: fan.createdAt,
            updatedAt: fan.updatedAt,
            onelink: fan.userWallet.user?.onelink || fan.userWallet.address,
            avatar: fan.userWallet.user?.profileImage
              ? s3Service.getFileUrl(fan.userWallet.user.profileImage.s3_key)
              : null,
          })),
          totalFans,
          page,
          pageSize,
        };
      } catch (error) {
        console.error("Error fetching pool fans:", error);
        if (error instanceof TRPCError) throw error;
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to fetch pool fans",
        });
      }
    }),
});
