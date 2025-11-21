export interface RewardPool {
  id: number;
  description: string | null;
  chainId: string;
  address: string;
  image: {
    id: number;
    url: string;
  } | null;

  // Placeholder fields for client-side derivation or future server implementation
  name: string; // Blockchain pool name (primary)
  totalReward: bigint;
  stakedAmount: bigint;
  fans: number;
  pendingRewards: bigint;
  stakedByYou: bigint; // Amount of REVO that the requesting user has staked in this pool
  creator: {
    userId: number;
    address: string;
  };
}
