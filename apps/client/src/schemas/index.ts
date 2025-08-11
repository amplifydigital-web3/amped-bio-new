import { z } from "zod";

export const updateThemeSchema = z.object({
  id: z.number(),
  name: z.string().min(1, "Theme title is required"),
});

export const updateCategorySchema = z.object({
  id: z.number(),
  title: z.string().min(1, "Category title is required"),
  description: z.string().optional(),
});
