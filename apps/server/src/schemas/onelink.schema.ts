import { z } from "zod";
import { ONELINK_MIN_LENGTH, ONELINK_REGEX } from "@ampedbio/constants";

// Create a base schema for onelink validation
export const onelinkBaseSchema = z
  .string()
  .transform(value => (value.startsWith("@") ? value.substring(1) : value)) // Normalize by removing @ prefix if present
  .pipe(
    z
      .string()
      .min(ONELINK_MIN_LENGTH, `Name must be at least ${ONELINK_MIN_LENGTH} characters`)
      .regex(ONELINK_REGEX, "Name can only contain letters, numbers, underscores and hyphens")
  );

// Use the base schema in specific contexts
export const onelinkParamSchema = z.object({
  onelink: onelinkBaseSchema,
});

export const redeemOnelinkSchema = z.object({
  newOnelink: onelinkBaseSchema,
});

export type OnelinkParamInput = z.infer<typeof onelinkParamSchema>;
export type RedeemOnelinkInput = z.infer<typeof redeemOnelinkSchema>;
