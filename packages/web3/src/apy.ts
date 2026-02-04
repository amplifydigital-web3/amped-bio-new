import type { Address } from "viem";
import { formatUnits } from "viem";
import { NODE_ABI, CREATOR_POOL_ABI, getChainConfig } from "./index";

const CONFIG = {
  batchesPerYear: 525600, // 60 batches/hour × 24 × 365
  tokenDecimals: 18,
  defaultNodeCutBps: 2000, // 20%
};

/**
 * Calculates the APY (Annual Percentage Yield) for a creator pool.
 * Returns APY in basis points (e.g., 1250 for 12.5%).
 *
 * @param poolAddress - The address of the creator pool
 * @param chainId - The chain ID
 * @param publicClient - The viem public client for making contract calls
 * @returns APY in basis points, or null if calculation fails
 */
export async function calculatePoolAPY(
  poolAddress: Address,
  chainId: number,
  publicClient: { readContract: (params: any) => Promise<any> }
): Promise<number | null> {
  const chain = getChainConfig(chainId);
  if (!chain?.contracts?.NODE) {
    return null;
  }

  try {
    // 1. Get pool data (pool contract calls)
    const [nodeAddr, creatorCutBps, creatorStakedWei, totalFanStakedWei] = await Promise.all([
      publicClient.readContract({
        address: poolAddress,
        abi: CREATOR_POOL_ABI,
        functionName: "NODE",
      }),
      publicClient.readContract({
        address: poolAddress,
        abi: CREATOR_POOL_ABI,
        functionName: "creatorCut",
      }),
      publicClient.readContract({
        address: poolAddress,
        abi: CREATOR_POOL_ABI,
        functionName: "creatorStaked",
      }),
      publicClient.readContract({
        address: poolAddress,
        abi: CREATOR_POOL_ABI,
        functionName: "totalFanStaked",
      }),
    ]);

    const creatorStaked = Number(formatUnits(creatorStakedWei as bigint, CONFIG.tokenDecimals));
    const totalFanStaked = Number(formatUnits(totalFanStakedWei as bigint, CONFIG.tokenDecimals));
    const poolEffectiveStake = creatorStaked + totalFanStaked;

    // Edge case: no fan stake means no APY to calculate
    if (totalFanStaked === 0) {
      return null;
    }

    // 2. Get global system data (NODE contract calls)
    const nodes = (await publicClient.readContract({
      address: chain.contracts.NODE.address,
      abi: NODE_ABI,
      functionName: "getNodes",
    })) as Address[];

    let totalSystemStake = 0n;
    for (const node of nodes) {
      const delegation = (await publicClient.readContract({
        address: chain.contracts.NODE.address,
        abi: NODE_ABI,
        functionName: "nodeTotalDelegation",
        args: [node],
      })) as bigint;
      totalSystemStake += delegation;
    }

    const batchCount = (await publicClient.readContract({
      address: chain.contracts.NODE.address,
      abi: NODE_ABI,
      functionName: "batchCount",
    })) as bigint;

    const rewardPerBatchWei = (await publicClient.readContract({
      address: chain.contracts.NODE.address,
      abi: NODE_ABI,
      functionName: "rewardPerBlock",
      args: [batchCount],
    })) as bigint;

    const rewardPerBatch = Number(formatUnits(rewardPerBatchWei, CONFIG.tokenDecimals));
    const annualSystemRewards = rewardPerBatch * CONFIG.batchesPerYear;

    // 3. Get node-specific data
    const nodeTotalStakeWei = (await publicClient.readContract({
      address: chain.contracts.NODE.address,
      abi: NODE_ABI,
      functionName: "nodeTotalDelegation",
      args: [nodeAddr as Address],
    })) as bigint;

    const nodeTotalStake = Number(formatUnits(nodeTotalStakeWei, CONFIG.tokenDecimals));

    let nodeCutBps = (await publicClient.readContract({
      address: chain.contracts.NODE.address,
      abi: NODE_ABI,
      functionName: "nodeCutBps",
      args: [nodeAddr as Address],
    })) as bigint;

    if (nodeCutBps === 0n) nodeCutBps = BigInt(CONFIG.defaultNodeCutBps);

    // 4. Calculate APY
    if (totalSystemStake === 0n || nodeTotalStake === 0 || poolEffectiveStake === 0) {
      return null;
    }

    const nodeWinProb =
      nodeTotalStake / Number(formatUnits(totalSystemStake, CONFIG.tokenDecimals));
    const nodeAnnualGross = annualSystemRewards * nodeWinProb;
    const nodeAnnualNet = (nodeAnnualGross * (10000 - Number(nodeCutBps))) / 10000;

    const poolShare = poolEffectiveStake / nodeTotalStake;
    const poolAnnualRewards = nodeAnnualNet * poolShare;

    const fanAnnualToPool = (poolAnnualRewards * (10000 - Number(creatorCutBps))) / 10000;
    const apy = (fanAnnualToPool / totalFanStaked) * 100;

    // Return as basis points
    return Math.round(apy * 100);
  } catch (error) {
    return null;
  }
}
