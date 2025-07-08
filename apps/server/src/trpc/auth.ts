import { router, publicProcedure, privateProcedure } from "./trpc";
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import crypto from "crypto";
import { sendPasswordResetEmail } from "../utils/email/email";
import { hashPassword, comparePasswords } from "../utils/password";
import { generateAccessToken } from "../utils/token";
import {
  registerSchema,
  loginSchema,
  passwordResetRequestSchema,
  processPasswordResetSchema,
} from "../schemas/auth.schema";
import { serialize } from "cookie";
import { env } from "../env";
import { addDays } from "date-fns";
import { prisma } from "../services/DB";

// Helper function to hash refresh tokens with SHA-256
function hashRefreshToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

export const authRouter = router({
  // Register a new user
  register: publicProcedure.input(registerSchema).mutation(async ({ input, ctx }) => {
    const { onelink, email, password } = input;

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
      },
    });

    // Send verification email
    // try {
    //   await sendEmailVerification(email, remember_token);
    // } catch (error) {
    //   console.error("Error sending verification email:", error);
    //   // We continue even if email fails
    // }

    const refreshToken = crypto.randomBytes(32).toString("hex");
    const hashedRefreshToken = hashRefreshToken(refreshToken);

    const token = await prisma.refreshToken.create({
      data: {
        userId: result.id,
        token: hashedRefreshToken,
        expiresAt: addDays(new Date(), 30), // 30 days
      },
    });

    ctx.res.setHeader(
      "Set-Cookie",
      serialize("refreshToken", refreshToken, {
        httpOnly: true,
        secure: env.NODE_ENV === "production",
        sameSite: "strict",
        expires: token.expiresAt,
      })
    );

    return {
      user: { id: result.id, email, onelink, role: result.role },
      accessToken: generateAccessToken({ id: result.id, email, role: result.role }),
    };
  }),

  // Login user
  login: publicProcedure.input(loginSchema).mutation(async ({ input, ctx }) => {
    const { email, password } = input;

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

    const emailVerified = user.email_verified_at !== null;

    const refreshToken = crypto.randomBytes(32).toString("hex");
    const hashedRefreshToken = hashRefreshToken(refreshToken);

    const token = await prisma.refreshToken.create({
      data: {
        userId: user.id,
        token: hashedRefreshToken,
        expiresAt: addDays(new Date(), 30), // 30 days
      },
    });

    ctx.res.setHeader(
      "Set-Cookie",
      serialize("refreshToken", refreshToken, {
        httpOnly: true,
        secure: env.NODE_ENV === "production",
        sameSite: "strict",
        expires: token.expiresAt,
      })
    );

    return {
      user: {
        id: user.id,
        email: user.email,
        onelink: user.onelink!,
        emailVerified,
        role: user.role,
      },
      accessToken: generateAccessToken({ id: user.id, email: user.email, role: user.role }),
    };
  }),

  logout: privateProcedure.mutation(async ({ ctx }) => {
    const refreshToken = ctx.req.cookies.refreshToken;

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
    ctx.res.setHeader(
      "Set-Cookie",
      serialize("refreshToken", "", {
        httpOnly: true,
        secure: env.NODE_ENV === "production",
        sameSite: "strict",
        expires: new Date(0), // Expire immediately
      })
    );

    return { success: true, message: "Logged out successfully" };
  }),

  // Password reset request
  passwordResetRequest: publicProcedure
    .input(passwordResetRequestSchema)
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

    return {
      user: {
        id: user.id,
        email: user.email,
        onelink: user.onelink,
        emailVerified: user.email_verified_at !== null,
        role: user.role,
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

    const refreshToken = ctx.req.cookies.refreshToken;

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
});
