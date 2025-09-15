import { privateProcedure, router } from "./trpc";
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { prisma } from "../services/DB";
import { Address, createPublicClient, http, zeroAddress } from "viem";
import { getChainConfig, CREATOR_POOL_FACTORY_ABI } from "@ampedbio/web3";
import {
  ALLOWED_AVATAR_IMAGE_FILE_EXTENSIONS,
  ALLOWED_AVATAR_FILE_TYPES,
} from "@ampedbio/constants";
import { env } from "../env";
import { s3Service } from "../services/S3Service";
import { uploadedFileService } from "../services/UploadedFileService";

const requestPoolImagePresignedUrlSchema = z.object({
  contentType: z.string().refine(value => ALLOWED_AVATAR_FILE_TYPES.includes(value), {
    message: `Only ${ALLOWED_AVATAR_IMAGE_FILE_EXTENSIONS.join(", ").toUpperCase()} formats are supported`,
  }),
  fileExtension: z
    .string()
    .refine(value => ALLOWED_AVATAR_IMAGE_FILE_EXTENSIONS.includes(value.toLowerCase()), {
      message: `File extension must be ${ALLOWED_AVATAR_IMAGE_FILE_EXTENSIONS.join(", ")}`,
    }),
  fileSize: z.number().max(env.UPLOAD_LIMIT_PROFILE_PHOTO_MB * 1024 * 1024, {
    message: `File size must be less than ${env.UPLOAD_LIMIT_PROFILE_PHOTO_MB}MB`,
  }),
});

const confirmPoolImageUploadSchema = z.object({
  fileId: z.number().positive(),
  fileName: z.string().min(1),
});

export const poolsRouter = router({
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

      try {
        // First, try to find an existing pool for this user and chain
        let pool = await prisma.creatorPool.findUnique({
          where: {
            userId_chainId: {
              userId,
              chainId: input.chainId,
            },
          },
        });

        console.info("Checked for existing pool in database:", pool);

        // If a pool exists but doesn't have an address, return it
        if (pool && !pool.poolAddress) {
          return pool;
        }

        // If no pool exists, create a new one
        if (!pool) {
          pool = await prisma.creatorPool.create({
            data: {
              description: input.description,
              chainId: input.chainId,
              user: {
                connect: {
                  id: userId,
                },
              },
            },
          });
        }

        // If we get here, there's either a new pool or an existing pool with an address
        // In the case of an existing pool with an address, we should throw an error
        if (pool.poolAddress) {
          throw new TRPCError({
            code: "CONFLICT",
            message: "Pool already exists for this chain",
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

      let pool = await prisma.creatorPool.findUnique({
        where: {
          userId_chainId: {
            userId,
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
            user: {
              connect: {
                id: userId,
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

      try {
        // Find and delete the pool for this specific user and chain
        const pool = await prisma.creatorPool.delete({
          where: {
            userId_chainId: {
              userId,
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
        const pool = await prisma.creatorPool.findUnique({
          where: { id: input.id, userId },
        });

        if (!pool) {
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
      } catch (error) {
        console.error("Error generating presigned URL for pool image:", error);
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to generate upload URL",
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
});
