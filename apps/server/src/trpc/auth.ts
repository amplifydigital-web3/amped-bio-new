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
import { addDays } from "date-fns";
import { prisma } from "../services/DB";
import type { User } from "@prisma/client";
import { hashRefreshToken } from "../utils/tokenHash";

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

// Helper function to set refresh token cookie
function setRefreshTokenCookie(ctx: any, token: string, expiresAt?: Date) {
  // Determine the correct domain based on environment
  let domain: string | undefined;

  if (env.NODE_ENV === "production" || env.NODE_ENV === "staging") {
    // Extract domain from FRONTEND_URL
    if (env.FRONTEND_URL) {
      try {
        const url = new URL(env.FRONTEND_URL);
        // Remove 'www.' if present and add leading dot for subdomain support
        domain = url.hostname.replace(/^www\./, "");
        domain = `.${domain}`;

        console.log("Cookie debug - Using FRONTEND_URL domain:", domain);
      } catch (error) {
        console.error("Cookie debug - Invalid FRONTEND_URL:", env.FRONTEND_URL, error);
      }
    }
  }
  // For development, don't set domain (localhost)

  const options = {
    httpOnly: true,
    secure: env.NODE_ENV === "production" || env.NODE_ENV === "staging",
    sameSite: "lax" as const,
    domain,
    path: "/",
    expires: expiresAt || new Date(0), // Default to immediate expiry for logout
  };

  console.log("Cookie debug - Final options:", options);

  const cookieString = serialize("refresh-token", token, options);
  const existingCookies = ctx.res.getHeader("Set-Cookie") || [];
  const cookiesArray = Array.isArray(existingCookies)
    ? existingCookies.map(String)
    : [String(existingCookies)];

  ctx.res.setHeader("Set-Cookie", [...cookiesArray, cookieString]);
}

// Helper function to handle token generation and cookie setting
async function handleTokenGeneration(
  ctx: any,
  user: User,
  imageUrl: string | null,
  hasPool: boolean
) {
  // Fetch user's wallet address
  const userWallet = await prisma.userWallet.findUnique({
    where: { userId: user.id },
    select: { address: true },
  });

  // Generate refresh token
  const refreshToken = crypto.randomBytes(32).toString("hex");
  const hashedRefreshToken = hashRefreshToken(refreshToken);

  // Create refresh token in database
  const token = await prisma.refreshToken.create({
    data: {
      userId: user.id,
      token: hashedRefreshToken,
      expiresAt: addDays(new Date(), 30), // 30 days
    },
  });

  // Set refresh token cookie
  setRefreshTokenCookie(ctx, refreshToken, token.expiresAt);

  // Return user data and access token
  return {
    user: {
      id: user.id,
      email: user.email,
      handle: user.handle || "",
      role: user.role,
      image: imageUrl,
      wallet: userWallet?.address || null,
      hasPool,
    },
    accessToken: generateAccessToken({
      id: user.id,
      email: user.email,
      role: user.role,
      wallet: userWallet?.address || null,
    }),
  };
}

