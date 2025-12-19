import { router, publicProcedure, privateProcedure } from "./trpc";
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { verifyRecaptcha } from "../utils/recaptcha";
import crypto from "crypto";
import { sendPasswordResetEmail, sendEmailVerification } from "../utils/email/email";
import { hashPassword, comparePasswords } from "../utils/password";
import { generateAccessToken } from "../utils/token";
import { getFileUrl } from "../utils/fileUrlResolver";
import { verifyGoogleToken } from "../utils/google-auth";
import {
  registerSchema,
  loginSchema,
  passwordResetRequestSchema,
  processPasswordResetSchema,
} from "../schemas/auth.schema";
import { googleAuthSchema } from "../schemas/google-auth.schema";
import { serialize } from "cookie";
import { env } from "../env";
import { prisma } from "../services/DB";
import type { User } from "@prisma/client";

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

// Token generation and cookie setting are now handled by Better Auth

export const authRouter = router({
  // Register a new user
  register: publicProcedure.input(registerSchema).mutation(async ({ input }) => {
    try {
      const { onelink, email, password, recaptchaToken } = input;

      // Verify reCAPTCHA token
      const isRecaptchaValid = await verifyRecaptcha(recaptchaToken);
      if (!isRecaptchaValid) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "reCAPTCHA verification failed",
        });
      }

      // Check if onelink already exists
      const existingOnelinkCount = await prisma.user.count({
        where: { onelink },
      });

      if (existingOnelinkCount > 0) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "URL already taken",
        });
      }

      // Check if email already exists
      const existingUserCount = await prisma.user.count({
        where: { email },
      });

      if (existingUserCount > 0) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Email already registered",
        });
      }

      // Hash password
      const hashedPassword = await hashPassword(password);

      let userRole = "user";

      if (env.isDevelopment) {
        const totalUsersCount = await prisma.user.count();
        const isFirstUser = totalUsersCount === 0;
        userRole = isFirstUser ? "user,admin" : "user";
      }

      // Create user
      const result = await prisma.user.create({
        data: {
          onelink,
          name: onelink,
          email,
          password: hashedPassword,
          role: userRole,
          theme: null,
        },
      });

      // // Send verification email
      // try {
      //   await sendEmailVerification(email, remember_token);
      // } catch (error) {
      //   console.error("Error sending verification email:", error);
      //   // We continue even if email fails
      // }

      return {
        success: true,
        message: "User registered successfully",
        user: {
          id: result.id,
          email: result.email,
        },
      };
    } catch (error) {
      if (error instanceof TRPCError) {
        // Re-throw TRPC errors as-is
        throw error;
      }
      return handlePrismaError(error, "register");
    }
  }),

  // Login user
  login: publicProcedure.input(loginSchema).mutation(async ({ input }) => {
    try {
      const { email, password, recaptchaToken } = input;

      // Verify reCAPTCHA token
      const isRecaptchaValid = await verifyRecaptcha(recaptchaToken);
      if (!isRecaptchaValid) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "reCAPTCHA verification failed",
        });
      }

      // Find user
      const user = await prisma.user.findUnique({
        where: { email },
      });

      if (!user) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Invalid credentials",
        });
      }

      // Verify password
      if (!user.password) {
        throw new TRPCError({
          code: "UNAUTHORIZED",
          message: "No password set for this account. Try social login.",
        });
      }

      const isValidPassword = await comparePasswords(password, user.password);

      if (!user.password || !isValidPassword) {
        throw new TRPCError({
          code: "UNAUTHORIZED",
          message: "Invalid credentials",
        });
      }

      // const email_verified = user.email_verified_at !== null;

      // Resolve user image URL (same as "me")
      const imageUrl = await getFileUrl({
        legacyImageField: user.image,
        imageFileId: user.image_file_id,
      });

      // Fetch user's wallet address
      const userWallet = await prisma.userWallet.findUnique({
        where: { userId: user.id },
        select: { address: true },
      });

      // Return user data and access token
      return {
        user: {
          id: user.id,
          email: user.email,
          onelink: user.onelink || "",
          role: user.role,
          image: imageUrl,
          wallet: userWallet?.address || null,
          hasPool: false,
        },
        accessToken: generateAccessToken({
          id: user.id,
          email: user.email,
          role: user.role,
          wallet: userWallet?.address || null,
        }),
      };
    } catch (error) {
      if (error instanceof TRPCError) {
        // Re-throw TRPC errors as-is
        throw error;
      }
      return handlePrismaError(error, "login");
    }
  }),

  logout: privateProcedure.mutation(async ({ ctx }) => {
    // Logout is now primarily handled by better-auth on the client side
    // but we can clear our legacy cookies just in case
    ctx.res.setHeader("Set-Cookie", serialize("refresh-token", "", { maxAge: -1, path: "/" }));

    return { success: true, message: "Logged out successfully" };
  }),

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

        // Update user (transitional logic)
        const updatedUser = await prisma.user.update({
          where: { id: user.id },
          data: { email_verified: false }, // Reset verification if it was used for password reset
        });

        if (!updatedUser) {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: "Failed to update user",
          });
        }

        // Send reset email
        try {
          await sendPasswordResetEmail(updatedUser.email, "RESET_TOKEN_PENDING");
        } catch (error) {
          console.error("Error sending password reset email:", error);
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: "Error sending password reset email",
          });
        }

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
        return handlePrismaError(error, "passwordResetRequest");
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
          role: user.role,
          image: imageUrl,
          wallet: userWallet?.address || null,
          hasPool: false,
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

  refreshToken: publicProcedure.mutation(async () => {
    throw new TRPCError({
      code: "NOT_IMPLEMENTED",
      message: "Refresh token is now handled by Better Auth",
    });
  }),

  // Process password reset
  processPasswordReset: publicProcedure
    .input(processPasswordResetSchema)
    .mutation(async ({ input }) => {
      try {
        const { newPassword } = input;

        // Transitional logic: using email to find user
        const user = await prisma.user.findUnique({
          where: { email: input.email },
        });

        if (!user) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "User not found",
          });
        }

        // Hash new password
        const hashedPassword = await hashPassword(newPassword);
        const isSamePassword = user.password
          ? await comparePasswords(newPassword, user.password)
          : false;

        if (isSamePassword) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "New password must be different than old password",
          });
        }

        // Update user with new password
        await prisma.user.update({
          where: { id: user.id },
          data: {
            password: hashedPassword,
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
        return handlePrismaError(error, "processPasswordReset");
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
        const { email } = input;

        // Transitional logic for verifyEmail
        const user = await prisma.user.findUnique({
          where: { email },
        });

        if (!user) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "User not found",
          });
        }

        // Update user as verified
        const result = await prisma.user.update({
          where: { id: user.id },
          data: {
            email_verified: true,
            email_verified_at: new Date(),
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

        // Send verification email
        try {
          await sendEmailVerification(user.email, "VERIFY_TOKEN_PENDING");
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

  // Google OAuth authentication
  googleAuth: publicProcedure.input(googleAuthSchema).mutation(async ({ input }) => {
    try {
      const { token } = input;

      // Verify Google token and get user info
      const googleUser = await verifyGoogleToken(token);

      if (!googleUser.email_verified) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Email not verified with Google",
        });
      }

      // Check if user with this email exists
      let user: User | null = await prisma.user.findUnique({
        where: { email: googleUser.email },
      });

      if (!user) {
        // User doesn't exist, create a new one
        // Generate onelink from email (use part before @)
        let onelink = googleUser.email.split("@")[0].toLowerCase();

        // Clean onelink (remove special chars)
        onelink = onelink.replace(/[^a-z0-9_-]/g, "");

        // Check if onelink exists
        const existingOnelink = await prisma.user.findFirst({
          where: { onelink },
        });

        if (existingOnelink) {
          // Append random string to make onelink unique
          onelink = `${onelink}${Math.random().toString(36).substring(2, 6)}`;
        }

        // Generate a random password
        const randomPassword = crypto.randomBytes(16).toString("hex");
        const hashedPassword: string = await hashPassword(randomPassword);

        // Create user
        let userRole = "user";
        if (env.isDevelopment) {
          const totalUsersCount = await prisma.user.count();
          const isFirstUser = totalUsersCount === 0;
          userRole = isFirstUser ? "user,admin" : "user";
        }

        const newUser = await prisma.user.create({
          data: {
            onelink,
            name: googleUser.name || onelink,
            email: googleUser.email,
            password: hashedPassword,
            email_verified: true,
            email_verified_at: new Date(), // Email is already verified with Google
            image: null,
            role: userRole,
            theme: null,
          },
        });
        user = newUser;
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

      // Return user data and access token
      return {
        user: {
          id: user.id,
          email: user.email,
          onelink: user.onelink || "",
          role: user.role,
          image: imageUrl,
          wallet: userWallet?.address || null,
          hasPool: false,
        },
        accessToken: generateAccessToken({
          id: user.id,
          email: user.email,
          role: user.role,
          wallet: userWallet?.address || null,
        }),
      };
    } catch (error) {
      if (error instanceof TRPCError) {
        // Re-throw TRPC errors as-is
        throw error;
      }
      return handlePrismaError(error, "googleAuth");
    }
  }),
});
