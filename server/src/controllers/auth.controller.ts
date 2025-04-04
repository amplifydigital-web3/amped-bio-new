import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { sendEmailVerification, sendPasswordResetEmail } from '../utils/email/email';
import { hashPassword, comparePasswords } from '../utils/password';
import { generateToken } from '../utils/token';
import { validateEmail } from '../utils/validation';
import crypto from 'crypto';
import { withRelatedProject } from '@vercel/related-projects';

const serverBaseURL = process.env.VERCEL_PROJECT_PRODUCTION_URL || 'http://localhost:3000';

const frontendBaseURL = withRelatedProject({
  projectName: 'amped-bio',
  defaultHost: 'http://localhost:5173'
})

const prisma = new PrismaClient()

export const authController = {
  // register new user
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
      console.error('error', error);
      res.status(500).json({ message: 'Server error' });
    }
  },

  // user login
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
        const emailVerified = user.email_verified_at !== null

        res.json({
          user: { id: user.id, email: user.email, onelink: user.onelink, emailVerified },
          token,
        });
      }

    } catch (error) {
      console.error('error', error);
      res.status(500).json({ message: 'Server error' });
    }
  },

  // request password reset email
  async passwordResetRequest(req: Request, res: Response) {
    const { email: emailQuery, renderResponse } = req.query;
    const email = decodeURIComponent(Array.isArray(emailQuery) ? `${emailQuery[0]}` : `${emailQuery}`);

    try {
      const user = await prisma.user.findUnique({
        where: {
          email: email
        }
      });

      if (user === null) {
        if (renderResponse === 'false') {
          return res.status(400).json({ message: 'User not found' })
        } else {
          return res.render('PasswordResetRequestPage.ejs', { status: 'error', message: 'User not found', email: email, url: `${frontendBaseURL}/` })
        }
      }

      const remember_token = crypto.randomBytes(32).toString('hex');

      return prisma.user.update({
        where: { id: user.id },
        data: {
          remember_token: remember_token
        }
      }).then(
        (result) => {
          if (!result.remember_token) {
            if (renderResponse === 'false') {
              throw new Error(`Token write failed: user_id: ${user.id}`);
            } else {
              return res.render('PasswordResetRequestPage.ejs', { status: 'error', message: 'Error generating token', email: email, url: `${frontendBaseURL}/` })
            }

          }
          return sendPasswordResetEmail(result.email, result.remember_token);
        }
      ).then(
        () => {
          if (renderResponse === 'false') {
            res.json({ message: 'Password reset email sent' })
          } else {
            return res.render('PasswordResetRequestPage.ejs', { status: 'success', message: '', email: email })
          }

        }, (error) => {
          if (renderResponse === 'false') {
            res.status(500).json({ message: 'Error sending password reset email', error })
          } else {
            return res.render('PasswordResetRequestPage.ejs', { status: 'error', message: 'Error sending password reset email', email: email, url: `${frontendBaseURL}/` })
          }
        }
      );
    } catch (error) {
      console.error('error', error);
      res.status(500).json({ message: 'Server error' });
    }
  },

  // handle password reset request and return/render status
  async passwordReset(req: Request, res: Response) {
    const { token: resetToken } = req.params;
    const { email: emailQuery, renderResponse } = req.query;
    const email = decodeURIComponent(Array.isArray(emailQuery) ? `${emailQuery[0]}` : `${emailQuery}`);

    try {
      const user = await prisma.user.findUnique({
        where: {
          email: email
        }
      });

      if (user === null) {
        if (renderResponse === 'false') {
          return res.status(400).json({ message: 'User not found' });
        } else {
          return res.render('PasswordResetStatusPage.ejs', { status: 'error', message: `User not found for email: ${email}`, email: email, url: `${frontendBaseURL}` })
        }
      }

      if (user.remember_token !== resetToken) {
        if (renderResponse === 'false') {
          return res.status(400).json({ message: 'Invalid reset token' });
        } else {
          return res.render('PasswordResetStatusPage.ejs', { status: 'error', message: 'Invalid reset token', email: email, url: `${frontendBaseURL}` })
        }
      }

      return res.render('PasswordResetPage.ejs', { token: resetToken, url: `http://${serverBaseURL}/api/auth/passwordReset` });

    } catch (error) {
      console.error('error', error);
      res.status(500).json({ message: 'Server error' });
    }
  },

  // process password reset and return/render status
  async processPasswordReset(req: Request, res: Response) {
    const { token: requestToken, password, confirmPassword } = req.body;

    if (password !== confirmPassword) {
      return res.render('PasswordResetStatusPage.ejs', { status: 'error', message: 'Passwords do not match', url: `${frontendBaseURL}` })
    }

    try {
      const user = await prisma.user.findFirst({
        where: {
          remember_token: requestToken
        }
      });

      if (!user) {
        return res.render('PasswordResetStatusPage.ejs', { status: 'error', message: 'Invalid reset token', url: `${frontendBaseURL}` })
      }

      const hashedPassword = await hashPassword(password);

      if (user.password === hashedPassword) {
        return res.render('PasswordResetStatusPage.ejs', { status: 'error', message: 'New password must be different than old password', url: `${frontendBaseURL}` })
      }

      const result = await prisma.user.update({
        where: { id: user.id },
        data: {
          password: hashedPassword,
          remember_token: null
        },
      })

      return res.render('PasswordResetStatusPage.ejs', { status: 'success', message: '', url: `${frontendBaseURL}` });

    } catch (error) {
      console.error('error', error);
      res.status(500).json({ message: 'Server error' });
    }
  },

  // handle verify email request and return/render status
  async sendVerifyEmail(req: Request, res: Response) {
    const { email: emailQuery, renderResponse } = req.query;
    const email = decodeURIComponent(Array.isArray(emailQuery) ? `${emailQuery[0]}` : `${emailQuery}`);

    if (!email || email === '') {
      if (renderResponse === 'false') {
        return res.status(400).json({ message: 'Email missing from query' })
      } else {
        return res.render('EmailVerificationResentPage.ejs', { status: 'error', message: 'Email missing from query', email: 'Undefined' })
      }
    }

    console.log('Got send verify email request: ', email);
    try {
      const user = await prisma.user.findUnique({
        where: {
          email: email
        }
      });

      if (user === null) {
        if (renderResponse === 'false') {
          return res.status(400).json({ message: 'User not found' })
        } else {
          return res.render('EmailVerificationResentPage.ejs', { status: 'error', message: 'User not found', email: email })
        }
      }

      const remember_token = crypto.randomBytes(32).toString('hex');

      return prisma.user.update({
        where: { id: user.id },
        data: {
          remember_token: remember_token
        }
      }).then((result) => {
        const { email, remember_token } = result;
        if (!remember_token) {
          if (renderResponse === 'false') {
            return res.status(500).json({ message: 'Error generating token' })
          } else {
            return res.render('EmailVerificationResentPage.ejs', { status: 'error', message: 'Error generating token', email: email })
          }
        }
        try {
          return sendEmailVerification(email, remember_token || '').then((emailRes) => {
            if (renderResponse === 'false') {
              return res.json({ message: 'Email sent', results: emailRes });
            } else {
              return res.render('EmailVerificationResentPage.ejs', { status: 'success', message: '', email: email })
            }
          });
        } catch (error) {
          if (renderResponse === 'false') {
            return res.status(500).json({ message: 'Error sending email' })
          } else {
            return res.render('EmailVerificationResentPage.ejs', { status: 'error', message: 'Error sending email', email: email })
          }
        }
      });

    } catch (error) {
      console.error('error', error);
      res.status(500).json({ message: 'Server error' });
    }
  },

  // process email verification and render status
  async verifyEmail(req: Request, res: Response) {
    const { token } = req.params;
    const { email: emailQuery } = req.query;
    const email = decodeURIComponent(Array.isArray(emailQuery) ? `${emailQuery[0]}` : `${emailQuery}`);

    console.log('Got verify email request: ', email || 'no email?');

    if (!email || email === '') {
      return res.render('EmailVerificationPage.ejs', { status: 'error', message: 'Email missing', url: '' });
    }
    try {
      const user = await prisma.user.findFirst({
        where: {
          remember_token: token,
          email
        }
      });

      if (user === null) {
        return res.render('EmailVerificationPage.ejs', { status: 'error', message: '(Token, Email) not found', url: email && email !== '' ? `${serverBaseURL}/api/auth/sendEmailVerification?email=${encodeURIComponent(email)}` : '' });
      }

      const result = await prisma.user.update({
        where: { id: user.id },
        data: {
          email_verified_at: new Date(),
          remember_token: null
        }
      });

      res.render('EmailVerificationPage.ejs', { status: 'success', message: '', url: `${frontendBaseURL}/${result.onelink}` })

    } catch (error) {
      console.error('error', error);
      return res.render('EmailVerificationPage.ejs', { status: 'error', message: 'Server Error' })
    }
  }
};