export const authRouter = router({
  // Register a new user
  register: publicProcedure.input(registerSchema).mutation(async ({ input, ctx }) => {
    try {
      const { onelink: handle, email, password, recaptchaToken } = input;

      // Verify reCAPTCHA token
      const isRecaptchaValid = await verifyRecaptcha(recaptchaToken);
      if (!isRecaptchaValid) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "reCAPTCHA verification failed",
        });
      }

      // Check if handle already exists
      const existingHandleCount = await prisma.user.count({
        where: { handle },
      });

      if (existingHandleCount > 0) {
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

      // Hash password and create remember token
      const hashedPassword = await hashPassword(password);
      const remember_token = crypto.randomBytes(32).toString("hex");

      let userRole = "user";

      if (env.isDevelopment) {
        const totalUsersCount = await prisma.user.count();
        const isFirstUser = totalUsersCount === 0;
        userRole = isFirstUser ? "user,admin" : "user";
      }

      // Create user
      const result = await prisma.user.create({
        data: {
          handle,
          name: handle,
          email,
          password: hashedPassword,
          remember_token,
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

      return handleTokenGeneration(ctx, result, null, false);
    } catch (error) {
      if (error instanceof TRPCError) {
        // Re-throw TRPC errors as-is
        throw error;
      }
      return handlePrismaError(error, "register");
    }
  }),

  // Login user
  login: publicProcedure.input(loginSchema).mutation(async ({ input, ctx }) => {
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
      const isValidPassword = await comparePasswords(password, user.password);

      if (!isValidPassword) {
        throw new TRPCError({
          code: "UNAUTHORIZED",
          message: "Invalid credentials",
        });
      }

      // const emailVerified = user.email_verified_at !== null;

      // Resolve user image URL (same as "me")
      const imageUrl = await getFileUrl({
        legacyImageField: user.image,
        imageFileId: user.image_file_id,
      });

      return handleTokenGeneration(
        ctx,
        user,
        imageUrl,
        false // Placeholder - we'll need to determine this differently since pools are now related to wallet
      );
    } catch (error) {
      if (error instanceof TRPCError) {
        // Re-throw TRPC errors as-is
        throw error;
      }
      return handlePrismaError(error, "login");
    }
  }),

  logout: privateProcedure.mutation(async ({ ctx }) => {
    try {
      const refreshToken = ctx.req.cookies["refresh-token"];

      if (!refreshToken) {
        throw new TRPCError({
          code: "UNAUTHORIZED",
          message: "No refresh token provided",
        });
      }

      const hashedRefreshToken = hashRefreshToken(refreshToken);

      // Delete the refresh token
      await prisma.refreshToken.deleteMany({
        where: { token: hashedRefreshToken },
      });

      // Clear the cookie
      setRefreshTokenCookie(ctx, "");

      return { success: true, message: "Logged out successfully" };
    } catch (error) {
      if (error instanceof TRPCError) {
        // Re-throw TRPC errors as-is
        throw error;
      }
      return handlePrismaError(error, "logout");
    }
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

        // Generate reset token
        const remember_token = crypto.randomBytes(32).toString("hex");

        // Update user with token
        const updatedUser = await prisma.user.update({
          where: { id: user.id },
          data: { remember_token },
        });

        if (!updatedUser.remember_token) {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: "Failed to generate token",
          });
        }

        // Send reset email
        try {
          await sendPasswordResetEmail(updatedUser.email, updatedUser.remember_token);
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

  refreshToken: publicProcedure.mutation(async ({ ctx }) => {
    try {
      // delete all expired tokens
      await prisma.refreshToken.deleteMany({
        where: {
          expiresAt: {
            lt: new Date(),
          },
        },
      });

      const refreshToken = ctx.req.cookies["refresh-token"];

      if (!refreshToken) {
        throw new TRPCError({
          code: "UNAUTHORIZED",
          message: "No refresh token provided",
        });
      }

      const hashedRefreshToken = hashRefreshToken(refreshToken);

      // Find existing refresh token
      const existingToken = await prisma.refreshToken.findFirst({
        where: { token: hashedRefreshToken },
        select: {
          user: {
            include: {
              wallet: true,
            },
          },
        },
      });

      if (!existingToken || !existingToken.user) {
        throw new TRPCError({
          code: "UNAUTHORIZED",
          message: "Invalid refresh token",
        });
      }

      const walletAddress = existingToken.user.wallet ? existingToken.user.wallet.address : null;

      return {
        accessToken: generateAccessToken({
          id: existingToken.user.id,
          email: existingToken.user.email,
          role: existingToken.user.role,
          wallet: walletAddress,
        }),
      };
    } catch (error) {
      if (error instanceof TRPCError) {
        // Re-throw TRPC errors as-is
        throw error;
      }
      return handlePrismaError(error, "refreshToken");
    }
  }),

  // Process password reset
  processPasswordReset: publicProcedure
    .input(processPasswordResetSchema)
    .mutation(async ({ input }) => {
      try {
        const { token: requestToken, newPassword } = input;

        // Find user with token
        const user = await prisma.user.findFirst({
          where: { remember_token: requestToken },
        });

        if (!user) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Invalid reset token",
          });
        }

        // Hash new password
        const hashedPassword = await hashPassword(newPassword);
        const isSamePassword = await comparePasswords(newPassword, user.password);

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
            remember_token: null,
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
          handle: result.handle,
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

  // Google OAuth authentication
  googleAuth: publicProcedure.input(googleAuthSchema).mutation(async ({ input, ctx }) => {
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
        // Generate handle from email (use part before @)
        let handle = googleUser.email.split("@")[0].toLowerCase();

        // Clean handle (remove special chars)
        handle = handle.replace(/[^a-z0-9_-]/g, "");

        // Check if handle exists
        const existingHandle = await prisma.user.findFirst({
          where: { handle },
        });

        if (existingHandle) {
          // Append random string to make handle unique
          handle = `${handle}${Math.random().toString(36).substring(2, 6)}`;
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
            handle,
            name: googleUser.name || handle,
            email: googleUser.email,
            password: hashedPassword,
            email_verified_at: new Date(), // Email is already verified with Google
            image: null,
            role: userRole,
            theme: null,
          },
        });
        user = { ...newUser };
      }

      // Resolve user image URL
      const imageUrl = await getFileUrl({
        legacyImageField: user.image,
        imageFileId: user.image_file_id,
      });

      // Return user data and access token using our utility function
      return handleTokenGeneration(
        ctx,
        user,
        imageUrl,
        false // Placeholder - we'll need to determine this differently since pools are now related to wallet
      );
    } catch (error) {
      if (error instanceof TRPCError) {
        // Re-throw TRPC errors as-is
        throw error;
      }
      return handlePrismaError(error, "googleAuth");
    }
  }),
});
