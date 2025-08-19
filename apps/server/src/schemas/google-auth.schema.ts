import { z } from "zod";

// Schema for Google OAuth authentication
export const googleAuthSchema = z.object({
  token: z.string(),
});
