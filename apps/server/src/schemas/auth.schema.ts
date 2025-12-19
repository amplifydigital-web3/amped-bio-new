import { z } from "zod";
import { ONELINK_MIN_LENGTH, ONELINK_REGEX } from "@ampedbio/constants";

export const registerSchema = z.object({
  onelink: z
    .string()
    .transform(value => (value.startsWith("@") ? value.substring(1) : value)) // Normalize by removing @ prefix if present
    .pipe(
      z
        .string()
        .min(ONELINK_MIN_LENGTH, `Name must be at least ${ONELINK_MIN_LENGTH} characters`)
        .regex(ONELINK_REGEX, "Name can only contain letters, numbers, underscores and hyphens")
        .refine(value => !value.includes("@"), "Name cannot contain @")
    ),
  email: z.string().email(),
  password: z.string().min(8),
  recaptchaToken: z.string().nullable(),
});

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string(),
  recaptchaToken: z.string().nullable(),
});

export const passwordResetRequestSchema = z.object({
  email: z.string().email(),
  recaptchaToken: z.string().nullable(),
});

export const processPasswordResetSchema = z.object({
  token: z.string(),
  email: z.string().email(),
  newPassword: z.string().min(8),
});

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type PasswordResetRequestInput = z.infer<typeof passwordResetRequestSchema>;
export type ProcessPasswordResetInput = z.infer<typeof processPasswordResetSchema>;
