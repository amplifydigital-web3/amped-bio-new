import express from "express";
import { authController } from "../controllers/auth.controller";
import { validate, ValidationTarget } from "../middleware/validation.middleware";
import {
  registerSchema,
  loginSchema,
  passwordResetRequestSchema,
  processPasswordResetSchema,
  sendVerifyEmailSchema,
} from "../schemas/auth.schema";

const router = express.Router();

// Auth routes
router.post("/register", validate(registerSchema), authController.register);
router.post("/login", validate(loginSchema), authController.login);

// Password Reset routes
router.post(
  "/passwordResetRequest",
  validate(passwordResetRequestSchema),
  authController.passwordResetRequest
);
router.post(
  "/passwordReset",
  validate(processPasswordResetSchema),
  authController.processPasswordReset
);

// Email Verification routes
router.post(
  "/sendEmailVerification",
  validate(sendVerifyEmailSchema),
  authController.sendVerifyEmail
);
router.get("/verifyEmail/:token", authController.verifyEmail);

export default router;
