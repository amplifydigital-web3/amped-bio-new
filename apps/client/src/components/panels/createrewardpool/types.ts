import { z } from "zod";
import { type LucideIcon } from "lucide-react";

export const stakingTierSchema = z.object({
  id: z.string(),
  name: z.string().min(1, "Tier name is required"),
  perks: z.array(z.string().min(1, "Perk description is required")).optional(), // Make perks optional
  color: z.string(),
});

export const creatorPoolSchema = z.object({
  // 065 I07, I08: errors name the fix; description matches the dashboard editor (max 500)
  poolName: z.string().trim().min(1, "Enter a pool name"),
  poolDescription: z
    .string()
    .trim()
    .min(1, "Add a short description.")
    .max(500, "Use 500 characters or fewer."),
  initialStake: z.number().min(0, "Your initial stake must be at least 0"),
  creatorFee: z
    .number({ invalid_type_error: "Use a whole number from 0 to 100." })
    .int("Use a whole number from 0 to 100.")
    .min(0, "Use a whole number from 0 to 100.")
    .max(100, "Use a whole number from 0 to 100."),
  stakingTiers: z.array(stakingTierSchema).optional(), // Make staking tiers optional
});

export type CreatorPoolFormValues = z.infer<typeof creatorPoolSchema> & {
  stakingTiers?: StakingTier[]; // Make stakingTiers optional in the form values as well
};

export type StakingTier = z.infer<typeof stakingTierSchema> & {
  perks?: string[]; // Make perks optional in the TypeScript type as well
};

export interface TierIconEntry {
  icon: LucideIcon;
  color: string;
}
