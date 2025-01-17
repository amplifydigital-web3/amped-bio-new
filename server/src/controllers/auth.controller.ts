import { Request, Response } from 'express';
import { Prisma, PrismaClient } from '@prisma/client';
// import { nanoid } from 'nanoid';

import { hashPassword, comparePasswords } from '../utils/password';
import { generateToken } from '../utils/token';
import { validateEmail } from '../utils/validation';

const prisma = new PrismaClient()

export const authController = {
  async register(req: Request, res: Response) {
    const { onelink, email, password } = req.body.data;

    console.log('Got Register Request: ', onelink, email);

    try {
      if (!validateEmail(email)) {
        return res.status(400).json({ message: 'Invalid email format' });
      }

      const existingUser = await prisma.user.findUnique({
        where: {
          email: email
        }
      }) !== null;

      if (existingUser) {
        return res.status(400).json({ message: 'Email already registered' });
      }

      const hashedPassword = await hashPassword(password);

      const result = await prisma.user.create({
        data: {
          onelink,
          name: onelink,
          email,
          password: hashedPassword
        },
      })

      const token = generateToken({ id: result.id, email: result.email });

      res.status(201).json({
        user: { id: result.id, email },
        token,
      });
    } catch (error) {
      console.log('error', error);
      res.status(500).json({ message: 'Server error' });
    }
  },

  async login(req: Request, res: Response) {
    const { email, password } = req.body.data;

    try {
      const user = await prisma.user.findUnique({
        where: {
          email: email
        }
      });

      if (user === null) {
        return res.status(400).json({ message: 'Invalid credentials' });
      }

      const isValidPassword = await comparePasswords(password, user.password || '');

      if (!isValidPassword) {
        return res.status(401).json({ message: 'Invalid credentials' });
      }
      else {
        const token = generateToken({ id: user.id, email: user.email });

        res.json({
          user: { id: user.id, email: user.email },
          token,
        });
      }

    } catch (error) {
      console.log('error', error);
      res.status(500).json({ message: 'Server error' });
    }
  },

  async passwordResetRequest(req: Request, res: Response) {
    const { email } = req.body.data;

    try {
      const user = await prisma.user.findUnique({
        where: {
          email: email
        }
      });

      if (user === null) {
        return res.status(400).json({ message: 'User not found' });
      }

      // const resetToken = nanoid(255);

      const result = await prisma.user.update({
        where: { email: email },
        data: {
          remember_token: 'resetToken'
        },
      })

      // TODO: Send password reset email with resetToken

      res.json({ message: 'Password reset email sent' });

    } catch (error) {
      console.log('error', error);
      res.status(500).json({ message: 'Server error' });
    }
  },

  async passwordReset(req: Request, res: Response) {
    const { email, resetToken, newPassword } = req.body.data;

    try {
      const user = await prisma.user.findUnique({
        where: {
          email: email
        }
      });

      if (user === null) {
        return res.status(400).json({ message: 'User not found' });
      }

      if (user.remember_token !== resetToken) {
        return res.status(400).json({ message: 'Invalid reset token' });
      }

      const hashedPassword = await hashPassword(newPassword);

      if (user.password === hashedPassword) {
        return res.status(400).json({ message: 'New password must be different' });
      }

      const result = await prisma.user.update({
        where: { email: email },
        data: {
          password: hashedPassword
        },
      })

      const token = generateToken({ id: result.id, email: result.email });

      res.json({
        user: { id: result.id, email: result.email },
        token,
      });

    } catch (error) {
      console.log('error', error);
      res.status(500).json({ message: 'Server error' });
    }
  },
};