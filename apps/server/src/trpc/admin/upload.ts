import { adminProcedure, router } from "../trpc";
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { s3Service } from "../../services/S3Service";
import { uploadedFileService } from "../../services/UploadedFileService";
import { env } from "../../env";
import {
  ALLOWED_AVATAR_FILE_EXTENSIONS,
  ALLOWED_AVATAR_FILE_TYPES,
  ALLOWED_BACKGROUND_FILE_EXTENSIONS,
  ALLOWED_BACKGROUND_FILE_TYPES,
  ThemeConfig,
} from "@ampedbio/constants";
import { prisma } from "../../services/DB";

const requestThemeCategoryImageSchema = z.object({
  categoryId: z.number().positive(),
  contentType: z.string().refine(value => ALLOWED_AVATAR_FILE_TYPES.includes(value), {
    message: `Only ${ALLOWED_AVATAR_FILE_EXTENSIONS.join(", ").toUpperCase()} formats are supported`,
  }),
  fileExtension: z
    .string()
    .refine(value => ALLOWED_AVATAR_FILE_EXTENSIONS.includes(value.toLowerCase()), {
      message: `File extension must be ${ALLOWED_AVATAR_FILE_EXTENSIONS.join(", ")}`,
    }),
  fileSize: z.number().max(env.UPLOAD_LIMIT_ADMIN_AVATAR_MB * 1024 * 1024, {
    message: `File size must be less than ${env.UPLOAD_LIMIT_ADMIN_AVATAR_MB}MB`,
  }),
});

const confirmThemeCategoryImageSchema = z.object({
  categoryId: z.number().positive(),
  fileId: z.number().positive(),
  fileName: z.string().min(1),
});

const requestThemeThumbnailSchema = z.object({
  themeId: z.number().positive(),
  contentType: z.string().refine(value => ALLOWED_AVATAR_FILE_TYPES.includes(value), {
    message: `Only ${ALLOWED_AVATAR_FILE_EXTENSIONS.join(", ").toUpperCase()} formats are supported`,
  }),
  fileExtension: z
    .string()
    .refine(value => ALLOWED_AVATAR_FILE_EXTENSIONS.includes(value.toLowerCase()), {
      message: `File extension must be ${ALLOWED_AVATAR_FILE_EXTENSIONS.join(", ")}`,
    }),
  fileSize: z.number().max(env.UPLOAD_LIMIT_ADMIN_AVATAR_MB * 1024 * 1024, {
    message: `File size must be less than ${env.UPLOAD_LIMIT_ADMIN_AVATAR_MB}MB`,
  }),
});

const confirmThemeThumbnailSchema = z.object({
  themeId: z.number().positive(),
  fileId: z.number().positive(),
  fileName: z.string().min(1),
});

const requestAdminThemeBackgroundUrlSchema = z.object({
  themeId: z.number().positive(),
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
  fileSize: z.number().max(env.UPLOAD_LIMIT_ADMIN_BACKGROUND_MB * 1024 * 1024, {
    message: `File size must be less than ${env.UPLOAD_LIMIT_ADMIN_BACKGROUND_MB}MB`,
  }),
});

const confirmAdminThemeBackgroundSchema = z.object({
  themeId: z.number().positive(),
  fileId: z.number().positive(),
  fileName: z.string().min(1),
  mediaType: z.enum(["image", "video"]),
});

