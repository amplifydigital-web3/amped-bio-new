import { router, publicProcedure, privateProcedure } from "./trpc";
import { TRPCError } from "@trpc/server";
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
        const { email } = input;

        // Verify reCAPTCHA token
        // const isRecaptchaValid = await verifyRecaptcha(recaptchaToken);
        // if (!isRecaptchaValid) {
        //   throw new TRPCError({
        //     code: "BAD_REQUEST",
        //     message: "reCAPTCHA verification failed",
        //   });
        // }

        // Use better-auth to send password reset email
        const authInstance = await auth;
        await authInstance.api.requestPasswordReset({
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

  getWalletToken: privateProcedure.query(async ({ ctx }) => {
    try {
      // Fetch user's wallet address
      const userWallet = await prisma.userWallet.findUnique({
        where: { userId: ctx.user!.sub },
        select: { address: true },
      });

      // Get session using better-auth
      const authInstance = await auth;
      const session = await authInstance.api.getSession({
        headers: ctx.req.headers as any,
      });

      if (!session) {
        throw new TRPCError({
          code: "UNAUTHORIZED",
          message: "No active session",
        });
      }

      // Generate JWT token using better-auth's internal API
      const token = await authInstance.api.signJWT({
        body: {
          payload: {
            sub: session.user.id.toString(),
            email: session.user.email,
            role: session.user.role || "user",
            wallet: userWallet?.address ?? null,
          },
        },
      });

      return {
        walletToken: token,
        wallet: userWallet?.address ?? null,
      };
    } catch (error) {
      if (error instanceof TRPCError) {
        // Re-throw TRPC errors as-is
        throw error;
      }
      return handlePrismaError(error, "getWalletToken");
    }
  }),

  me: privateProcedure.query(async ({ ctx }) => {
    try {
      const userId = ctx.user!.sub;

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
          handle: user.handle,
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
        const authInstance = await auth;
        await authInstance.api.resetPassword({
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
});
