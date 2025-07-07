import { Request, Response } from "express";
import { PrismaClient } from "@prisma/client";
import { ValidatedRequest } from "../middleware/validation.middleware";
import { OnelinkParamInput, RedeemOnelinkInput } from "../schemas/onelink.schema";

const prisma = new PrismaClient();

export const onelinkController = {
  async getOnelink(req: Request, res: Response) {
    console.group("🔗 GET ONELINK REQUEST");
    console.info("📥 Received request for onelink");
    const { onelink } = (req as ValidatedRequest<OnelinkParamInput>).validatedData;
    console.info(`🔍 Looking up onelink: ${onelink}`);

    try {
      console.info("🔄 Querying database for user");
      const user = await prisma.user.findUnique({
        where: {
          onelink: onelink,
        },
      });
      console.info(`🔍 User lookup result: ${user ? "✅ Found" : "❌ Not found"}`);

      if (user === null) {
        console.info(`⚠️ Onelink not found: ${onelink}`);
        console.groupEnd();
        return res.status(400).json({ message: `Onelink not found: ${onelink}` });
      }

      const { theme: theme_id, id: user_id, name, email, description, image } = user;
      console.info(`👤 User data extracted - Name: ${name}, ID: ${user_id}, Theme ID: ${theme_id}`);

      console.info(`🎨 Fetching theme with ID: ${theme_id}`);
      const theme = await prisma.theme.findUnique({
        where: {
          id: Number(theme_id),
        },
      });
      console.info(`🎨 Theme fetch result: ${theme ? "✅ Found" : "❌ Not found"}`);

      console.info(`📦 Fetching blocks for user ID: ${user_id}`);
      const blocks = await prisma.block.findMany({
        where: {
          user_id: Number(user_id),
        },
      });
      console.info(`📦 Blocks fetched: ${blocks.length} blocks found`);

      const result = { user: { name, email, description, image }, theme, blocks };
      console.info("🔄 Preparing response with user data, theme, and blocks");

      console.info("✅ Successfully processed onelink request");
      console.groupEnd();

      res.status(201).json({
        result,
      });
    } catch (error) {
      console.error("❌ ERROR in getOnelink", error);
      console.groupEnd();
      res.status(500).json({ message: "Server error" });
    }
  },
  async checkOnelink(req: Request, res: Response) {
    console.group("🔍 CHECK ONELINK REQUEST");
    console.info("📥 Received request to check onelink availability");
    const { onelink } = (req as ValidatedRequest<OnelinkParamInput>).validatedData;
    console.info(`🔍 Checking availability for: ${onelink}`);

    try {
      console.info("🔄 Querying database to count matching onelinks");
      const count = await prisma.user.count({
        where: {
          onelink: onelink,
        },
      });
      console.info(`🔢 Count result: ${count}`);

      const available = count === 0;
      console.info(
        `${available ? "✅" : "❌"} Onelink "${onelink}" is ${available ? "available" : "taken"}`
      );
      console.groupEnd();

      return res.status(200).json({
        available,
        onelink,
      });
    } catch (error) {
      console.error("❌ ERROR in checkOnelink", error);
      console.groupEnd();
      res.status(500).json({ message: "Server error" });
    }
  },
  async redeemOnelink(req: Request, res: Response) {
    console.group("🔄 REDEEM ONELINK REQUEST");
    console.info("📥 Received request to redeem onelink");

    const { newOnelink } = (req as ValidatedRequest<RedeemOnelinkInput>).validatedData;
    const userId = req.user?.sub; // Get user ID from authentication middleware

    if (!userId) {
      console.info("❌ User not authenticated");
      console.groupEnd();
      return res.status(401).json({
        success: false,
        message: "Authentication required",
      });
    }

    try {
      // First get the current user to find their current onelink
      const currentUser = await prisma.user.findUnique({
        where: {
          id: userId,
        },
        select: {
          onelink: true,
        },
      });

      if (!currentUser) {
        console.info(`❌ User with ID ${userId} not found`);
        console.groupEnd();
        return res.status(404).json({
          success: false,
          message: "User not found",
        });
      }

      const currentOnelink = currentUser.onelink;
      console.info(
        `🔄 User ${userId} requesting to change onelink from "${currentOnelink}" to "${newOnelink}"`
      );

      // Check if the new onelink is available
      const existingOnelink = await prisma.user.findUnique({
        where: {
          onelink: newOnelink,
        },
      });

      if (existingOnelink) {
        console.info(`❌ Onelink "${newOnelink}" is already taken`);
        console.groupEnd();
        return res.status(400).json({
          success: false,
          message: "This onelink is already taken",
        });
      }

      // Update the user's onelink
      const updatedUser = await prisma.user.update({
        where: {
          id: userId,
        },
        data: {
          onelink: newOnelink,
        },
      });

      console.info(`✅ Onelink successfully updated to "${newOnelink}"`);
      console.groupEnd();

      return res.status(200).json({
        success: true,
        message: "Onelink updated successfully",
        onelink: newOnelink,
      });
    } catch (error) {
      console.error("❌ ERROR in redeemOnelink", error);
      console.groupEnd();
      res.status(500).json({
        success: false,
        message: "Server error",
      });
    }
  },
};
