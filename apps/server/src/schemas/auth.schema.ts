import { z } from "zod";

export const registerSchema = z.object({
  onelink: z
    .string()
    .min(3, "URL must be at least 3 characters")
    .regex(/^[a-zA-Z0-9_-]+$/, "URL can only contain letters, numbers, underscores and hyphens")
    .refine(value => !value.includes("@"), "URL cannot contain @"),
  email: z.string().email(),
  password: z.string().min(8),
});

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string(),
});

export const passwordResetRequestSchema = z.object({
  email: z.string().email(),
});

export const processPasswordResetSchema = z.object({
  token: z.string(),
  newPassword: z.string().min(8),
});

export const sendVerifyEmailSchema = z.object({
  email: z.string().email(),
});

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type PasswordResetRequestInput = z.infer<typeof passwordResetRequestSchema>;
export type ProcessPasswordResetInput = z.infer<typeof processPasswordResetSchema>;
export type SendVerifyEmailInput = z.infer<typeof sendVerifyEmailSchema>;
