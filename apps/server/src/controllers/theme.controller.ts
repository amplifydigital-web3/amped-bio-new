import { Request, Response } from "express";
import { PrismaClient } from "@prisma/client";
import { ValidatedRequest } from "../middleware/validation.middleware";
import { z } from "zod";
import { editThemeSchema } from "../schemas/theme.schema";
import { s3Service } from "../services/S3Service";

const prisma = new PrismaClient();

export const themeController = {
  async editTheme(req: Request, res: Response) {
    const { id } = req.params;
    const user_id = req.user.id;
    const { theme } = (req as ValidatedRequest<z.infer<typeof editThemeSchema>>).validatedData;
    const { name, share_level, share_config, config } = theme;

    try {
      const existingTheme = await prisma.theme.findUnique({
        where: {
          id: Number(id),
          user_id: user_id,
        },
      });

      if (existingTheme === null || Number(id) === 0) {
        const result = await prisma.theme.create({
          data: {
            user_id,
            name,
            share_level,
            share_config,
            config,
          },
        });

        return res.status(201).json({
          result,
        });
      }

      // Check if there's an existing background in the theme config that needs to be deleted
      const existingConfig = existingTheme.config as Record<string, any> || {};
      const newConfig = config as Record<string, any> || {};
      
      // Check if the background has changed
      const existingBackground = existingConfig.background?.value;
      const newBackground = newConfig.background?.value;
      
      if (existingBackground && 
          newBackground !== existingBackground && 
          typeof existingBackground === 'string') {
        
        // Extract the file key from the existing background URL
        const backgroundFileKey = s3Service.extractFileKeyFromUrl(existingBackground);
        
        // Check if the file belongs to this user and theme, and delete it if it does
        if (backgroundFileKey && 
            s3Service.isThemeOwnerFile({ 
              fileKey: backgroundFileKey, 
              themeId: Number(id), 
              userId: user_id 
            })) {
          try {
            console.info('[INFO] Deleting previous theme background during theme update', 
              JSON.stringify({ backgroundFileKey, themeId: Number(id), userId: user_id }));
            await s3Service.deleteFile(backgroundFileKey);
          } catch (deleteError) {
            // Log the error and fail the whole operation
            console.error('Failed to delete previous background during theme update:', deleteError);
            throw new Error(`Failed to delete previous background file: ${backgroundFileKey}`);
          }
        }
      }

      const result = await prisma.theme.update({
        where: { id: Number(id) },
        data: {
          name,
          share_level,
          share_config,
          config,
        },
      });

      res.status(201).json({
        result,
      });
    } catch (error) {
      console.error("error", error);
      res.status(500).json({ message: "Server error" });
    }
  },

  async get(req: Request, res: Response) {
    const { id } = req.params;

    try {
      const result = await prisma.theme.findUnique({
        where: {
          id: Number(id),
        },
      });

      if (result === null) {
        return res.status(400).json({ message: `Theme not found: ${id}` });
      }

      res.status(201).json({
        result,
      });
    } catch (error) {
      console.error("error", error);
      res.status(500).json({ message: "Server error" });
    }
  },

  async delete(req: Request, res: Response) {
    const { id } = req.params;
    const user_id = req.user.id;

    try {
      const theme = await prisma.theme.findUnique({
        where: {
          id: Number(id),
          user_id: user_id,
        },
      });

      if (theme === null) {
        return res.status(400).json({ message: `Theme not found: ${id}` });
      }

      const result = await prisma.theme.delete({
        where: {
          id: Number(id),
          user_id: user_id,
        },
      });

      res.json({
        result,
      });
    } catch (error) {
      console.error("error", error);
      res.status(500).json({ message: "Server error" });
    }
  },
};
