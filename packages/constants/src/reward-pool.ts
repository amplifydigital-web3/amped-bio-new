export interface RewardPool {
  id: number;
  description: string | null;
  chainId: string;
  userId: number;
  poolAddress: string | null;
  image_file_id: number | null;
  imageUrl: string | null;

  // Placeholder fields for client-side derivation or future server implementation
  name: string; // Blockchain pool name (primary)
  totalReward: number;
  stakedAmount: number;
  participants: number;
  createdBy: string;
  earnedRewards: number;
  creatorAddress?: string | null;
}
