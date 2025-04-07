import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export const themeController = {
  async editTheme(req: Request, res: Response) {
    const { id } = req.params;
    const user_id = req.user.id;
    const { theme } = req.body.data;
    const { name, share_level, share_config, config } = theme;

    try {
      const theme = await prisma.theme.findUnique({
        where: {
          id: Number(id),
          user_id: Number(user_id),
        },
      });

      if (theme === null || Number(id) === 0) {
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
      console.error('error', error);
      res.status(500).json({ message: 'Server error' });
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
      console.error('error', error);
      res.status(500).json({ message: 'Server error' });
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
      console.error('error', error);
      res.status(500).json({ message: 'Server error' });
    }
  },
};
