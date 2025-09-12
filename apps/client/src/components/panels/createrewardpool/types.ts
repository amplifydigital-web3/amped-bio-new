import { z } from "zod";
import { type LucideIcon } from "lucide-react";

export const stakingTierSchema = z.object({
  id: z.string(),
  name: z.string().min(1, "Tier name is required"),
  minStake: z.number().min(0, "Minimum stake must be non-negative"),
  perks: z.array(z.string().min(1, "Perk description is required")).optional(), // Make perks optional
  color: z.string(),
});

export const creatorPoolSchema = z.object({
  poolName: z.string().min(1, "Pool name is required"),
  poolDescription: z.string().min(1, "Pool description is required"),
  poolImage: z.string().optional().nullable(),
  yourStake: z.number().min(0, "Your initial stake must be at least 0"),
  creatorFee: z.number().min(0).max(100),
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
