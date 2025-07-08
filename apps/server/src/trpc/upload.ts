import { privateProcedure, router } from "./trpc";
import { PrismaClient } from "@prisma/client";
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { s3Service, FileCategory } from "../services/S3Service";
import { uploadedFileService } from "../services/UploadedFileService";
import {
  ALLOWED_AVATAR_FILE_EXTENSIONS,
  ALLOWED_AVATAR_FILE_TYPES,
  MAX_AVATAR_FILE_SIZE,
  ALLOWED_BACKGROUND_FILE_EXTENSIONS,
  ALLOWED_BACKGROUND_FILE_TYPES,
  MAX_BACKGROUND_FILE_SIZE,
  ThemeConfig,
} from "@ampedbio/constants";

const prisma = new PrismaClient();

const requestPresignedUrlSchema = z.object({
  contentType: z.string().refine(value => ALLOWED_AVATAR_FILE_TYPES.includes(value), {
    message: `Only ${ALLOWED_AVATAR_FILE_EXTENSIONS.join(", ").toUpperCase()} formats are supported`,
  }),
  fileExtension: z
    .string()
    .refine(value => ALLOWED_AVATAR_FILE_EXTENSIONS.includes(value.toLowerCase()), {
      message: `File extension must be ${ALLOWED_AVATAR_FILE_EXTENSIONS.join(", ")}`,
    }),
  fileSize: z.number().max(MAX_AVATAR_FILE_SIZE, {
    message: `File size must be less than ${MAX_AVATAR_FILE_SIZE / (1024 * 1024)}MB`,
  }),
  category: z.enum(["profiles", "backgrounds", "media", "files"]).default("profiles"),
});

const requestThemeBackgroundUrlSchema = z.object({
  contentType: z
    .string()
    .refine(
      value =>
        ALLOWED_BACKGROUND_FILE_TYPES.includes(value) &&
        (value.startsWith("image/") || value.startsWith("video/")),
      {
        message: `Only ${ALLOWED_BACKGROUND_FILE_EXTENSIONS.join(", ").toUpperCase()} formats are supported`,
      }
    ),
  fileExtension: z
    .string()
    .refine(value => ALLOWED_BACKGROUND_FILE_EXTENSIONS.includes(value.toLowerCase()), {
      message: `File extension must be ${ALLOWED_BACKGROUND_FILE_EXTENSIONS.join(", ")}`,
    }),
  fileSize: z.number().max(MAX_BACKGROUND_FILE_SIZE, {
    message: `File size must be less than ${MAX_BACKGROUND_FILE_SIZE / (1024 * 1024)}MB`,
  }),
});

const confirmUploadSchema = z.object({
  fileId: z.number().positive(), // File ID from the presigned URL request
  fileName: z.string().min(1), // Actual filename from client
  category: z.enum(["profiles", "backgrounds", "media", "files"]).default("profiles"),
});

const confirmThemeBackgroundSchema = z.object({
  fileId: z.number().positive(), // File ID from the presigned URL request
  fileName: z.string().min(1), // Actual filename from client
  mediaType: z.enum(["image", "video"]),
});



