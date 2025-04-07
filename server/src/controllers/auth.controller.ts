import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { sendEmailVerification, sendPasswordResetEmail } from '../utils/email/email';
import { hashPassword, comparePasswords } from '../utils/password';
import { generateToken } from '../utils/token';
import { validateEmail } from '../utils/validation';
import crypto from 'crypto';

const prisma = new PrismaClient();

export const authController = {
  async register(req: Request, res: Response) {
    const { onelink, email, password } = req.body.data;

    console.log('Got Register Request: ', onelink, email);

    try {
      if (!validateEmail(email)) {
        return res.status(400).json({ success: false, message: 'Invalid email format' });
      }

      const existingOnelink =
        (await prisma.user.findUnique({
          where: {
            onelink: onelink,
          },
        })) !== null;

      //TODO write funciton to check if onelink is valid
      // if it is not, add random numbers to the end and check again
      // repeat above until it is valid

      if (existingOnelink) {
        return res.status(400).json({ success: false, message: 'URL already taken' });
      }

      const existingUser =
        (await prisma.user.findUnique({
          where: {
            email: email,
          },
        })) !== null;

      if (existingUser) {
        return res.status(400).json({ success: false, message: 'Email already registered' });
      }

      const hashedPassword = await hashPassword(password);
      const remember_token = crypto.randomBytes(32).toString('hex');

      const result = await prisma.user.create({
        data: {
          onelink,
          name: onelink,
          email,
          password: hashedPassword,
          remember_token: remember_token,
        },
      });

      const token = generateToken({ id: result.id, email: result.email });

      try {
        sendEmailVerification(email, remember_token);
      } catch (error) {
        res.status(500).json({ success: false, message: 'Error sending email' });
      }

      res.status(201).json({
        success: true,
        user: { id: result.id, email, onelink },
        token,
      });
    } catch (error) {
      console.error('error', error);
      res.status(500).json({ success: false, message: 'Server error' });
    }
  },

  async login(req: Request, res: Response) {
    const { email, password } = req.body.data;

    console.info('Got Login Request:', email, password);

    try {
      const user = await prisma.user.findUnique({
        where: {
          email: email,
        },
      });

      if (user === null) {
        return res.status(400).json({ success: false, message: 'Invalid credentials' });
      }

      console.log('user', user);

      const isValidPassword = await comparePasswords(password, user.password);

      if (!isValidPassword) {
        return res.status(401).json({ success: false, message: 'Invalid credentials' });
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
      console.error('error', error);
      res.status(500).json({ success: false, message: 'Server error' });
    }
  },

  async passwordResetRequest(req: Request, res: Response) {
    const { email } = req.body;

    try {
      const user = await prisma.user.findUnique({
        where: {
          email: email,
        },
      });

      if (user === null) {
        return res.status(400).json({
          success: false,
          message: 'User not found',
        });
      }

      const remember_token = crypto.randomBytes(32).toString('hex');

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
              message: 'Password reset email sent',
              email: email,
            });
          },
          error => {
            res.status(500).json({
              success: false,
              message: 'Error sending password reset email',
              error: error.message,
            });
          }
        );
    } catch (error) {
      console.error('error', error);
      res.status(500).json({
        success: false,
        message: 'Server error',
      });
    }
  },

  async processPasswordReset(req: Request, res: Response) {
    const { token: requestToken, password, confirmPassword } = req.body;

    if (password !== confirmPassword) {
      return res.status(400).json({
        success: false,
        message: 'Passwords do not match',
      });
    }

    try {
      const user = await prisma.user.findFirst({
        where: {
          remember_token: requestToken,
        },
      });

      if (!user) {
        return res.status(400).json({
          success: false,
          message: 'Invalid reset token',
        });
      }

      const hashedPassword = await hashPassword(password);

      if (user.password === hashedPassword) {
        return res.status(400).json({
          success: false,
          message: 'New password must be different than old password',
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
        message: 'Password has been reset successfully',
      });
    } catch (error) {
      console.error('error', error);
      res.status(500).json({
        success: false,
        message: 'Server error',
      });
    }
  },

  async sendVerifyEmail(req: Request, res: Response) {
    const { email } = req.body;

    if (!email || email === '') {
      return res.status(400).json({
        success: false,
        message: 'Email missing from request body',
      });
    }

    console.log('Got send verify email request: ', email);
    try {
      const user = await prisma.user.findUnique({
        where: {
          email: email,
        },
      });

      if (user === null) {
        return res.status(400).json({
          success: false,
          message: 'User not found',
        });
      }

      // Commented for testing!!!!
      // if (user.email_verified_at !== null) {
      //   return res.status(400).json({ message: 'Email already verified' });
      // }

      const remember_token = crypto.randomBytes(32).toString('hex');

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
              message: 'Error generating token',
            });
          }
          try {
            return sendEmailVerification(email, remember_token || '').then(emailRes => {
              return res.json({
                success: true,
                message: 'Email sent',
                results: emailRes,
                email: email,
              });
            });
          } catch (error) {
            return res.status(500).json({
              success: false,
              message: 'Error sending email',
            });
          }
        });
    } catch (error) {
      console.error('error', error);
      res.status(500).json({
        success: false,
        message: 'Server error',
      });
    }
  },

  async verifyEmail(req: Request, res: Response) {
    const { token } = req.params;
    const { email: emailQuery } = req.query;
    const email = decodeURIComponent(
      Array.isArray(emailQuery) ? `${emailQuery[0]}` : `${emailQuery}`
    );

    console.log('Got verify email request: ', email || 'no email?');

    if (!email || email === '') {
      return res.status(400).json({
        success: false,
        message: 'Email missing',
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
          message: '(Token, Email) not found',
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
        message: 'Email verified successfully',
        onelink: result.onelink,
        email: email,
      });
    } catch (error) {
      console.error('error', error);
      return res.status(500).json({
        success: false,
        message: 'Server Error',
      });
    }
  },
};
