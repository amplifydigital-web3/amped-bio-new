import { z } from "zod";

export const blockConfigSchema = z.record(z.any());

export const blockSchema = z.object({
  id: z.number(),
  user_id: z.number(),
  type: z.string(),
  order: z.number(),
  config: blockConfigSchema,
  clicks: z.number(),
  created_at: z.date(),
  updated_at: z.date(),
});

export type BlockType = z.infer<typeof blockSchema>;
