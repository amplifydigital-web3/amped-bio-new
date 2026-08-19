import { z } from "zod";

export const updateThemeSchema = z.object({
  id: z.number(),
  name: z.string().min(1, "Theme title is required"),
  description: z.string().optional(),
});

export const updateCategorySchema = z.object({
  id: z.number(),
  title: z.string().min(1, "Category title is required"),
  description: z.string().optional(),
});

export const twoFactorPasswordSchema = z.string().min(1, "Password is required");

export const totpCodeSchema = z
  .string()
  .length(6, "TOTP code must be 6 digits")
  .regex(/^\d+$/, "TOTP code must be 6 digits");
