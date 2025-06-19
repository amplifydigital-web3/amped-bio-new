import { z } from "zod";

// User schema
export const UserSchema = z.object({
  id: z.number(),
  name: z.string(),
  email: z.string().email(),
  onelink: z.string().nullable(),
  created_at: z.string(),
  role: z.string(),
  _count: z.object({
    blocks: z.number(),
  }),
});

// Onelink schema
export const OnelinkSchema = z.object({
  onelink: z.string().nullable(),
  name: z.string(),
  totalClicks: z.number(),
  blockCount: z.number(),
});

// Block type distribution schema
export const BlockTypeSchema = z.object({
  type: z.string(),
  count: z.number(),
});

// User stats schema
export const UserStatsSchema = z.object({
  totalUsers: z.number(),
  newThisWeek: z.number(),
  rewardProgramUsers: z.number(),
  rewardProgramPercentage: z.number(),
});

// Block stats schema
export const BlockStatsSchema = z.object({
  totalBlocks: z.number(),
  blocksCreatedToday: z.number(),
  mostPopularBlockType: z.string(),
  averageBlocksPerUser: z.number(),
});

// Dashboard stats schema
export const DashboardStatsSchema = z.object({
  userStats: UserStatsSchema,
  blockStats: BlockStatsSchema,
});

// Block stats data schema
export const BlockStatsDataSchema = z.object({
  blocksByType: z.array(BlockTypeSchema),
  totalBlocks: z.number(),
});

// Dashboard data schema
export const DashboardDataSchema = z.object({
  userStats: UserStatsSchema,
  blockStats: BlockStatsSchema,
  blockTypeDistribution: z.record(z.number()),
  topOnelinks: z.array(OnelinkSchema),
  recentUsers: z.array(UserSchema),
});

// Export types from schemas
export type User = z.infer<typeof UserSchema>;
export type Onelink = z.infer<typeof OnelinkSchema>;
export type BlockType = z.infer<typeof BlockTypeSchema>;
export type UserStats = z.infer<typeof UserStatsSchema>;
export type BlockStats = z.infer<typeof BlockStatsSchema>;
export type DashboardStats = z.infer<typeof DashboardStatsSchema>;
export type BlockStatsData = z.infer<typeof BlockStatsDataSchema>;
export type DashboardData = z.infer<typeof DashboardDataSchema>;
