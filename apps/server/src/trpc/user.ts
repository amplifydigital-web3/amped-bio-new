import { privateProcedure, router } from "./trpc";
import { PrismaClient } from "@prisma/client";
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { s3Service, FileCategory } from "../services/S3Service";
import { ALLOWED_FILE_EXTENSIONS, ALLOWED_FILE_TYPES, MAX_FILE_SIZE } from "@ampedbio/constants";
import { sendEmailChangeVerification } from "../utils/email/email";

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

// Schema for initiating email change
const initiateEmailChangeSchema = z.object({
  newEmail: z.string().email({ message: "Invalid email address format" }),
});

// Schema for confirming email change
const confirmEmailChangeSchema = z.object({
  code: z.string().length(6, { message: "Verification code must be 6 digits" }),
  newEmail: z.string().email({ message: "Invalid email address format" }),
});

// Function to generate a random 6-digit code
const generateSixDigitCode = (): string => {
  return Math.floor(100000 + Math.random() * 900000).toString();
};

export const userRouter = router({
  // Initiate email change by requesting a verification code
  initiateEmailChange: privateProcedure
    .input(initiateEmailChangeSchema)
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.user.id;
      
      try {
        // Check if user exists
        const user = await prisma.user.findUnique({
          where: { id: userId },
        });

        if (!user) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "User not found",
          });
        }

        // Check if the new email is already in use
        const existingEmailUser = await prisma.user.findUnique({
          where: { email: input.newEmail },
        });

        if (existingEmailUser) {
          throw new TRPCError({
            code: "CONFLICT",
            message: "Email address is already in use",
          });
        }

        // Generate a 6-digit code
        const code = generateSixDigitCode();

        // Set expiration (30 minutes from now)
        const expiresAt = new Date();
        expiresAt.setMinutes(expiresAt.getMinutes() + 30);

        // Delete any existing EMAIL_CHANGE codes for this user
        await prisma.confirmationCode.deleteMany({
          where: {
            userId,
            type: "EMAIL_CHANGE",
            used: false,
          },
        });

        // Create a new confirmation code
        await prisma.confirmationCode.create({
          data: {
            code,
            type: "EMAIL_CHANGE",
            userId,
            expiresAt,
          },
        });

        // Send verification email with the code
        await sendEmailChangeVerification(user.email, input.newEmail, code);

        return {
          success: true,
          message: "Verification code sent to your email",
          expiresAt,
        };
      } catch (error: any) {
        console.error("Error initiating email change:", error);
        if (error instanceof TRPCError) {
          throw error;
        }
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to initiate email change",
        });
      }
    }),

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

  // Confirm email change with verification code
  confirmEmailChange: privateProcedure
    .input(confirmEmailChangeSchema)
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.user.id;
      
      try {
        // Check if user exists
        const user = await prisma.user.findUnique({
          where: { id: userId },
        });

        if (!user) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "User not found",
          });
        }

        // Cleanup expired confirmation codes
        try {
          await prisma.confirmationCode.deleteMany({
            where: {
              type: "EMAIL_CHANGE",
              expiresAt: {
                lt: new Date(),
              },
            },
          });
        } catch (cleanupError) {
          // Ignore errors during cleanup
          console.warn("Error cleaning up expired confirmation codes:", cleanupError);
        }

        // Verify the confirmation code
        const confirmationCode = await prisma.confirmationCode.findFirst({
          where: {
            userId,
            code: input.code,
            type: "EMAIL_CHANGE",
            used: false,
            expiresAt: {
              gt: new Date(),
            },
          },
        });

        if (!confirmationCode) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Invalid or expired verification code",
          });
        }
        
        // Check that the new email provided in the confirmation matches what was requested
        const newEmail = input.newEmail;
        
        // Check if the email is still available
        const existingEmailUser = await prisma.user.findUnique({
          where: { email: newEmail },
        });

        if (existingEmailUser) {
          throw new TRPCError({
            code: "CONFLICT",
            message: "Email address is already in use",
          });
        }

        // Update the user's email
        await prisma.user.update({
          where: { id: userId },
          data: {
            email: newEmail,
            updated_at: new Date(),
          },
        });

        // Mark the confirmation code as used
        await prisma.confirmationCode.update({
          where: { id: confirmationCode.id },
          data: { used: true },
        });

        return {
          success: true,
          message: "Email address has been successfully updated",
        };
      } catch (error: any) {
        console.error("Error confirming email change:", error);
        if (error instanceof TRPCError) {
          throw error;
        }
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to update email address",
        });
      }
    }),
});