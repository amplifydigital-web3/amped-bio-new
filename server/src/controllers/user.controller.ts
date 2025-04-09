import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { ValidatedRequest } from '../middleware/validation.middleware';
import { DeleteUserInput, EditUserInput } from '../schemas/user.schema';

const prisma = new PrismaClient();

export const userController = {
  async edit(req: Request, res: Response) {
    const userId = req.user.id;
    const validatedReq = req as ValidatedRequest<EditUserInput>;

    const { name, email, onelink, description, theme, image, reward_business_id } =
      validatedReq.validatedData;

    try {
      const user = await prisma.user.findUnique({
        where: {
          id: userId,
        },
      });

      if (user === null) {
        return res.status(400).json({ message: 'User not found' });
      }

      await prisma.user.update({
        where: { id: userId },
        data: {
          name,
          email,
          onelink,
          description,
          theme: `${theme}`,
          image,
          reward_business_id,
        },
      });

      res.status(200).json({
        message: 'User updated successfully',
      });
    } catch (error) {
      console.error('error', error);
      res.status(500).json({ message: 'Server error' });
    }
  },

  async get(req: Request, res: Response) {
    const userId = req.user.id;

    try {
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
        return res.status(400).json({ message: 'User not found' });
      }

      const { theme: theme_id } = user;

      const theme = await prisma.theme.findUnique({
        where: {
          id: Number(theme_id),
        },
      });

      const blocks = await prisma.block.findMany({
        where: {
          user_id: userId,
        },
      });

      const result = { user, theme, blocks };

      res.status(201).json({
        result,
      });
    } catch (error) {
      console.error('error', error);
      res.status(500).json({ message: 'Server error' });
    }
  },

  async delete(req: Request, res: Response) {
    const userId = req.user.id;
    const validatedReq = req as ValidatedRequest<DeleteUserInput>;
    const { email } = validatedReq.validatedData;

    try {
      const user = await prisma.user.findUnique({
        where: {
          id: userId,
        },
      });

      if (user === null) {
        return res.status(400).json({ message: 'User not found' });
      }

      // Verify the email matches the authenticated user
      if (user.email !== email) {
        return res
          .status(403)
          .json({ message: 'Email confirmation does not match authenticated user' });
      }

      const result = await prisma.user.delete({
        where: {
          id: userId,
        },
      });

      res.json({
        result,
        message: 'User deleted successfully',
      });
    } catch (error) {
      console.error('error', error);
      res.status(500).json({ message: 'Server error' });
    }
  },
};
