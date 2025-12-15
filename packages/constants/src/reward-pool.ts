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

export interface SlimPoolForUserStakedPool {
  id: number;
  address: string;
  image: {
    id: number;
    url: string;
  } | null;
  name: string;
  pendingRewards: bigint | null;
  stakedByYou: bigint;
}

export interface UserStakedPool {
  userWalletId: number;
  pool: SlimPoolForUserStakedPool;
}

export interface UserStakedPoolWithNullables {
  userWalletId: number;
  pool: SlimPoolForUserStakedPool;
  pendingRewards: bigint | null;
  stakedByYou: bigint | null;
}

export interface PoolTabRewardPool {
  id: number;
  name: string;
  description: string | null;
  chainId: string;
  address: string;
  image: {
    id: number;
    url: string;
  } | null;
  stakedAmount: bigint;
  fans: number;
}

// Interface specifically for getPoolDetailsForModal return type
export interface PoolDetailsForModal {
  id: number;
  name: string;
  description: string | null;
  chainId: string;
  address: string;
  image: {
    id: number;
    url: string;
  } | null;
  totalReward: bigint;
  stakedAmount: bigint;
  fans: number;
  pendingRewards: bigint | null;
  stakedByYou: bigint | null; // Amount of REVO that the requesting user has staked in this pool
  creator: {
    userId: number;
    address: string;
    littlelink: string | null;
    name: string;
  };
}
