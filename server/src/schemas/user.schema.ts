import { z } from 'zod';

export const editUserSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  email: z.string().email('Invalid email format'),
  onelink: z.string().min(1, 'Onelink is required'),
  description: z.string().nullable().optional(),
  theme: z.string().or(z.number()).nullable().optional(),
  image: z.string().nullable().optional(),
  reward_business_id: z.string().nullable().optional(),
});

export const deleteUserSchema = z.object({
  email: z.string().email('Invalid email format'),
});

export type EditUserInput = z.infer<typeof editUserSchema>;
export type DeleteUserInput = z.infer<typeof deleteUserSchema>;
