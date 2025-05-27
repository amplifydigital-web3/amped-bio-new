import { privateProcedure, router } from "./trpc";
import { PrismaClient } from "@prisma/client";
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { s3Service, FileCategory } from "../services/S3Service";
import { 
  
  ALLOWED_AVATAR_FILE_EXTENSIONS, ALLOWED_AVATAR_FILE_TYPES, MAX_AVATAR_FILE_SIZE,
  ALLOWED_BACKGROUND_FILE_EXTENSIONS, ALLOWED_BACKGROUND_FILE_TYPES, MAX_BACKGROUND_FILE_SIZE } from "@ampedbio/constants";

const prisma = new PrismaClient();

// Schema for requesting a presigned URL
const requestPresignedUrlSchema = z.object({
  contentType: z.string().refine(
    (value) => ALLOWED_AVATAR_FILE_TYPES.includes(value),
    { message: `Only ${ALLOWED_AVATAR_FILE_EXTENSIONS.join(', ').toUpperCase()} formats are supported` }
  ),
  fileExtension: z.string().refine(
    (value) => ALLOWED_AVATAR_FILE_EXTENSIONS.includes(value.toLowerCase()),
    { message: `File extension must be ${ALLOWED_AVATAR_FILE_EXTENSIONS.join(', ')}` }
  ),
  fileSize: z.number().max(MAX_AVATAR_FILE_SIZE, { message: `File size must be less than ${MAX_AVATAR_FILE_SIZE / (1024 * 1024)}MB` }),
  category: z.enum(['profiles', 'backgrounds', 'media', 'files']).default('profiles')
});

// Schema for requesting a presigned URL for a theme background (image or video)
const requestThemeBackgroundUrlSchema = z.object({
  contentType: z.string().refine(
    (value) => ALLOWED_BACKGROUND_FILE_TYPES.includes(value) && (value.startsWith('image/') || value.startsWith('video/')),
    { message: `Only ${ALLOWED_BACKGROUND_FILE_EXTENSIONS.join(', ').toUpperCase()} formats are supported` }
  ),
  fileExtension: z.string().refine(
    (value) => ALLOWED_BACKGROUND_FILE_EXTENSIONS.includes(value.toLowerCase()),
    { message: `File extension must be ${ALLOWED_BACKGROUND_FILE_EXTENSIONS.join(', ')}` }
  ),
  fileSize: z.number().max(MAX_BACKGROUND_FILE_SIZE, { message: `File size must be less than ${MAX_BACKGROUND_FILE_SIZE / (1024 * 1024)}MB` }),
  themeId: z.number()
});

// Schema for confirming successful upload
const confirmUploadSchema = z.object({
  fileKey: z.string().min(1),
  category: z.enum(['profiles', 'backgrounds', 'media', 'files']).default('profiles')
});

// Schema for confirming successful theme background upload (image or video)
const confirmThemeBackgroundSchema = z.object({
  fileKey: z.string().min(1),
  themeId: z.number(),
  mediaType: z.enum(['image', 'video'])
});

