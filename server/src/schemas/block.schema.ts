import { z } from 'zod';

// Schema for a single block
export const blockSchema = z.object({
  id: z.number(),
  type: z.string().min(1, 'Block type is required'),
  order: z.number().default(0),
  platform: z.string().optional(),
  url: z.string().optional(),
  label: z.string().optional(),
  content: z.string().optional(),
});

// Schema for editing multiple blocks
export const editBlocksSchema = z.object({
  blocks: z.array(blockSchema),
});

// Schema for adding a new block
export const addBlockSchema = z
  .object({
    type: z.string().min(1, 'Block type is required'),
    order: z.number().default(0),
  })
  .catchall(z.any());

// Schema for block id parameter
export const blockIdParamSchema = z.object({
  id: z.string().refine(val => !isNaN(Number(val)), {
    message: 'Block ID must be a valid number',
  }),
});

export type Block = z.infer<typeof blockSchema>;
export type EditBlocksInput = z.infer<typeof editBlocksSchema>;
export type AddBlockInput = z.infer<typeof addBlockSchema>;
export type BlockIdParam = z.infer<typeof blockIdParamSchema>;
