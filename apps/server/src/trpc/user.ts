import { privateProcedure, publicProcedure, router } from "./trpc";
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { sendEmailChangeVerification } from "../utils/email/email";
import { generateAccessToken } from "../utils/token";
import { hashRefreshToken } from "../utils/tokenHash";
import crypto from "crypto";
import { prisma } from "../services/DB";
import { editUserSchema } from "../schemas/user.schema";
import Decimal from "decimal.js";

// Schema for initiating email change
const initiateEmailChangeSchema = z.object({
  currentEmail: z.string().email({ message: "Invalid current email address format" }),
  newEmail: z.string().email({ message: "Invalid new email address format" }),
});

// Schema for resending email verification
const resendEmailVerificationSchema = z.object({
  currentEmail: z.string().email({ message: "Invalid current email address format" }),
  newEmail: z.string().email({ message: "Invalid new email address format" }),
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
  bio: string;
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

    const { name, description, theme, image, reward_business_id, revo_name } = input;
    console.info(
      `📋 Edit data: ${JSON.stringify({ name, description, theme, image, reward_business_id, revo_name })}`
    );

    try {
      console.info("💾 Updating user information");
      await prisma.user.update({
        where: { id: userId },
        data: {
          name,
          description,
          revo_name,
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

        // Verify that the current email matches the user's actual email
        if (user.email !== input.currentEmail) {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: "Current email does not match your account email",
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

        // Send verification email with the code to the user's current email
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

        // Delete all refresh tokens except for the current session's token
        // Get the current refresh token from the request
        const currentRefreshToken = ctx.req.cookies["refresh-token"];
        if (currentRefreshToken) {
          const hashedCurrentRefreshToken = hashRefreshToken(currentRefreshToken);

          // Delete all refresh tokens for this user except the current one
          await prisma.refreshToken.deleteMany({
            where: {
              userId: userId,
              token: {
                not: hashedCurrentRefreshToken, // Keep only the current token
              },
            },
          });
        } else {
          // If no refresh token is available in the request, delete all refresh tokens
          await prisma.refreshToken.deleteMany({
            where: {
              userId: userId,
            },
          });
        }

        // Fetch user's wallet address
        const userWallet = await prisma.userWallet.findUnique({
          where: { userId: userId },
          select: { address: true },
        });

        // Generate new JWT token with updated email
        const token = generateAccessToken({
          id: userId,
          email: newEmail,
          role: updatedUser.role,
          wallet: userWallet?.address ?? null,
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

        // Verify that the current email matches the user's actual email
        if (user.email !== input.currentEmail) {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: "Current email does not match your account email",
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

        // Send verification email with the code to the user's current email
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
        filter: z
          .enum(["all", "active-7-days", "has-creator-pool", "has-stake-in-pool"])
          .optional()
          .default("all"),
        sort: z
          .enum(["newest", "name-asc", "name-desc", "stake-desc"])
          .optional()
          .default("newest"),
        page: z.number().optional().default(1),
        limit: z.number().optional().default(20), // Default to 20 users per page, max 20
      })
    )
    .query(async ({ input }): Promise<{ users: Creator[]; total: number }> => {
      // Ensure limit doesn't exceed 20
      const safeLimit = Math.min(input.limit || 20, 20);
      const safePage = Math.max(input.page || 1, 1);

      // Build the base where clause based on search
      const whereClause: any = {};
      if (input.search) {
        whereClause.name = {
          contains: input.search,
        };
      }

      // Apply database-level filtering based on the filter type
      let usersWithStakes;

      if (
        input.filter === "has-creator-pool" ||
        input.filter === "has-stake-in-pool" ||
        input.sort === "stake-desc"
      ) {
        // For filters requiring stake information, join with related tables
        usersWithStakes = await prisma.user.findMany({
          where: whereClause,
          select: {
            id: true,
            name: true,
            onelink: true,
            image: true,
            description: true,
            created_at: true,
            wallet: {
              select: {
                id: true,
                stakedPools: {
                  select: {
                    stakeAmount: true,
                  },
                },
              },
            },
          },
        });

        // Calculate total stake per user and filter in memory (this is unavoidable for this filter)
        const usersWithCalculatedStakes = usersWithStakes
          .map(user => {
            // Calculate total stake by flattening the staked pools using Decimal for precision
            const totalStake = (user.wallet?.stakedPools || []).reduce(
              (walletAcc: number, stakedPool: any) => {
                return new Decimal(walletAcc).add(new Decimal(stakedPool.stakeAmount)).toNumber();
              },
              0
            );

            return {
              user: {
                id: user.id,
                name: user.name,
                onelink: user.onelink,
                image: user.image,
                description: user.description,
                created_at: user.created_at,
              },
              totalStake,
            };
          })
          .filter(item => item.totalStake > 0); // Apply the "has stake" filter

        // Apply sorting to the filtered results
        switch (input.sort) {
          case "name-asc":
            usersWithCalculatedStakes.sort((a, b) => a.user.name.localeCompare(b.user.name));
            break;
          case "name-desc":
            usersWithCalculatedStakes.sort((a, b) => b.user.name.localeCompare(a.user.name));
            break;
          case "newest":
            usersWithCalculatedStakes.sort(
              (a, b) => b.user.created_at.getTime() - a.user.created_at.getTime()
            );
            break;
          case "stake-desc":
            usersWithCalculatedStakes.sort((a, b) => b.totalStake - a.totalStake);
            break;
          default:
            break;
        }

        // Apply pagination
        const total = usersWithCalculatedStakes.length;
        const startIndex = (safePage - 1) * safeLimit;
        const endIndex = startIndex + safeLimit;
        const paginatedUsers = usersWithCalculatedStakes.slice(startIndex, endIndex);

        return {
          users: paginatedUsers.map(item => ({
            id: item.user.id.toString(),
            displayName: item.user.name,
            username: item.user.onelink || "",
            avatar: item.user.image,
            bio: item.user.description || "",
            banner: null, // Placeholder
            poolStake: item.totalStake, // Use the calculated total stake
            category: "uncategorized",
          })),
          total,
        };
      } else {
        // For filters that don't require stake information, use efficient database queries
        // Apply sorting at the database level
        let orderBy: any = {};
        switch (input.sort) {
          case "name-asc":
            orderBy = { name: "asc" };
            break;
          case "name-desc":
            orderBy = { name: "desc" };
            break;
          case "newest":
            orderBy = { created_at: "desc" };
            break;
          default:
            break;
        }

        // Get count for pagination
        const total = await prisma.user.count({ where: whereClause });

        // Get paginated users with sorting applied at DB level
        const paginatedUsers = await prisma.user.findMany({
          where: whereClause,
          select: {
            id: true,
            name: true,
            onelink: true,
            image: true,
            description: true,
            created_at: true,
          },
          orderBy,
          skip: (safePage - 1) * safeLimit,
          take: safeLimit,
        });

        // Calculate stakes for only the paginated users (more efficient)
        const userIds = paginatedUsers.map(user => user.id);
        const userWallets = await prisma.userWallet.findMany({
          where: {
            userId: {
              in: userIds,
            },
          },
          select: {
            id: true,
            userId: true,
          },
        });

        const stakedPools = await prisma.stakedPool.findMany({
          where: {
            userWalletId: {
              in: userWallets.map(wallet => wallet.id),
            },
          },
          select: {
            userWalletId: true,
            stakeAmount: true,
          },
        });

        // Calculate total stake per user using Decimal for precision
        const stakeAmountMap: Record<number, number> = {};
        stakedPools.forEach(stake => {
          const userId = userWallets.find(wallet => wallet.id === stake.userWalletId)?.userId;
          if (userId) {
            const amount = new Decimal(stake.stakeAmount).toNumber();
            stakeAmountMap[userId] = new Decimal(stakeAmountMap[userId] || 0)
              .add(amount)
              .toNumber();
          }
        });

        return {
          users: paginatedUsers.map(user => ({
            id: user.id.toString(),
            displayName: user.name,
            username: user.onelink || "",
            avatar: user.image,
            bio: user.description || "",
            banner: null, // Placeholder
            poolStake: stakeAmountMap[user.id] || 0, // Use the calculated total stake
            category: "uncategorized",
          })),
          total,
        };
      }
    }),
});
