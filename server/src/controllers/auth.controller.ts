import { Request, Response } from "express";
import { PrismaClient } from "@prisma/client";
import { sendEmailVerification, sendPasswordResetEmail } from "../utils/email/email";
import { hashPassword, comparePasswords } from "../utils/password";
import { generateToken } from "../utils/token";
import crypto from "crypto";
import { ValidatedRequest } from "../middleware/validation.middleware";
import {
  RegisterInput,
  LoginInput,
  PasswordResetRequestInput,
  ProcessPasswordResetInput,
  SendVerifyEmailInput,
} from "../schemas/auth.schema";

const prisma = new PrismaClient();

export const authController = {
  async register(req: Request, res: Response) {
    const { onelink, email, password } = (req as ValidatedRequest<RegisterInput>).validatedData;

    console.log("Got Register Request: ", onelink, email);

    try {
      const existingOnelinkCount = await prisma.user.count({
        where: {
          onelink: onelink,
        },
      });

      if (existingOnelinkCount > 0) {
        return res.status(400).json({ success: false, message: "URL already taken" });
      }

      const existingUserCount = await prisma.user.count({
        where: {
          email: email,
        },
      });

      if (existingUserCount > 0) {
        return res.status(400).json({ success: false, message: "Email already registered" });
      }

      const hashedPassword = await hashPassword(password);
      const remember_token = crypto.randomBytes(32).toString("hex");

      const result = await prisma.user.create({
        data: {
          onelink,
          name: onelink,
          email,
          password: hashedPassword,
          remember_token: remember_token,
        },
      });

      try {
        sendEmailVerification(email, remember_token);
      } catch (error) {
        res.status(500).json({ success: false, message: "Error sending email" });
      }

      res.status(201).json({
        success: true,
        user: { id: result.id, email, onelink },
      });
    } catch (error) {
      console.error("error", error);
      res.status(500).json({ success: false, message: "Server error" });
    }
  },

  async login(req: Request, res: Response) {
    const { email, password } = (req as ValidatedRequest<LoginInput>).validatedData;

    console.info("Got Login Request:", email);

    try {
      const user = await prisma.user.findUnique({
        where: {
          email: email,
        },
      });

      if (user === null) {
        return res.status(400).json({ success: false, message: "Invalid credentials" });
      }

      console.log("user", user);

      const isValidPassword = await comparePasswords(password, user.password);

      if (!isValidPassword) {
        return res.status(401).json({ success: false, message: "Invalid credentials" });
      } else {
        const token = generateToken({ id: user.id, email: user.email });
        const emailVerified = user.email_verified_at !== null;

        return res.json({
          success: true,
          user: { id: user.id, email: user.email, onelink: user.onelink, emailVerified },
          token,
        });
      }
    } catch (error) {
      console.error("error", error);
      res.status(500).json({ success: false, message: "Server error" });
    }
  },

  async passwordResetRequest(req: Request, res: Response) {
    const { email } = (req as ValidatedRequest<PasswordResetRequestInput>).validatedData;

    try {
      const user = await prisma.user.findUnique({
        where: {
          email: email,
        },
      });

      if (user === null) {
        return res.status(400).json({
          success: false,
          message: "User not found",
        });
      }

      const remember_token = crypto.randomBytes(32).toString("hex");

      return prisma.user
        .update({
          where: { id: user.id },
          data: {
            remember_token: remember_token,
          },
        })
        .then(result => {
          if (!result.remember_token) {
            throw new Error(`Token write failed: user_id: ${user.id}`);
          }
          return sendPasswordResetEmail(result.email, result.remember_token);
        })
        .then(
          () => {
            res.json({
              success: true,
              message: "Password reset email sent",
              email: email,
            });
          },
          error => {
            res.status(500).json({
              success: false,
              message: "Error sending password reset email",
              error: error.message,
            });
          }
        );
    } catch (error) {
      console.error("error", error);
      res.status(500).json({
        success: false,
        message: "Server error",
      });
    }
  },

  async processPasswordReset(req: Request, res: Response) {
    const { token: requestToken, newPassword } = (
      req as ValidatedRequest<ProcessPasswordResetInput>
    ).validatedData;

    try {
      const user = await prisma.user.findFirst({
        where: {
          remember_token: requestToken,
        },
      });

      if (!user) {
        return res.status(400).json({
          success: false,
          message: "Invalid reset token",
        });
      }

      const hashedPassword = await hashPassword(newPassword);

      if (user.password === hashedPassword) {
        return res.status(400).json({
          success: false,
          message: "New password must be different than old password",
        });
      }

      await prisma.user.update({
        where: { id: user.id },
        data: {
          password: hashedPassword,
          remember_token: null,
        },
      });

      return res.json({
        success: true,
        message: "Password has been reset successfully",
      });
    } catch (error) {
      console.error("error", error);
      res.status(500).json({
        success: false,
        message: "Server error",
      });
    }
  },

  async sendVerifyEmail(req: Request, res: Response) {
    const { email } = (req as ValidatedRequest<SendVerifyEmailInput>).validatedData;

    console.log("Got send verify email request: ", email);
    try {
      const user = await prisma.user.findUnique({
        where: {
          email: email,
        },
      });

      if (user === null) {
        return res.status(400).json({
          success: false,
          message: "User not found",
        });
      }

      // Commented for testing!!!!
      // if (user.email_verified_at !== null) {
      //   return res.status(400).json({ message: 'Email already verified' });
      // }

      const remember_token = crypto.randomBytes(32).toString("hex");

      return prisma.user
        .update({
          where: { id: user.id },
          data: {
            remember_token: remember_token,
          },
        })
        .then(result => {
          const { email, remember_token } = result;
          if (!remember_token) {
            return res.status(500).json({
              success: false,
              message: "Error generating token",
            });
          }
          try {
            return sendEmailVerification(email, remember_token || "").then(emailRes => {
              return res.json({
                success: true,
                message: "Email sent",
                results: emailRes,
                email: email,
              });
            });
          } catch (error) {
            return res.status(500).json({
              success: false,
              message: "Error sending email",
            });
          }
        });
    } catch (error) {
      console.error("error", error);
      res.status(500).json({
        success: false,
        message: "Server error",
      });
    }
  },

  async verifyEmail(req: Request, res: Response) {
    const { token } = req.params;
    const { email: emailQuery } = req.query;
    const email = decodeURIComponent(
      Array.isArray(emailQuery) ? `${emailQuery[0]}` : `${emailQuery}`
    );

    console.log("Got verify email request: ", email || "no email?");

    if (!email || email === "") {
      return res.status(400).json({
        success: false,
        message: "Email missing",
      });
    }

    try {
      const user = await prisma.user.findFirst({
        where: {
          remember_token: token,
          email,
        },
      });

      if (user === null) {
        return res.status(400).json({
          success: false,
          message: "(Token, Email) not found",
          email: email,
        });
      }

      const result = await prisma.user.update({
        where: { id: user.id },
        data: {
          email_verified_at: new Date(),
          remember_token: null,
        },
      });

      return res.json({
        success: true,
        message: "Email verified successfully",
        onelink: result.onelink,
        email: email,
      });
    } catch (error) {
      console.error("error", error);
      return res.status(500).json({
        success: false,
        message: "Server Error",
      });
    }
  },
};
