import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { sendEmail, sendEmailVerification } from '../utils/email';
import { hashPassword, comparePasswords } from '../utils/password';
import { generateToken } from '../utils/token';
import { validateEmail } from '../utils/validation';
import crypto from 'crypto';

const prisma = new PrismaClient()

export const authController = {
  async register(req: Request, res: Response) {
    const { onelink, email, password } = req.body.data;

    console.log('Got Register Request: ', onelink, email);

    try {
      if (!validateEmail(email)) {
        return res.status(400).json({ message: 'Invalid email format' });
      }

      const existingOnelink = await prisma.user.findUnique({
        where: {
          onelink: onelink
        }
      }) !== null;

      //TODO write funciton to check if onelink is valid
      // if it is not, add random numbers to the end and check again
      // repeat above until it is valid

      if (existingOnelink) {
        return res.status(400).json({ message: 'URL already taken' });
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
      const remember_token = crypto.randomBytes(32).toString('hex');

      const result = await prisma.user.create({
        data: {
          onelink,
          name: onelink,
          email,
          password: hashedPassword,
          remember_token: remember_token
        },
      })

      const token = generateToken({ id: result.id, email: result.email });

      try {
        sendEmailVerification(email, remember_token)
      } catch (error) {
        res.status(500).json({ message: 'Error sending email' });
      }

      res.status(201).json({
        user: { id: result.id, email, onelink },
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
          user: { id: user.id, email: user.email, onelink: user.onelink },
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

  async sendVerifyEmail(req: Request, res: Response) {
    const { email } = req.body.data;
    console.log('Got send verify email request: ', email);
    try {
      const user = await prisma.user.findUnique({
        where: {
          email: email
        }
      });

      if (user === null) {
        return res.status(400).json({ message: 'User not found' });
      }

      // Commented for testing!!!!
      // if (user.email_verified_at !== null) {
      //   return res.status(400).json({ message: 'Email already verified' });
      // }


      const remember_token = crypto.randomBytes(32).toString('hex');

      return prisma.user.update({
        where: { id: user.id },
        data: {
          remember_token: remember_token
        }
      }).then((result) => {
        const { email, remember_token } = result;
        if (!remember_token) {
          res.status(500).json({ message: 'Error generating token' });
          return;
        }
        try {
          return sendEmailVerification(email, remember_token || '').then((emailRes) => {
            res.json({ message: 'Email sent', results: emailRes });
          });
        } catch (error) {
          res.status(500).json({ message: 'Error sending email' });
        }
      });





    } catch (error) {
      console.log('error', error);
      res.status(500).json({ message: 'Server error' });
    }
  },

  async verifyEmail(req: Request, res: Response) {
    const { token } = req.params
    console.log('Got verify email request');
    try {
      const user = await prisma.user.findFirst({
        where: {
          remember_token: token
        }
      });

      if (user === null) {
        return res.status(400).json({ message: 'User not found' });
      }

      const result = await prisma.user.update({
        where: { id: user.id },
        data: {
          email_verified_at: new Date(),
          remember_token: null
        }
      });

      res.json({ message: 'Email Verified', results: result });

    } catch (error) {
      console.log('error', error);
      res.status(500).json({ message: 'Server error' });
    }
  }
};