export const uploadRouter = router({
  // Generate a presigned URL for uploading profile picture
  requestAvatarPresignedUrl: privateProcedure
    .input(requestPresignedUrlSchema)
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.user.id;
      
      try {
        // Check file size
        if (input.fileSize > MAX_AVATAR_FILE_SIZE) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: `File size exceeds the ${MAX_AVATAR_FILE_SIZE / (1024 * 1024)}MB limit`,
          });
        }
        
        // Use the S3Service to generate a presigned URL
        const { presignedUrl, fileKey } = await s3Service.getPresignedUploadUrl(
          input.category as FileCategory,
          userId,
          input.contentType,
          input.fileExtension
        );
        
        return {
          presignedUrl,
          fileKey,
          expiresIn: 300, // Seconds
        };
      } catch (error) {
        console.error("Error generating presigned URL:", error);
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to generate upload URL",
        });
      }
    }),
    
  // Generate a presigned URL for uploading theme background (image or video)
  requestThemeBackgroundUrl: privateProcedure
    .input(requestThemeBackgroundUrlSchema)
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.user.id;
      
      try {
        // Check file size
        if (input.fileSize > MAX_BACKGROUND_FILE_SIZE) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: `File size exceeds the ${MAX_BACKGROUND_FILE_SIZE / (1024 * 1024)}MB limit`,
          });
        }
        
        // Verify that the theme belongs to the user
        const theme = await prisma.theme.findUnique({
          where: {
            id: input.themeId,
            user_id: userId
          }
        });
        
        if (!theme) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Theme not found or you don't have permission to modify it",
          });
        }
        
        // Get the media type based on content type
        const isVideo = input.contentType.startsWith('video/');
        
        // Use the S3Service to generate a presigned URL with a custom file key 
        // that includes the theme ID
        const fileKey = `user-uploads/backgrounds/theme_${input.themeId}_${Date.now()}.${input.fileExtension}`;
        const presignedUrl = await s3Service.getSignedUrl(fileKey, 'putObject', 300, input.contentType);
        
        return {
          presignedUrl,
          fileKey,
          mediaType: isVideo ? 'video' : 'image',
          expiresIn: 300, // Seconds
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
      const userId = ctx.user.id;
      
      try {
        // Get the theme
        const theme = await prisma.theme.findUnique({
          where: {
            id: input.themeId,
            user_id: userId
          }
        });

        if (!theme) {
          throw new TRPCError({
            code: 'NOT_FOUND',
            message: 'Theme not found or you don\'t have permission to modify it',
          });
        }

        // Get the public URL for the background
        const backgroundUrl = s3Service.getFileUrl(input.fileKey);
        
        // Parse the current theme config
        let themeConfig = theme.config as Record<string, any> || {};
        
        // If there's an existing background, we might want to delete it later
        let previousFileKey: string | null = null;
        
        if (themeConfig.background && themeConfig.background.value) {
          previousFileKey = s3Service.extractFileKeyFromUrl(themeConfig.background.value);
        }
        
        // Update the theme configuration with the new background
        themeConfig = {
          ...themeConfig,
          background: {
            // Keep any other background properties if they exist
            ...(themeConfig.background || {}),
            // Override with new values
            type: input.mediaType,
            value: backgroundUrl,
          }
        };
        
        // Update theme in database
        const updatedTheme = await prisma.theme.update({
          where: { 
            id: input.themeId 
          },
          data: {
            config: themeConfig,
            updated_at: new Date()
          },
        });
        
        // Delete the previous background if it exists and belongs to this theme/user
        if (previousFileKey && previousFileKey !== input.fileKey) {
          try {
            // Only delete if the file belongs to this theme and user
            if (s3Service.isThemeOwnerFile(previousFileKey, input.themeId, userId)) {
              console.info('[INFO] Deleting previous theme background that belongs to user', 
                JSON.stringify({ previousFileKey, themeId: input.themeId, userId }));
              await s3Service.deleteFile(previousFileKey);
            } else {
              console.info('[INFO] Skipping deletion of previous background that may not belong to user',
                JSON.stringify({ previousFileKey, themeId: input.themeId, userId }));
            }
          } catch (deleteError) {
            // Just log the error but don't fail the whole operation
            console.warn('Failed to delete previous background:', deleteError);
          }
        }
        
        return {
          success: true,
          backgroundUrl,
          theme: updatedTheme
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
      const userId = ctx.user.id;
      
      try {
        // Get the user's current profile picture
        const user = await prisma.user.findUnique({
          where: { id: userId },
          select: { image: true }
        });

        if (!user) {
          throw new TRPCError({
            code: 'NOT_FOUND',
            message: 'User not found',
          });
        }

        // Extract the file key from the previous image URL (if exists)
        const previousFileKey = user.image ? s3Service.extractFileKeyFromUrl(user.image) : null;
        
        // Get the public URL for the new profile picture
        const profilePictureUrl = s3Service.getFileUrl(input.fileKey);
        
        // Update user profile picture URL in database
        const updatedUser = await prisma.user.update({
          where: { id: userId },
          data: {
            image: profilePictureUrl,
            updated_at: new Date()
          },
        });
        
        // Delete the previous profile picture if it exists (as a cleanup task)
        if (previousFileKey && previousFileKey !== input.fileKey) {
          try {
            await s3Service.deleteFile(previousFileKey);
          } catch (deleteError) {
            // Just log the error but don't fail the whole operation
            console.warn('Failed to delete previous profile picture:', deleteError);
          }
        }
        
        return {
          success: true,
          profilePictureUrl: updatedUser.image!
        };
      } catch (error) {
        console.error("Error updating profile picture:", error);
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to update profile picture",
        });
      }
    }),
});
