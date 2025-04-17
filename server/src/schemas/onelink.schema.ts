import { z } from "zod";

export const onelinkParamSchema = z.object({
  onelink: z
    .string()
    .min(4, "URL must be at least 4 characters including the @ symbol")
    .regex(
      /^[a-zA-Z0-9_-]+$/,
      "URL must start with @ and can only contain letters, numbers, underscores and hyphens"
    ),
});

export const redeemOnelinkSchema = z.object({
  newOnelink: z
    .string()
    .min(4, "URL must be at least 4 characters including the @ symbol")
    .regex(
      /^[a-zA-Z0-9_-]+$/,
      "URL must start with @ and can only contain letters, numbers, underscores and hyphens"
    ),
});

export type OnelinkParamInput = z.infer<typeof onelinkParamSchema>;
export type RedeemOnelinkInput = z.infer<typeof redeemOnelinkSchema>;
