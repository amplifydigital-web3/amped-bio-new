import { z } from "zod";

export const editUserSchema = z.object({
  name: z.string().min(1, "Name is required"),
  description: z.string().nullable().optional(),
  theme: z.number(),
  image: z.string().nullable().optional(),
  reward_business_id: z.string().nullable().optional(),
});

// Screen Review 108 I01: the RNS name has its own validated write. A bare
// label or a full name is accepted; null clears it.
export const setRnsNameSchema = z.object({
  label: z.string().trim().min(1).max(80).nullable(),
});

export type EditUserInput = z.infer<typeof editUserSchema>;
