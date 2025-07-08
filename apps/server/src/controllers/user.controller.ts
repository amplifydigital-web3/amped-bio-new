import { Request, Response } from "express";
import { PrismaClient } from "@prisma/client";
import { ValidatedRequest } from "../middleware/validation.middleware";
import { DeleteUserInput, EditUserInput } from "../schemas/user.schema";

const prisma = new PrismaClient();

export const userController = {
  async edit(req: Request, res: Response) {
    console.group("🔄 User Edit Operation");
    console.info("📝 Starting user edit process");

    const userId = req.user.sub;
    console.info(`👤 User ID: ${userId}`);

    const validatedReq = req as ValidatedRequest<EditUserInput>;
    console.info("✅ Request data validated");

    const { name, description, theme, image, reward_business_id } = validatedReq.validatedData;
    console.info(
      `📋 Edit data: ${JSON.stringify({ name, description, theme, image, reward_business_id })}`
    );

    try {
      console.info("🔍 Looking up user in database");
      const user = await prisma.user.findUnique({
        where: {
          id: userId,
        },
      });

      if (user === null) {
        console.info("❌ User not found");
        console.groupEnd();
        return res.status(400).json({ message: "User not found" });
      }
      console.info("✅ User found");

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
      res.status(200).json({
        message: "User updated successfully",
      });
    } catch (error) {
      console.error("❌ Error:", error);
      console.groupEnd();
      res.status(500).json({ message: "Server error" });
    }
  },

  async get(req: Request, res: Response) {
    console.group("🔍 User Get Operation");
    console.info("📝 Starting user fetch process");

    const userId = req.user.sub;
    console.info(`👤 User ID: ${userId}`);

    try {
      console.info("🔍 Fetching user details from database");
      const user = await prisma.user.findUnique({
        where: {
          id: userId,
        },
        select: {
          id: true,
          name: true,
          email: true,
          email_verified_at: true,
          onelink: true,
          description: true,
          role: true,
          block: true,
          remember_token: true,
          theme: true,
          auth_as: true,
          provider: true,
          provider_id: true,
          image: true,
          reward_business_id: true,
          created_at: true,
          updated_at: true,
        },
      });

      if (user === null) {
        console.info("❌ User not found");
        console.groupEnd();
        return res.status(400).json({ message: "User not found" });
      }
      console.info("✅ User found");

      const { theme: theme_id } = user;
      console.info(`🎨 Looking up theme ID: ${theme_id}`);

      const theme = await prisma.theme.findUnique({
        where: {
          id: Number(theme_id),
        },
      });
      console.info("✅ Theme fetched");

      console.info("📦 Fetching user blocks");
      const blocks = await prisma.block.findMany({
        where: {
          user_id: userId,
        },
      });
      console.info(`✅ Retrieved ${blocks.length} blocks`);

      const result = { user, theme, blocks };
      console.info("📊 User data assembly complete");
      console.groupEnd();

      res.status(201).json({
        result,
      });
    } catch (error) {
      console.error("❌ Error:", error);
      console.groupEnd();
      res.status(500).json({ message: "Server error" });
    }
  },

  async delete(req: Request, res: Response) {
    console.group("❌ User Delete Operation");
    console.info("📝 Starting user deletion process");

    const userId = req.user.sub;
    console.info(`👤 User ID: ${userId}`);

    const validatedReq = req as ValidatedRequest<DeleteUserInput>;
    console.info("✅ Request data validated");

    const { email } = validatedReq.validatedData;
    console.info(`📧 Confirmation email: ${email}`);

    try {
      console.info("🔍 Looking up user in database");
      const user = await prisma.user.findUnique({
        where: {
          id: userId,
        },
      });

      if (user === null) {
        console.info("❌ User not found");
        console.groupEnd();
        return res.status(400).json({ message: "User not found" });
      }
      console.info("✅ User found");

      // Verify the email matches the authenticated user
      console.info("🔐 Verifying email confirmation");
      if (user.email !== email) {
        console.info("⛔ Email verification failed");
        console.groupEnd();
        return res
          .status(403)
          .json({ message: "Email confirmation does not match authenticated user" });
      }
      console.info("✅ Email verification successful");

      console.info("🗑️ Deleting user account");
      const result = await prisma.user.delete({
        where: {
          id: userId,
        },
      });
      console.info("✅ User deleted successfully");

      console.groupEnd();
      res.json({
        result,
        message: "User deleted successfully",
      });
    } catch (error) {
      console.error("❌ Error:", error);
      console.groupEnd();
      res.status(500).json({ message: "Server error" });
    }
  },
};