export const uploadRouter = router({
  requestAvatarPresignedUrl: privateProcedure
    .input(requestPresignedUrlSchema)
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.user.sub;

      try {
        if (input.fileSize > MAX_AVATAR_FILE_SIZE) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: `File size exceeds the ${MAX_AVATAR_FILE_SIZE / (1024 * 1024)}MB limit`,
          });
        }

        const { presignedUrl, fileKey } = await s3Service.getPresignedUploadUrl(
          input.category as FileCategory,
          userId,
          input.contentType,
          input.fileExtension
        );

        const uploadedFile = await uploadedFileService.createUploadedFile({
          s3Key: fileKey,
          bucket: process.env.AWS_S3_BUCKET_NAME || "default-bucket",
          fileName: `avatar_${Date.now()}.${input.fileExtension}`,
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
        console.error("Error generating presigned URL:", error);
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to generate upload URL",
        });
      }
    }),

  requestThemeBackgroundUrl: privateProcedure
    .input(requestThemeBackgroundUrlSchema)
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.user.sub;

      try {
        if (input.fileSize > MAX_BACKGROUND_FILE_SIZE) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: `File size exceeds the ${MAX_BACKGROUND_FILE_SIZE / (1024 * 1024)}MB limit`,
          });
        }

        const userFound = await prisma.user.findUnique({
          where: { id: userId },
          select: { theme: true, onelink: true },
        });

        let themeId = userFound?.theme;

        if (userFound?.theme === null) {
          const theme = await prisma.theme.create({
            data: {
              user_id: userId,
              name: `${userFound!.onelink}'s theme`,
              share_level: "private",
              share_config: {},
              config: {},
            },
          });

          themeId = theme.id.toString();

          await prisma.user.update({
            where: { id: userId },
            data: { theme: themeId },
          });
        }

        // Get the media type based on content type
        const isVideo = input.contentType.startsWith("video/");

        // Use the S3Service to generate a presigned URL
        const { presignedUrl, fileKey } = await s3Service.getPresignedUploadUrl(
          "backgrounds",
          userId,
          input.contentType,
          input.fileExtension,
          Number(themeId)
        );

        const uploadedFile = await uploadedFileService.createUploadedFile({
          s3Key: fileKey,
          bucket: process.env.AWS_S3_BUCKET_NAME || "default-bucket",
          fileName: `background_${Date.now()}.${input.fileExtension}`,
          fileType: input.contentType,
          size: input.fileSize,
          userId: userId,
        });

        return {
          presignedUrl,
          fileId: uploadedFile.id,
          mediaType: isVideo ? "video" : "image",
          expiresIn: 300,
        };
      } catch (error) {
        console.error("Error generating presigned URL for theme background:", error);
        if (error instanceof TRPCError) {
          throw error;
        }
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to generate upload URL",
        });
      }
    }),

  // Confirm successful upload and update theme with the background URL (image or video)
  confirmThemeBackgroundUpload: privateProcedure
    .input(confirmThemeBackgroundSchema)
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.user.sub;

      try {
        // Get the uploaded file record first to get the fileKey
        const uploadedFile = await uploadedFileService.getFileById(input.fileId);
        if (!uploadedFile || uploadedFile.user_id !== userId) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "File record not found or access denied.",
          });
        }

        // Get fileKey and bucket from database
        const fileKey = uploadedFile.s3_key;
        const bucket = uploadedFile.bucket;

        // Verify that the file exists in S3 before proceeding
        const fileExists = await s3Service.fileExists({ fileKey, bucket });
        if (!fileExists) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "File not found in S3. Please upload the file first.",
          });
        }

        // Update the file record with the actual filename and mark as completed
        await uploadedFileService.updateFileStatus({
          id: input.fileId,
          status: "COMPLETED",
        });

        // Also update the filename
        await prisma.uploadedFile.update({
          where: { id: input.fileId },
          data: {
            file_name: input.fileName,
            updated_at: new Date(),
          },
        });

        // Get the user's theme ID (should already exist since requestThemeBackgroundUrl creates it)
        const userFound = await prisma.user.findUniqueOrThrow({
          where: { id: userId },
          select: { theme: true },
        });

        if (!userFound.theme) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "User theme not found. Please request a new upload URL first.",
          });
        }

        // Get the theme with numeric ID
        const themeIdNum = Number(userFound.theme);
        const theme = await prisma.theme.findUniqueOrThrow({
          where: {
            id: themeIdNum,
            user_id: userId,
          },
        });

        // Parse the current theme config
        let themeConfig: ThemeConfig = (theme.config as ThemeConfig) || {};

        // If there's an existing background, we might want to delete it later
        let previousFileKey: string | null = null;
        let previousFileId: number | null = null;

        if (themeConfig.background) {
          if (themeConfig.background.fileId) {
            // New system - file ID reference
            previousFileId = themeConfig.background.fileId;
          } else if (themeConfig.background.value) {
            // Legacy system - direct URL
            previousFileKey = s3Service.extractFileKeyFromUrl(themeConfig.background.value);
          }
        }

        // Update the theme configuration with the new background
        themeConfig = {
          ...themeConfig,
          background: {
            // Keep any other background properties if they exist
            ...(themeConfig.background || {}),
            // Override with new values
            type: input.mediaType,
            value: null, // Set to null since we're using file ID now
            fileId: input.fileId, // Use the provided file ID
          },
        };

        // Update theme in database
        const updatedTheme = await prisma.theme.update({
          where: {
            id: themeIdNum,
          },
          data: {
            config: themeConfig as any, // Cast to any for Prisma JsonValue compatibility
            updated_at: new Date(),
          },
        });

        // Handle cleanup of previous background
        if (previousFileId) {
          // New system - mark previous file as deleted
          try {
            await uploadedFileService.deleteFile(previousFileId);
            const prevFile = await uploadedFileService.getFileById(previousFileId);
            if (prevFile) {
              await s3Service.deleteFile(prevFile.s3_key);
            }
          } catch (deleteError) {
            console.warn("Failed to delete previous background file:", deleteError);
          }
        } else if (previousFileKey && previousFileKey !== fileKey) {
          // Legacy system - delete if it belongs to this theme/user
          try {
            if (
              s3Service.isThemeOwnerFile({
                fileKey: previousFileKey,
                themeId: themeIdNum,
                userId,
              })
            ) {
              console.info(
                "[INFO] Deleting previous theme background that belongs to user",
                JSON.stringify({ previousFileKey, themeId: themeIdNum, userId })
              );
              await s3Service.deleteFile(previousFileKey);
            } else {
              console.info(
                "[INFO] Skipping deletion of previous background that may not belong to user",
                JSON.stringify({ previousFileKey, themeId: themeIdNum, userId })
              );
            }
          } catch (deleteError) {
            console.warn("Failed to delete previous background:", deleteError);
          }
        }

        return {
          success: true,
          backgroundUrl: s3Service.getFileUrl(fileKey),
          fileId: input.fileId,
          theme: updatedTheme,
        };
      } catch (error) {
        console.error("Error updating theme background:", error);
        if (error instanceof TRPCError) {
          throw error;
        }
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to update theme background",
        });
      }
    }),

  // Confirm successful upload and update user profile picture
  confirmProfilePictureUpload: privateProcedure
    .input(confirmUploadSchema)
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.user.sub;

      try {
        // Get the uploaded file record first to get the fileKey
        const uploadedFile = await uploadedFileService.getFileById(input.fileId);
        if (!uploadedFile || uploadedFile.user_id !== userId) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "File record not found or access denied.",
          });
        }

        // Get fileKey and bucket from database
        const fileKey = uploadedFile.s3_key;
        const bucket = uploadedFile.bucket;

        // Verify that the file exists in S3 before proceeding
        const fileExists = await s3Service.fileExists({ fileKey, bucket });
        if (!fileExists) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "File not found in S3. Please upload the file first.",
          });
        }

        // Update the file record with the actual filename and mark as completed
        await uploadedFileService.updateFileStatus({
          id: input.fileId,
          status: "COMPLETED",
        });

        // Also update the filename
        await prisma.uploadedFile.update({
          where: { id: input.fileId },
          data: {
            file_name: input.fileName,
            updated_at: new Date(),
          },
        });

        // Get the user's current profile picture
        const user = await prisma.user.findUnique({
          where: { id: userId },
          select: { image: true },
        });

        if (!user) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "User not found",
          });
        }

        // Extract the file key from the previous image URL (if exists) - legacy system
        const previousFileKey = user.image ? s3Service.extractFileKeyFromUrl(user.image) : null;

        // Get the public URL for the new profile picture
        const profilePictureUrl = s3Service.getFileUrl(fileKey);

        // Update user profile picture URL and file reference in database
        await prisma.user.update({
          where: { id: userId },
          data: {
            image: null, // Set to null since we're using file ID now
            image_file_id: input.fileId, // Now types are updated
            updated_at: new Date(),
          },
        });

        // Delete the previous profile picture if it exists (as a cleanup task)
        if (previousFileKey && previousFileKey !== fileKey) {
          try {
            await s3Service.deleteFile(previousFileKey);
          } catch (deleteError) {
            console.warn("Failed to delete previous profile picture:", deleteError);
          }
        }

        return {
          success: true,
          profilePictureUrl: s3Service.getFileUrl(fileKey),
          fileId: input.fileId,
        };
      } catch (error) {
        console.error("Error updating profile picture:", error);
        if (error instanceof TRPCError) {
          throw error;
        }
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to update profile picture",
        });
      }
    }),

  // Get file information by ID (for resolving file URLs)
  getFileInfo: privateProcedure
    .input(
      z.object({
        fileId: z.number().positive(),
      })
    )
    .query(async ({ ctx, input }) => {
      const userId = ctx.user.sub;

      try {
        const file = await uploadedFileService.getFileById(input.fileId);

        if (!file) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "File not found",
          });
        }

        // Check if user can access this file
        const canAccess = await uploadedFileService.canUserAccessFile(input.fileId, userId);
        if (!canAccess) {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: "Access denied to this file",
          });
        }

        return {
          id: file.id,
          fileName: file.file_name,
          fileType: file.file_type,
          size: file.size ? Number(file.size) : null,
          url: s3Service.getFileUrl(file.s3_key),
          status: file.status,
          uploadedAt: file.uploaded_at,
          isServerFile: file.user_id === null,
        };
      } catch (error) {
        console.error("Error getting file info:", error);
        if (error instanceof TRPCError) {
          throw error;
        }
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to get file information",
        });
      }
    }),
});
