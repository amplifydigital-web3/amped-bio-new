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
  console.log(`[APY DEBUG] calculatePoolAPY START - pool: ${poolAddress}, chainId: ${chainId}`);

  const chain = getChainConfig(chainId);
  if (!chain?.contracts?.NODE) {
    console.log(`[APY DEBUG] calculatePoolAPY END - No chain config found, returning null`);
    return null;
  }

  try {
    // 1. Get pool data (pool contract calls)
    console.log(`[APY DEBUG] STEP 1: Fetching pool data from contract ${poolAddress}...`);

    console.log(`[APY DEBUG] Calling pool.NODE()...`);
    const nodeAddr = await publicClient.readContract({
      address: poolAddress,
      abi: CREATOR_POOL_ABI,
      functionName: "NODE",
    });
    console.log(`[APY DEBUG] ✓ SUCCESS: pool.NODE() returned: ${nodeAddr}`);

    console.log(`[APY DEBUG] Calling pool.creatorCut()...`);
    const creatorCutBps = await publicClient.readContract({
      address: poolAddress,
      abi: CREATOR_POOL_ABI,
      functionName: "creatorCut",
    });
    console.log(`[APY DEBUG] ✓ SUCCESS: pool.creatorCut() returned: ${Number(creatorCutBps)} bps`);

    console.log(`[APY DEBUG] Calling pool.creatorStaked()...`);
    const creatorStakedWei = await publicClient.readContract({
      address: poolAddress,
      abi: CREATOR_POOL_ABI,
      functionName: "creatorStaked",
    });
    console.log(`[APY DEBUG] ✓ SUCCESS: pool.creatorStaked() returned: ${creatorStakedWei} wei`);

    console.log(`[APY DEBUG] Calling pool.totalFanStaked()...`);
    const totalFanStakedWei = await publicClient.readContract({
      address: poolAddress,
      abi: CREATOR_POOL_ABI,
      functionName: "totalFanStaked",
    });
    console.log(`[APY DEBUG] ✓ SUCCESS: pool.totalFanStaked() returned: ${totalFanStakedWei} wei`);

    console.log(`[APY DEBUG] ✓ All pool contract calls completed successfully`);

    const creatorStaked = Number(formatUnits(creatorStakedWei as bigint, CONFIG.tokenDecimals));
    const totalFanStaked = Number(formatUnits(totalFanStakedWei as bigint, CONFIG.tokenDecimals));
    const poolEffectiveStake = creatorStaked + totalFanStaked;

    console.log(`[APY DEBUG] Pool data summary:`);
    console.log(`  - Node address: ${nodeAddr}`);
    console.log(`  - Creator cut (bps): ${Number(creatorCutBps)}`);
    console.log(`  - Creator staked: ${creatorStaked} tokens`);
    console.log(`  - Total fan staked: ${totalFanStaked} tokens`);
    console.log(`  - Pool effective stake: ${poolEffectiveStake} tokens`);

    // Edge case: no fan stake means no APY to calculate
    if (totalFanStaked === 0) {
      console.log(`[APY DEBUG] calculatePoolAPY END - No fan stake, returning null`);
      return null;
    }

    // 2. Get global system data (NODE contract calls)
    console.log(
      `[APY DEBUG] STEP 2: Fetching global system data from NODE contract ${chain.contracts.NODE.address}...`
    );

    console.log(`[APY DEBUG] Calling NODE.getNodes()...`);
    const nodes = (await publicClient.readContract({
      address: chain.contracts.NODE.address,
      abi: NODE_ABI,
      functionName: "getNodes",
    })) as Address[];
    console.log(`[APY DEBUG] ✓ SUCCESS: NODE.getNodes() returned ${nodes.length} nodes`);

    console.log(`[APY DEBUG] Fetching delegation for ${nodes.length} nodes...`);
    let totalSystemStake = 0n;
    let nodeIndex = 0;
    for (const node of nodes) {
      console.log(`[APY DEBUG] Calling NODE.nodeTotalDelegation(${node})...`);
      const delegation = (await publicClient.readContract({
        address: chain.contracts.NODE.address,
        abi: NODE_ABI,
        functionName: "nodeTotalDelegation",
        args: [node],
      })) as bigint;
      console.log(
        `[APY DEBUG] ✓ SUCCESS: NODE.nodeTotalDelegation(${node}) returned: ${delegation} wei`
      );
      totalSystemStake += delegation;
      nodeIndex++;
      console.log(
        `[APY DEBUG] Progress: ${nodeIndex}/${nodes.length} nodes processed, running total stake: ${totalSystemStake} wei`
      );
    }

    console.log(`[APY DEBUG] ✓ Total system stake calculated: ${totalSystemStake} wei`);

    console.log(`[APY DEBUG] Calling NODE.batchCount()...`);
    const batchCount = (await publicClient.readContract({
      address: chain.contracts.NODE.address,
      abi: NODE_ABI,
      functionName: "batchCount",
    })) as bigint;
    console.log(`[APY DEBUG] ✓ SUCCESS: NODE.batchCount() returned: ${batchCount}`);

    console.log(`[APY DEBUG] Calling NODE.rewardPerBlock(${batchCount})...`);
    const rewardPerBatchWei = (await publicClient.readContract({
      address: chain.contracts.NODE.address,
      abi: NODE_ABI,
      functionName: "rewardPerBlock",
      args: [batchCount],
    })) as bigint;
    console.log(
      `[APY DEBUG] ✓ SUCCESS: NODE.rewardPerBlock(${batchCount}) returned: ${rewardPerBatchWei} wei`
    );

    const rewardPerBatch = Number(formatUnits(rewardPerBatchWei, CONFIG.tokenDecimals));
    const annualSystemRewards = rewardPerBatch * CONFIG.batchesPerYear;

    console.log(`[APY DEBUG] Global system data summary:`);
    console.log(`  - Total nodes: ${nodes.length}`);
    console.log(
      `  - Total system stake: ${Number(formatUnits(totalSystemStake, CONFIG.tokenDecimals))} tokens`
    );
    console.log(`  - Batch count: ${batchCount}`);
    console.log(`  - Reward per batch: ${rewardPerBatch} tokens`);
    console.log(`  - Annual system rewards: ${annualSystemRewards} tokens`);

    // 3. Get node-specific data
    console.log(`[APY DEBUG] STEP 3: Fetching node-specific data for node ${nodeAddr}...`);

    console.log(`[APY DEBUG] Calling NODE.nodeTotalDelegation(${nodeAddr})...`);
    const nodeTotalStakeWei = (await publicClient.readContract({
      address: chain.contracts.NODE.address,
      abi: NODE_ABI,
      functionName: "nodeTotalDelegation",
      args: [nodeAddr as Address],
    })) as bigint;
    console.log(
      `[APY DEBUG] ✓ SUCCESS: NODE.nodeTotalDelegation(${nodeAddr}) returned: ${nodeTotalStakeWei} wei`
    );

    const nodeTotalStake = Number(formatUnits(nodeTotalStakeWei, CONFIG.tokenDecimals));

    console.log(`[APY DEBUG] Calling NODE.nodeCutBps(${nodeAddr})...`);
    let nodeCutBps = (await publicClient.readContract({
      address: chain.contracts.NODE.address,
      abi: NODE_ABI,
      functionName: "nodeCutBps",
      args: [nodeAddr as Address],
    })) as bigint;
    console.log(
      `[APY DEBUG] ✓ SUCCESS: NODE.nodeCutBps(${nodeAddr}) returned: ${Number(nodeCutBps)} bps`
    );

    if (nodeCutBps === 0n) {
      console.log(`[APY DEBUG] Node cut is 0, using default: ${CONFIG.defaultNodeCutBps} bps`);
      nodeCutBps = BigInt(CONFIG.defaultNodeCutBps);
    }

    console.log(`[APY DEBUG] Node-specific data summary:`);
    console.log(`  - Node total stake: ${nodeTotalStake} tokens`);
    console.log(`  - Node cut (bps): ${Number(nodeCutBps)}`);

    // 4. Calculate APY
    console.log(`[APY DEBUG] STEP 4: Calculating APY...`);

    if (totalSystemStake === 0n || nodeTotalStake === 0 || poolEffectiveStake === 0) {
      console.log(`[APY DEBUG] calculatePoolAPY END - Zero stakes detected, returning null`);
      return null;
    }

    const nodeWinProb =
      nodeTotalStake / Number(formatUnits(totalSystemStake, CONFIG.tokenDecimals));
    console.log(`[APY DEBUG] ✓ Calculated node win probability: ${nodeWinProb}`);

    const nodeAnnualGross = annualSystemRewards * nodeWinProb;
    console.log(`[APY DEBUG] ✓ Calculated node annual gross rewards: ${nodeAnnualGross} tokens`);

    const nodeAnnualNet = (nodeAnnualGross * (10000 - Number(nodeCutBps))) / 10000;
    console.log(
      `[APY DEBUG] ✓ Calculated node annual net rewards (after node cut): ${nodeAnnualNet} tokens`
    );

    const poolShare = poolEffectiveStake / nodeTotalStake;
    console.log(`[APY DEBUG] ✓ Calculated pool share of node rewards: ${poolShare}`);

    const poolAnnualRewards = nodeAnnualNet * poolShare;
    console.log(`[APY DEBUG] ✓ Calculated pool annual rewards: ${poolAnnualRewards} tokens`);

    const fanAnnualToPool = (poolAnnualRewards * (10000 - Number(creatorCutBps))) / 10000;
    console.log(
      `[APY DEBUG] ✓ Calculated fan annual to pool (after creator cut): ${fanAnnualToPool} tokens`
    );

    const apy = (fanAnnualToPool / totalFanStaked) * 100;
    console.log(`[APY DEBUG] ✓ Calculated final APY: ${apy}%`);

    console.log(`[APY DEBUG] APY calculation summary:`);
    console.log(`  - Node win probability: ${(nodeWinProb * 100).toFixed(2)}%`);
    console.log(`  - Node annual gross rewards: ${nodeAnnualGross.toFixed(2)} tokens`);
    console.log(`  - Node annual net rewards: ${nodeAnnualNet.toFixed(2)} tokens`);
    console.log(`  - Pool share: ${(poolShare * 100).toFixed(2)}%`);
    console.log(`  - Pool annual rewards: ${poolAnnualRewards.toFixed(2)} tokens`);
    console.log(`  - Fan annual to pool: ${fanAnnualToPool.toFixed(2)} tokens`);
    console.log(`  - Final APY: ${apy.toFixed(2)}% (${Math.round(apy * 100)} bps)`);

    const finalApy = Math.round(apy * 100);
    console.log(
      `[APY DEBUG] ✓ calculatePoolAPY SUCCESS - Returning APY: ${finalApy} bps (${(finalApy / 100).toFixed(2)}%)`
    );

    // Return as basis points
    return finalApy;
  } catch (error) {
    console.error(`[APY DEBUG] calculatePoolAPY END - Error caught:`, error);
    return null;
  }
}
