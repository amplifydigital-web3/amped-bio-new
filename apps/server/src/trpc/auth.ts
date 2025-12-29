import { router, publicProcedure, privateProcedure } from "./trpc";
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { verifyRecaptcha } from "../utils/recaptcha";
import crypto from "crypto";
import { sendEmailVerification } from "../utils/email/email";
import { generateAccessToken } from "../utils/token";
import { getFileUrl } from "../utils/fileUrlResolver";
import { passwordResetRequestSchema, processPasswordResetSchema } from "../schemas/auth.schema";
import { env } from "../env";
import { prisma } from "../services/DB";
import { auth } from "../utils/auth";

// Helper function to handle Prisma errors
function handlePrismaError(error: unknown, operation: string) {
  console.error(`Prisma error in ${operation}:`, error);

  // Log the full error details for debugging
  if (error instanceof Error) {
    console.error(`Error name: ${error.name}`);
    console.error(`Error message: ${error.message}`);
    console.error(`Error stack: ${error.stack}`);
  }

  // Return generic internal server error to frontend
  throw new TRPCError({
    code: "INTERNAL_SERVER_ERROR",
    message: "Internal server error occurred",
  });
}

export const authRouter = router({
  // Password reset request
  passwordResetRequest: publicProcedure
    .input(passwordResetRequestSchema)
    .mutation(async ({ input }) => {
      try {
        const { email, recaptchaToken } = input;

        // Verify reCAPTCHA token
        const isRecaptchaValid = await verifyRecaptcha(recaptchaToken);
        if (!isRecaptchaValid) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "reCAPTCHA verification failed",
          });
        }

        // Use better-auth to send password reset email
        await auth.api.requestPasswordReset({
          body: {
            email,
            redirectTo: `${env.FRONTEND_URL}/reset-password`,
          },
        });

        return {
          success: true,
          message: "Password reset email sent",
          email,
        };
      } catch (error) {
        if (error instanceof TRPCError) {
          // Re-throw TRPC errors as-is
          throw error;
        }
        console.error("Password reset request error:", error);
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to send password reset email",
        });
      }
    }),

  me: privateProcedure.query(async ({ ctx }) => {
    try {
      const userId = ctx.user.sub;

      // Find user
      const user = await prisma.user.findUnique({
        where: { id: userId },
      });

      if (!user) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Invalid credentials",
        });
      }

      // Fetch user's wallet address
      const userWallet = await prisma.userWallet.findUnique({
        where: { userId: user.id },
        select: { address: true },
      });

      // Resolve user image URL
      const imageUrl = await getFileUrl({
        legacyImageField: user.image,
        imageFileId: user.image_file_id,
      });

      return {
        user: {
          id: user.id,
          email: user.email,
          onelink: user.onelink,
          // emailVerified: user.email_verified_at !== null,
          role: user.role,
          image: imageUrl,
          wallet: userWallet?.address || null,
          hasPool: false, // Placeholder - we'll need to determine this differently since pools are now related to wallet
        },
      };
    } catch (error) {
      if (error instanceof TRPCError) {
        // Re-throw TRPC errors as-is
        throw error;
      }
      return handlePrismaError(error, "me");
    }
  }),

  // Process password reset
  processPasswordReset: publicProcedure
    .input(processPasswordResetSchema)
    .mutation(async ({ input }) => {
      try {
        const { token: requestToken, newPassword } = input;

        // Use better-auth to reset password
        await auth.api.resetPassword({
          body: {
            token: requestToken,
            newPassword,
          },
        });

        return {
          message: "Password has been reset successfully",
        };
      } catch (error) {
        if (error instanceof TRPCError) {
          // Re-throw TRPC errors as-is
          throw error;
        }
        console.error("Password reset error:", error);
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Invalid or expired reset token",
        });
      }
    }),

  // Verify email
  verifyEmail: publicProcedure
    .input(
      z.object({
        token: z.string(),
        email: z.string().email(),
      })
    )
    .mutation(async ({ input }) => {
      try {
        const { token, email } = input;

        // Find user with token and email
        const user = await prisma.user.findFirst({
          where: {
            remember_token: token,
            email,
          },
        });

        if (!user) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "(Token, Email) not found",
          });
        }

        // Update user as verified
        const result = await prisma.user.update({
          where: { id: user.id },
          data: {
            email_verified_at: new Date(),
            remember_token: null,
          },
        });

        return {
          message: "Email verified successfully",
          onelink: result.onelink,
          email,
        };
      } catch (error) {
        if (error instanceof TRPCError) {
          // Re-throw TRPC errors as-is
          throw error;
        }
        return handlePrismaError(error, "verifyEmail");
      }
    }),

  // Send email verification
  sendVerifyEmail: publicProcedure
    .input(
      z.object({
        email: z.string().email(),
      })
    )
    .mutation(async ({ input }) => {
      try {
        const { email } = input;

        // Find user
        const user = await prisma.user.findUnique({
          where: { email },
        });

        if (!user) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "User not found",
          });
        }

        // Generate new verification token
        const remember_token = crypto.randomBytes(32).toString("hex");

        // Update user with new token
        const updatedUser = await prisma.user.update({
          where: { id: user.id },
          data: { remember_token },
        });

        if (!updatedUser.remember_token) {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: "Failed to generate verification token",
          });
        }

        // Send verification email
        try {
          await sendEmailVerification(updatedUser.email, updatedUser.remember_token);
        } catch (error) {
          console.error("Error sending verification email:", error);
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: "Failed to send verification email",
          });
        }

        return {
          success: true,
          message: "Verification email sent successfully",
        };
      } catch (error) {
        if (error instanceof TRPCError) {
          // Re-throw TRPC errors as-is
          throw error;
        }
        return handlePrismaError(error, "sendVerifyEmail");
      }
    }),

  getWalletToken: privateProcedure.query(async ({ ctx }) => {
    try {
      // Fetch user's wallet address
      const userWallet = await prisma.userWallet.findUnique({
        where: { userId: ctx.user.sub },
        select: { address: true },
      });

      return {
        walletToken: generateAccessToken({
          id: ctx.user.sub,
          email: ctx.user.email,
          role: ctx.user.role,
          wallet: userWallet?.address ?? null,
        }),
      };
    } catch (error) {
      if (error instanceof TRPCError) {
        // Re-throw TRPC errors as-is
        throw error;
      }
      return handlePrismaError(error, "getWalletToken");
    }
  }),
});
