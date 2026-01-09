import { z } from "zod";

export const editUserSchema = z.object({
  name: z.string().min(1, "Name is required"),
  description: z.string().nullable().optional(),
  theme: z.number(),
  image: z.string().nullable().optional(),
  reward_business_id: z.string().nullable().optional(),
  revo_name: z.string().nullable().optional(),
});

export type EditUserInput = z.infer<typeof editUserSchema>;
