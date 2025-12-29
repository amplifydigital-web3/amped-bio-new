import { z } from "zod";

// User schema
export const UserSchema = z.object({
  id: z.number(),
  name: z.string(),
  email: z.string().email(),
  handle: z.string().nullable(),
  created_at: z.string(),
  role: z.string(),
  _count: z.object({
    blocks: z.number(),
  }),
});

// Handle schema
export const HandleSchema = z.object({
  handle: z.string().nullable(),
  name: z.string(),
  totalClicks: z.number(),
  blockCount: z.number(),
  userId: z.number(),
});

export type Handle = z.infer<typeof HandleSchema>;
export type BlockType = z.infer<typeof BlockTypeSchema>;
export type UserStats = z.infer<typeof UserStatsSchema>;
export type BlockStats = z.infer<typeof BlockStatsSchema>;
export type DashboardStats = z.infer<typeof DashboardStatsSchema>;
export type BlockStatsData = z.infer<typeof BlockStatsDataSchema>;
export type DashboardData = z.infer<typeof DashboardDataSchema>;
