import { privateProcedure, router } from "./trpc";
import { PrismaClient } from "@prisma/client";
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { s3Service, FileCategory } from "../services/S3Service";
import { ALLOWED_FILE_EXTENSIONS, ALLOWED_FILE_TYPES, MAX_FILE_SIZE } from "@ampedbio/constants";

const prisma = new PrismaClient();

// Schema for requesting a presigned URL
const requestPresignedUrlSchema = z.object({
  contentType: z.string().refine(
    (value) => ALLOWED_FILE_TYPES.includes(value),
    { message: `Only ${ALLOWED_FILE_EXTENSIONS.join(', ').toUpperCase()} image formats are supported` }
  ),
  fileExtension: z.string().refine(
    (value) => ALLOWED_FILE_EXTENSIONS.includes(value.toLowerCase()),
    { message: `File extension must be ${ALLOWED_FILE_EXTENSIONS.join(', ')}` }
  ),
  fileSize: z.number().max(MAX_FILE_SIZE, { message: "File size must be less than 5MB" }),
  category: z.enum(['profiles', 'backgrounds', 'media', 'files']).default('profiles')
});

// Schema for confirming successful upload
const confirmUploadSchema = z.object({
  fileKey: z.string().min(1),
  category: z.enum(['profiles', 'backgrounds', 'media', 'files']).default('profiles')
});

export const userRouter = router({
  // Generate a presigned URL for uploading profile picture
  requestPresignedUrl: privateProcedure
    .input(requestPresignedUrlSchema)
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.user.id;
      
      try {
        // Check file size
        if (input.fileSize > MAX_FILE_SIZE) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "File size exceeds the 5MB limit",
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