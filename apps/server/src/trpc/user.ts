import { privateProcedure, publicProcedure, router } from "./trpc";
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { sendEmailChangeVerification } from "../utils/email/email";
import { generateAccessToken } from "../utils/token";
import crypto from "crypto";
import { prisma } from "../services/DB";
import { editUserSchema } from "../schemas/user.schema";

// Schema for initiating email change
const initiateEmailChangeSchema = z.object({
  newEmail: z.string().email({ message: "Invalid email address format" }),
});

// Schema for resending email verification
const resendEmailVerificationSchema = z.object({
  newEmail: z.string().email({ message: "Invalid email address format" }),
});

// Schema for confirming email change
const confirmEmailChangeSchema = z.object({
  code: z.string().length(6, { message: "Verification code must be 6 digits" }),
  newEmail: z.string().email({ message: "Invalid email address format" }),
});

// Function to generate a random 6-digit code
const generateSixDigitCode = (): string => {
  return crypto.randomInt(100000, 1000000).toString();
};

type Creator = {
  id: string;
  username: string;
  displayName: string;
  avatar: string | null;
  banner: string | null;
  followers: number;
  following: number;
  verified: boolean;
  bio: string;
  totalEarnings: number;
  poolStake: number;
  category: string;
};

export const userRouter = router({
  // Edit user profile
  edit: privateProcedure.input(editUserSchema).mutation(async ({ ctx, input }) => {
    const userId = ctx.user.sub;
    console.group("🔄 User Edit Operation (tRPC)");
    console.info("📝 Starting user edit process");
    console.info(`👤 User ID: ${userId}`);

    const { name, description, theme, image, reward_business_id } = input;
    console.info(
      `📋 Edit data: ${JSON.stringify({ name, description, theme, image, reward_business_id })}`
    );

    try {
      console.info("💾 Updating user information");
      await prisma.user.update({
        where: { id: userId },
        data: {
          name,
          description,
          theme: `${theme}`,
          image,
          reward_business_id,
        },
      });
      console.info("✅ User updated successfully");

      console.groupEnd();
      return {
        message: "User updated successfully",
      };
    } catch (error) {
      console.error("❌ Error:", error);
      console.groupEnd();
      if (error instanceof TRPCError) throw error;
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: "Server error",
      });
    }
  }),

  // Initiate email change by requesting a verification code
  initiateEmailChange: privateProcedure
    .input(initiateEmailChangeSchema)
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.user.sub;

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

        // Check if the user has requested a code within the last minute
        const latestCode = await prisma.confirmationCode.findFirst({
          where: {
            userId,
            type: "EMAIL_CHANGE",
            createdAt: {
              gt: new Date(Date.now() - 60000), // 1 minute ago
            },
          },
          orderBy: {
            createdAt: "desc",
          },
        });

        if (latestCode) {
          // Calculate when the user can retry (1 minute after last request)
          const retryAfter = new Date(latestCode.createdAt);
          retryAfter.setMinutes(retryAfter.getMinutes() + 1);

          throw new TRPCError({
            code: "TOO_MANY_REQUESTS",
            message: "Please wait before requesting a new verification code",
            cause: {
              code: "RATE_LIMIT_EMAIL_VERIFICATION",
              retryAfter: retryAfter.toISOString(),
            },
          });
        }

        // Generate a 6-digit code
        const code = generateSixDigitCode();

        // Set expiration (5 minutes from now)
        const expiresAt = new Date();
        expiresAt.setMinutes(expiresAt.getMinutes() + 5);

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

  // Confirm email change with verification code
  confirmEmailChange: privateProcedure
    .input(confirmEmailChangeSchema)
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.user.sub;

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
        const updatedUser = await prisma.user.update({
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

        // Generate new JWT token with updated email
        const token = generateAccessToken({
          id: userId,
          email: newEmail,
          role: updatedUser.role,
        });

        return {
          success: true,
          message: "Email address has been successfully updated",
          token, // Return the new token
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

  // Resend email verification code without deleting existing ones
  resendEmailVerification: privateProcedure
    .input(resendEmailVerificationSchema)
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.user.sub;

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

        // Check if the user has requested a code within the last minute
        const latestCode = await prisma.confirmationCode.findFirst({
          where: {
            userId,
            type: "EMAIL_CHANGE",
            createdAt: {
              gt: new Date(Date.now() - 60000), // 1 minute ago
            },
          },
          orderBy: {
            createdAt: "desc",
          },
        });

        if (latestCode) {
          // Calculate when the user can retry (1 minute after last request)
          const retryAfter = new Date(latestCode.createdAt);
          retryAfter.setMinutes(retryAfter.getMinutes() + 1);

          throw new TRPCError({
            code: "TOO_MANY_REQUESTS",
            message: "Please wait before requesting a new verification code",
            cause: {
              code: "RATE_LIMIT_EMAIL_VERIFICATION",
              retryAfter: retryAfter.toISOString(),
            },
          });
        }

        // Generate a 6-digit code
        const code = generateSixDigitCode();

        // Set expiration (5 minutes from now)
        const expiresAt = new Date();
        expiresAt.setMinutes(expiresAt.getMinutes() + 5);

        // Create a new confirmation code without deleting existing ones
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
          message: "New verification code sent to your email",
          expiresAt,
        };
      } catch (error: any) {
        if (error instanceof TRPCError) {
          throw error;
        }

        console.error("Error resending email verification:", error);
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to resend email verification code",
        });
      }
    }),
    getUsers: publicProcedure
    .input(
      z.object({
        search: z.string().optional(),
      })
    )
    .query(async ({ input }): Promise<Creator[]> => {
      const users = await prisma.user.findMany({
        where: {
          name: {
            contains: input.search,
          },
        },
        select: {
          id: true,
          name: true,
          onelink: true,
          image: true,
          description: true,
        },
      });

      return users.map((user) => ({
        id: user.id.toString(),
        displayName: user.name,
        username: user.onelink || "",
        avatar: user.image,
        bio: user.description || "",
        banner: null, // Placeholder
        followers: 0, 
        following: 0,
        verified: false,
        totalEarnings: 0,
        poolStake: 0,
        category: "uncategorized",
      }));
    }),
});
