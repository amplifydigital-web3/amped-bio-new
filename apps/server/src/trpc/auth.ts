import { router, publicProcedure, privateProcedure } from "./trpc";
import { z } from "zod";
import { PrismaClient } from "@prisma/client";
import { TRPCError } from "@trpc/server";
import crypto from "crypto";
import { sendEmailVerification, sendPasswordResetEmail } from "../utils/email/email";
import { hashPassword, comparePasswords } from "../utils/password";
import { generateToken } from "../utils/token";
import {
  registerSchema,
  loginSchema,
  passwordResetRequestSchema,
  processPasswordResetSchema,
  sendVerifyEmailSchema,
} from "../schemas/auth.schema";

const prisma = new PrismaClient();

export const authRouter = router({
  // Register a new user
  register: publicProcedure
    .input(registerSchema)
    .mutation(async ({ input }) => {
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

      // Create user
      const result = await prisma.user.create({
        data: {
          onelink,
          name: onelink,
          email,
          password: hashedPassword,
          remember_token,
        },
      });

      // Send verification email
      try {
        await sendEmailVerification(email, remember_token);
      } catch (error) {
        console.error("Error sending verification email:", error);
        // We continue even if email fails
      }

      // Return user data and token
      return {
        success: true,
        user: { id: result.id, email, onelink },
        token: generateToken({ id: result.id, email }),
      };
    }),

  // Login user
  login: publicProcedure
    .input(loginSchema)
    .mutation(async ({ input }) => {
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

      // Return user data and token
      return {
        success: true,
        user: { id: user.id, email: user.email, onelink: user.onelink!, emailVerified },
        token: generateToken({ id: user.id, email: user.email }),
      };
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

      if (user.password === hashedPassword) {
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
        success: true,
        message: "Password has been reset successfully",
      };
    }),

  // Send verification email
  sendVerifyEmail: publicProcedure
    .input(sendVerifyEmailSchema)
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

      // Generate verification token
      const remember_token = crypto.randomBytes(32).toString("hex");

      // Update user with token
      const updatedUser = await prisma.user.update({
        where: { id: user.id },
        data: { remember_token },
      });

      if (!updatedUser.remember_token) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Error generating token",
        });
      }

      // Send verification email
      try {
        await sendEmailVerification(email, remember_token);
      } catch (error) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Error sending email",
        });
      }

      return {
        success: true,
        message: "Email sent",
        results: "Email verification sent",
        email,
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
        success: true,
        message: "Email verified successfully",
        onelink: result.onelink,
        email,
      };
    }),
});