export const adminUploadRouter = router({
  // Generate a presigned URL for uploading theme category image (admin only)
  requestThemeCategoryImagePresignedUrl: adminProcedure
    .input(requestThemeCategoryImageSchema)
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.user.sub;

      try {
        // Check file size
        if (input.fileSize > env.UPLOAD_LIMIT_ADMIN_AVATAR_MB * 1024 * 1024) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: `File size exceeds the ${env.UPLOAD_LIMIT_ADMIN_AVATAR_MB}MB limit`,
          });
        }

        // Check if category exists and user is admin
        const category = await prisma.themeCategory.findUnique({
          where: { id: input.categoryId },
        });

        if (!category) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Category not found",
          });
        }

        // Use the S3Service to generate a server presigned URL for category images
        const { presignedUrl, fileKey } = await s3Service.getServerPresignedUploadUrl(
          "category",
          input.contentType,
          input.fileExtension,
          input.categoryId
        );

        // TODO create service to clean up old category images
        // Create uploaded file record immediately when presigned URL is generated
        const uploadedFile = await uploadedFileService.createUploadedFile({
          s3Key: fileKey,
          bucket: process.env.AWS_S3_BUCKET_NAME || "default-bucket",
          fileName: `category_${input.categoryId}_${Date.now()}.${input.fileExtension}`, // Generate a name
          fileType: input.contentType,
          size: input.fileSize,
          userId: null, // Set user_id to null for admin/server files
        });

        return {
          presignedUrl,
          fileId: uploadedFile.id, // Return the file ID for tracking
          expiresIn: 300, // Seconds
        };
      } catch (error) {
        console.error("Error generating presigned URL for theme category image:", error);
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to generate upload URL for theme category image",
        });
      }
    }),

  confirmThemeCategoryImageUpload: adminProcedure
    .input(confirmThemeCategoryImageSchema)
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.user.sub;

      try {
        const uploadedFile = await uploadedFileService.getFileById(input.fileId);
        if (!uploadedFile || uploadedFile.user_id !== null) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "File record not found or not an admin file.",
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

        const currentCategory = await prisma.themeCategory.findUnique({
          where: { id: input.categoryId },
          select: { image_file_id: true },
        });

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

        await prisma.themeCategory.update({
          where: { id: input.categoryId },
          data: {
            image_file_id: input.fileId,
            updated_at: new Date(),
          },
        });

        if (currentCategory?.image_file_id) {
          try {
            await uploadedFileService.deleteFile(currentCategory.image_file_id);
            const prevFile = await uploadedFileService.getFileById(currentCategory.image_file_id);
            if (prevFile) {
              await s3Service.deleteFile(prevFile.s3_key);
            }
          } catch (deleteError) {
            console.warn("Failed to delete previous category image:", deleteError);
          }
        }

        return {
          success: true,
          fileId: input.fileId,
          imageUrl: s3Service.getFileUrl(fileKey),
        };
      } catch (error) {
        console.error("Error updating theme category image:", error);
        if (error instanceof TRPCError) {
          throw error;
        }
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to update theme category image",
        });
      }
    }),

  // Generate a presigned URL for uploading theme thumbnail (admin only)
  requestThemeThumbnailPresignedUrl: adminProcedure
    .input(requestThemeThumbnailSchema)
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.user.sub;

      try {
        // Check file size
        if (input.fileSize > env.UPLOAD_LIMIT_ADMIN_AVATAR_MB * 1024 * 1024) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: `File size exceeds the ${env.UPLOAD_LIMIT_ADMIN_AVATAR_MB}MB limit`,
          });
        }

        // Check if theme exists
        const theme = await prisma.theme.findUnique({
          where: { id: input.themeId },
        });

        if (!theme) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Theme not found",
          });
        }

        // Use the S3Service to generate a server presigned URL for theme thumbnails
        const { presignedUrl, fileKey } = await s3Service.getServerPresignedUploadUrl(
          "backgrounds", // Use backgrounds category for theme thumbnails since thumbnails are only allowed for backgrounds
          input.contentType,
          input.fileExtension,
          undefined, // categoryId not needed for thumbnails
          input.themeId, // themeId for organization
          true // isThumbnail = true
        );

        // Create uploaded file record immediately when presigned URL is generated
        const uploadedFile = await uploadedFileService.createUploadedFile({
          s3Key: fileKey,
          bucket: process.env.AWS_S3_BUCKET_NAME || "default-bucket",
          fileName: `theme_thumbnail_${input.themeId}_${Date.now()}.${input.fileExtension}`, // Generate a name
          fileType: input.contentType,
          size: input.fileSize,
          userId: null, // Set user_id to null for admin/server files
        });

        return {
          presignedUrl,
          fileId: uploadedFile.id, // Return the file ID for tracking
          expiresIn: 300, // Seconds
        };
      } catch (error) {
        console.error("Error generating presigned URL for theme thumbnail:", error);
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to generate upload URL for theme thumbnail",
        });
      }
    }),

  // Confirm successful upload and update theme with the new thumbnail
  confirmThemeThumbnailUpload: adminProcedure
    .input(confirmThemeThumbnailSchema)
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.user.sub;

      try {
        // Get the uploaded file record and verify it's an admin file first
        const uploadedFile = await uploadedFileService.getFileById(input.fileId);
        if (!uploadedFile || uploadedFile.user_id !== null) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "File record not found or not an admin file.",
          });
        }

        // Get fileKey and bucket from database
        const fileKey = uploadedFile.s3_key;
        const bucket = uploadedFile.bucket;

        // Now verify that the file exists in S3 before proceeding
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

        // Get the theme to find its current thumbnail
        const theme = await prisma.theme.findUniqueOrThrow({
          where: { id: input.themeId },
          select: { thumbnail_file_id: true },
        });

        // Get the previous thumbnail file ID
        const previousFileId = theme.thumbnail_file_id;

        // Update the theme with the new thumbnail
        await prisma.theme.update({
          where: { id: input.themeId },
          data: {
            thumbnail_file_id: input.fileId,
            updated_at: new Date(),
          },
        });

        // Delete the previous thumbnail if it exists (as a cleanup task)
        if (previousFileId && previousFileId !== input.fileId) {
          try {
            await uploadedFileService.deleteFile(previousFileId);
            const prevFile = await uploadedFileService.getFileById(previousFileId);
            if (prevFile) {
              await s3Service.deleteFile(prevFile.s3_key);
            }
          } catch (deleteError) {
            console.warn("Failed to delete previous theme thumbnail:", deleteError);
          }
        }

        return {
          success: true,
          fileId: input.fileId,
          thumbnailUrl: s3Service.getFileUrl(fileKey),
        };
      } catch (error) {
        console.error("Error updating theme thumbnail:", error);
        if (error instanceof TRPCError) {
          throw error;
        }
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to update theme thumbnail",
        });
      }
    }),

  // Generate a presigned URL for uploading theme background (admin only)
  requestAdminThemeBackgroundUrl: adminProcedure
    .input(requestAdminThemeBackgroundUrlSchema)
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.user.sub;

      try {
        // Check file size
        if (input.fileSize > env.UPLOAD_LIMIT_ADMIN_BACKGROUND_MB * 1024 * 1024) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: `File size exceeds the ${env.UPLOAD_LIMIT_ADMIN_BACKGROUND_MB}MB limit`,
          });
        }

        // Check if theme exists
        const theme = await prisma.theme.findUnique({
          where: { id: input.themeId },
        });

        if (!theme) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Theme not found",
          });
        }

        // Get the media type based on content type
        const isVideo = input.contentType.startsWith("video/");

        // Use the S3Service to generate a server presigned URL for theme backgrounds
        const { presignedUrl, fileKey } = await s3Service.getServerPresignedUploadUrl(
          "backgrounds",
          input.contentType,
          input.fileExtension,
          undefined, // categoryId not needed for backgrounds
          input.themeId, // themeId for organization
          false // isThumbnail = false
        );

        // Create uploaded file record immediately when presigned URL is generated
        const uploadedFile = await uploadedFileService.createUploadedFile({
          s3Key: fileKey,
          bucket: process.env.AWS_S3_BUCKET_NAME || "default-bucket",
          fileName: `theme_background_${input.themeId}_${Date.now()}.${input.fileExtension}`, // Generate a name
          fileType: input.contentType,
          size: input.fileSize,
          userId: null, // Set user_id to null for admin/server files
        });

        return {
          presignedUrl,
          fileId: uploadedFile.id, // Return the file ID for tracking
          mediaType: isVideo ? "video" : "image",
          expiresIn: 300, // Seconds
        };
      } catch (error) {
        console.error("Error generating presigned URL for theme background:", error);
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to generate upload URL for theme background",
        });
      }
    }),

  // Confirm successful upload and update theme with the new background
  confirmAdminThemeBackgroundUpload: adminProcedure
    .input(confirmAdminThemeBackgroundSchema)
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.user.sub;

      try {
        // Get the uploaded file record and verify it's an admin file first
        const uploadedFile = await uploadedFileService.getFileById(input.fileId);
        if (!uploadedFile || uploadedFile.user_id !== null) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "File record not found or not an admin file.",
          });
        }

        // Get fileKey and bucket from database
        const fileKey = uploadedFile.s3_key;
        const bucket = uploadedFile.bucket;

        // Now verify that the file exists in S3 before proceeding
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

        // Get the theme with current config
        const theme = await prisma.theme.findUniqueOrThrow({
          where: { id: input.themeId },
        });

        // Parse the current theme config
        let themeConfig: ThemeConfig = (theme.config as ThemeConfig) || {};

        // Check for previous background to clean up
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
          where: { id: input.themeId },
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
          // Legacy system - delete if it belongs to this theme
          try {
            await s3Service.deleteFile(previousFileKey);
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
});
