import express from 'express';
import { authController } from '../controllers/auth.controller';

const router = express.Router();

// Auth routes
router.post('/register', authController.register);
router.post('/login', authController.login);

// Password Reset routes
router.post('/passwordResetRequest', authController.passwordResetRequest);
router.post('/passwordReset', authController.processPasswordReset);

// Email Verification routes
router.post('/sendEmailVerification', authController.sendVerifyEmail);
router.get('/verifyEmail/:token', authController.verifyEmail);

export default router;
