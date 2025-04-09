import { z } from 'zod';

export const onelinkParamSchema = z.object({
  onelink: z
    .string()
    .min(3, 'URL must be at least 3 characters')
    .regex(/^[a-zA-Z0-9_-]+$/, 'URL can only contain letters, numbers, underscores and hyphens')
    .refine(value => !value.includes('@'), 'URL cannot contain @'),
});

export const redeemOnelinkSchema = z.object({
  newOnelink: z
    .string()
    .min(3, 'URL must be at least 3 characters')
    .regex(/^[a-zA-Z0-9_-]+$/, 'URL can only contain letters, numbers, underscores and hyphens')
    .refine(value => !value.includes('@'), 'URL cannot contain @'),
});

export type OnelinkParamInput = z.infer<typeof onelinkParamSchema>;
export type RedeemOnelinkInput = z.infer<typeof redeemOnelinkSchema>;
