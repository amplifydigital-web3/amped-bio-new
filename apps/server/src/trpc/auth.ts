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

// Helper function to hash refresh tokens with SHA-256
function hashRefreshToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
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
async function handleTokenGeneration(ctx: any, user: User, imageUrl: string | null) {
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
      onelink: user.onelink || "",
      role: user.role,
      image: imageUrl,
    },
    accessToken: generateAccessToken({ id: user.id, email: user.email, role: user.role }),
  };
}

export const authRouter = router({
  // Register a new user
  register: publicProcedure.input(registerSchema).mutation(async ({ input, ctx }) => {
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
        onelink,
        name: onelink,
        email,
        password: hashedPassword,
        remember_token,
        role: userRole,
        theme: null,
      },
    });

    // Send verification email
    try {
      await sendEmailVerification(email, remember_token);
    } catch (error) {
      console.error("Error sending verification email:", error);
      // We continue even if email fails
    }

    const refreshToken = crypto.randomBytes(32).toString("hex");
    const hashedRefreshToken = hashRefreshToken(refreshToken);

    const token = await prisma.refreshToken.create({
      data: {
        userId: result.id,
        token: hashedRefreshToken,
        expiresAt: addDays(new Date(), 30), // 30 days
      },
    });

    // Set refresh token cookie
    setRefreshTokenCookie(ctx, refreshToken, token.expiresAt);

    return {
      user: { id: result.id, email, onelink, role: result.role, image: null },
      accessToken: generateAccessToken({ id: result.id, email, role: result.role }),
    };
  }),

  // Login user
  login: publicProcedure.input(loginSchema).mutation(async ({ input, ctx }) => {
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

    const refreshToken = crypto.randomBytes(32).toString("hex");
    const hashedRefreshToken = hashRefreshToken(refreshToken);

    const token = await prisma.refreshToken.create({
      data: {
        userId: user.id,
        token: hashedRefreshToken,
        expiresAt: addDays(new Date(), 30), // 30 days
      },
    });

    // Set refresh token cookie
    setRefreshTokenCookie(ctx, refreshToken, token.expiresAt);

    // Resolve user image URL (same as "me")
    const imageUrl = await getFileUrl({
      legacyImageField: user.image,
      imageFileId: user.image_file_id,
    });

    return {
      user: {
        id: user.id,
        email: user.email,
        onelink: user.onelink as string,
        // emailVerified,
        role: user.role,
        image: imageUrl,
      },
      accessToken: generateAccessToken({ id: user.id, email: user.email, role: user.role }),
    };
  }),

  logout: privateProcedure.mutation(async ({ ctx }) => {
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
  }),

  // Password reset request
  passwordResetRequest: publicProcedure
    .input(passwordResetRequestSchema)
    .mutation(async ({ input }) => {
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
    }),

  me: privateProcedure.query(async ({ ctx }) => {
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
      },
    };
  }),

  refreshToken: publicProcedure.mutation(async ({ ctx }) => {
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
        user: true,
      },
    });

    if (!existingToken) {
      throw new TRPCError({
        code: "UNAUTHORIZED",
        message: "Invalid refresh token",
      });
    }

    return {
      accessToken: generateAccessToken({
        id: existingToken.user.id,
        email: existingToken.user.email,
        role: existingToken.user.role,
      }),
    };
  }),

  // Process password reset
  processPasswordReset: publicProcedure
    .input(processPasswordResetSchema)
    .mutation(async ({ input }) => {
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
    }),

  // Send email verification
  sendVerifyEmail: publicProcedure
    .input(
      z.object({
        email: z.string().email(),
      })
    )
    .mutation(async ({ input }) => {
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
    }),

  getWalletToken: privateProcedure.query(async ({ ctx }) => {
    return {
      walletToken: generateAccessToken({
        id: ctx.user.sub,
        email: ctx.user.email,
        role: ctx.user.role,
      }),
    };
  }),

  // Google OAuth authentication
  googleAuth: publicProcedure.input(googleAuthSchema).mutation(async ({ input, ctx }) => {
    const { token } = input;

    try {
      // Verify Google token and get user info
      const googleUser = await verifyGoogleToken(token);

      if (!googleUser.email_verified) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Email not verified with Google",
        });
      }

      // Check if user with this email exists
      let user = await prisma.user.findUnique({
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
        const hashedPassword = await hashPassword(randomPassword);

        // Create user
        let userRole = "user";
        if (env.isDevelopment) {
          const totalUsersCount = await prisma.user.count();
          const isFirstUser = totalUsersCount === 0;
          userRole = isFirstUser ? "user,admin" : "user";
        }

        user = await prisma.user.create({
          data: {
            onelink,
            name: googleUser.name || onelink,
            email: googleUser.email,
            password: hashedPassword,
            email_verified_at: new Date(), // Email is already verified with Google
            image: null,
            role: userRole,
            theme: null,
          },
        });
      }

      // Resolve user image URL
      const imageUrl = await getFileUrl({
        legacyImageField: user.image,
        imageFileId: user.image_file_id,
      });

      // Return user data and access token using our utility function
      return handleTokenGeneration(ctx, user, imageUrl);
    } catch (error) {
      console.error("Google authentication error:", error);
      throw new TRPCError({
        code: "UNAUTHORIZED",
        message: error instanceof Error ? error.message : "Google authentication failed",
      });
    }
  }),
});
