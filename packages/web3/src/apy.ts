import type { Address, PublicClient } from "viem";
import { formatUnits } from "viem";
import { NODE_ABI, NODE_MANAGER_ABI, CREATOR_POOL_ABI, getChainConfig } from "./index";

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
  publicClient: PublicClient
): Promise<number | null> {
  console.log(`[APY DEBUG] calculatePoolAPY START - pool: ${poolAddress}, chainId: ${chainId}`);

  const chain = getChainConfig(chainId);
  if (!chain?.contracts?.NODE) {
    console.log(`[APY DEBUG] calculatePoolAPY END - No chain config found, returning null`);
    return null;
  }

  try {
    // 1. Get pool data (pool contract calls)
    console.log(
      `[APY DEBUG] STEP 1: Fetching pool data from contract ${poolAddress} using multicall...`
    );

    const poolCalls = [
      {
        address: poolAddress,
        abi: CREATOR_POOL_ABI,
        functionName: "NODE" as const,
      },
      {
        address: poolAddress,
        abi: CREATOR_POOL_ABI,
        functionName: "creatorCut" as const,
      },
      {
        address: poolAddress,
        abi: CREATOR_POOL_ABI,
        functionName: "creatorStaked" as const,
      },
      {
        address: poolAddress,
        abi: CREATOR_POOL_ABI,
        functionName: "totalFanStaked" as const,
      },
    ];

    console.log(`[APY DEBUG] Executing multicall for pool data...`);
    const poolResults = await publicClient.multicall({
      contracts: poolCalls,
      allowFailure: false,
    });

    const [nodeAddr, creatorCutBps, creatorStakedWei, totalFanStakedWei] = poolResults as [
      Address,
      bigint,
      bigint,
      bigint,
    ];
    console.log(`[APY DEBUG] ✓ SUCCESS: Multicall completed for pool data`);
    console.log(`  - pool.NODE(): ${nodeAddr}`);
    console.log(`  - pool.creatorCut(): ${Number(creatorCutBps)} bps`);
    console.log(`  - pool.creatorStaked(): ${creatorStakedWei} wei`);
    console.log(`  - pool.totalFanStaked(): ${totalFanStakedWei} wei`);

    const creatorStaked = Number(formatUnits(creatorStakedWei, CONFIG.tokenDecimals));
    const totalFanStaked = Number(formatUnits(totalFanStakedWei, CONFIG.tokenDecimals));
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

    console.log(`[APY DEBUG] Calling NODE_MANAGER.getNodes()...`);
    const nodes = (await publicClient.readContract({
      address: chain.contracts.NODE_MANAGER.address,
      abi: NODE_MANAGER_ABI,
      functionName: "getNodes",
    })) as Address[];
    console.log(`[APY DEBUG] ✓ SUCCESS: NODE_MANAGER.getNodes() returned ${nodes.length} nodes`);

    console.log(
      `[APY DEBUG] Fetching delegation for ${nodes.length} nodes using multicall with batches of 5...`
    );
    let totalSystemStake = 0n;
    const batchSize = 5;

    for (let i = 0; i < nodes.length; i += batchSize) {
      const batch = nodes.slice(i, i + batchSize);
      const batchCalls = batch.map(node => ({
        address: chain.contracts.NODE.address,
        abi: NODE_ABI,
        functionName: "nodeTotalDelegation" as const,
        args: [node] as const,
      }));

      console.log(
        `[APY DEBUG] Processing batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(nodes.length / batchSize)} with ${batch.length} nodes...`
      );
      const batchResults = await publicClient.multicall({
        contracts: batchCalls,
        allowFailure: false,
      });

      const delegations = batchResults as bigint[];
      for (const delegation of delegations) {
        totalSystemStake += delegation;
      }

      console.log(
        `[APY DEBUG] ✓ Batch ${Math.floor(i / batchSize) + 1} completed, running total stake: ${totalSystemStake} wei`
      );
    }

    console.log(`[APY DEBUG] ✓ Total system stake calculated: ${totalSystemStake} wei`);

    console.log(`[APY DEBUG] Fetching batch count and reward per batch using multicall...`);
    const globalCalls = [
      {
        address: chain.contracts.NODE.address,
        abi: NODE_ABI,
        functionName: "batchCount" as const,
      },
    ];

    const [batchCount] = (await publicClient.multicall({
      contracts: globalCalls,
      allowFailure: false,
    })) as [bigint];

    console.log(`[APY DEBUG] ✓ SUCCESS: NODE.batchCount() returned: ${batchCount}`);

    console.log(`[APY DEBUG] Calling NODE.rewardPerBlock(${batchCount})...`);
    const rewardPerBatchWei = await publicClient.readContract({
      address: chain.contracts.NODE.address,
      abi: NODE_ABI,
      functionName: "rewardPerBlock",
      args: [batchCount],
    });
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
    console.log(
      `[APY DEBUG] STEP 3: Fetching node-specific data for node ${nodeAddr} using multicall...`
    );

    const nodeCalls = [
      {
        address: chain.contracts.NODE.address,
        abi: NODE_ABI,
        functionName: "nodeTotalDelegation" as const,
        args: [nodeAddr as Address] as const,
      },
      {
        address: chain.contracts.NODE.address,
        abi: NODE_ABI,
        functionName: "nodeCutBps" as const,
        args: [nodeAddr as Address] as const,
      },
    ];

    const [nodeTotalStakeWei, initialNodeCutBps] = (await publicClient.multicall({
      contracts: nodeCalls,
      allowFailure: false,
    })) as [bigint, bigint];

    let nodeCutBps = initialNodeCutBps;

    const nodeTotalStake = Number(formatUnits(nodeTotalStakeWei, CONFIG.tokenDecimals));

    console.log(`[APY DEBUG] ✓ SUCCESS: Multicall completed for node ${nodeAddr}`);
    console.log(`  - NODE.nodeTotalDelegation(${nodeAddr}): ${nodeTotalStakeWei} wei`);
    console.log(`  - NODE.nodeCutBps(${nodeAddr}): ${Number(nodeCutBps)} bps`);

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
