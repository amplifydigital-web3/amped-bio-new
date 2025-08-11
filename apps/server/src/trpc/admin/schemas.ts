import { z } from "zod";

// Common schemas
export const DateRangeSchema = z.object({
  startDate: z.string().optional(),
  endDate: z.string().optional(),
});

export const PaginationSchema = z.object({
  page: z.number().default(1),
  limit: z.number().default(10),
});

// User schemas
export const UserFilterSchema = z.object({
  search: z.string().optional(),
  role: z.string().optional(),
  blocked: z.boolean().optional(),
});

export const UserSearchSchema = z.object({
  query: z.string().min(2, "Search query must be at least 2 characters"),
});

export const UserUpdateSchema = z.object({
  id: z.number(),
  name: z.string().optional(),
  email: z.string().email().optional(),
  role: z.string().optional(),
  block: z.enum(["yes", "no"]).optional(),
});

// Block schemas
export const BlockTypeFilterSchema = z.object({
  type: z.string().optional(),
});

// Theme schemas
export const ThemeCreateSchema = z.object({
  share_config: z.any().optional(),
  name: z.string().optional(),
  description: z.string().optional(),
  config: z.any().optional(),
  category_id: z.number().nullable().optional(),
});

export const ThemeCategoryCreateSchema = z.object({
  name: z.string().min(1, "Category name is required"),
  title: z.string().min(1, "Category title is required"),
  category: z.string().min(1, "Category identifier is required"),
  description: z.string().max(240, "Description must not exceed 240 characters").optional(),
});

export const ThemeCategoryToggleVisibilitySchema = z.object({
  id: z.number(),
  visible: z.boolean(),
});

export const ThemeUpdateSchema = z.object({
  id: z.number(),
  name: z.string().min(1, "Theme title is required"),
});

export const ThemeCategoryUpdateSchema = z.object({
  id: z.number(),
  title: z.string().min(1, "Category title is required"),
  description: z.string().optional(),
});

// File management schemas
export const FileFilterSchema = z.object({
  search: z.string().optional(),
  status: z.enum(["PENDING", "COMPLETED", "DELETED"]).optional(),
  fileType: z.enum(["image", "video", "document", "other"]).optional(),
  userId: z.number().optional(),
});

export const FileActionSchema = z.object({
  fileId: z.number(),
});
