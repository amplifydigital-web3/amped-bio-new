import type { Address, PublicClient } from "viem";
import { formatUnits } from "viem";
import { NODE_MANAGER_ABI, CREATOR_POOL_ABI, getChainConfig } from "./index";

const CONFIG = {
  batchesPerYear: 525600, // 60 batches/hour × 24 × 365
  tokenDecimals: 18,
  defaultNodeCutBps: 2000, // 20%
};

export interface APYDebugInfo {
  step1_poolData: {
    nodeAddr: string;
    creatorCutBps: bigint;
    creatorStaked: number;
    totalFanStaked: number;
    poolEffectiveStake: number;
  };
  step2_globalSystemData: {
    totalNodes: number;
    totalSystemStake: number;
    batchCount: bigint;
    rewardPerBatch: number;
    annualSystemRewards: number;
  };
  step3_nodeData: {
    nodeTotalStake: number;
    nodeCutBps: bigint;
    nodeCutPercentage: number;
  };
  step4_calculation: {
    totalSystemStakeTokens: number;
    nodeWinProb: number;
    nodeAnnualGross: number;
    nodeAnnualNet: number;
    poolShare: number;
    poolAnnualRewards: number;
    fanAnnualToPool: number;
    apy: number;
    finalApy: number;
    apyPercentage: string;
  };
}

/**
 * Calculates the APY (Annual Percentage Yield) for a creator pool.
 * Returns APY in basis points (e.g., 1250 for 12.5%).
 *
 * @param poolAddress - The address of the creator pool
 * @param chainId - The chain ID
 * @param publicClient - The viem public client for making contract calls
 * @returns APY in basis points, or null if calculation fails
 */
export interface APYDebugInfo {
  step1_poolData: {
    nodeAddr: string;
    creatorCutBps: bigint;
    creatorStaked: number;
    totalFanStaked: number;
    poolEffectiveStake: number;
  };
  step2_globalSystemData: {
    totalNodes: number;
    totalSystemStake: number;
    batchCount: bigint;
    rewardPerBatch: number;
    annualSystemRewards: number;
  };
  step3_nodeData: {
    nodeTotalStake: number;
    nodeCutBps: bigint;
    nodeCutPercentage: number;
  };
  step4_calculation: {
    totalSystemStakeTokens: number;
    nodeWinProb: number;
    nodeAnnualGross: number;
    nodeAnnualNet: number;
    poolShare: number;
    poolAnnualRewards: number;
    fanAnnualToPool: number;
    apy: number;
    finalApy: number;
    apyPercentage: string;
  };
}

export async function calculatePoolAPY(
  poolAddresses: Address[],
  chainId: number,
  publicClient: PublicClient
): Promise<Record<Address, number | null>> {
  console.log(
    `[APY DEBUG] calculatePoolAPY START - pools: ${poolAddresses.length}, chainId: ${chainId}`
  );

  const chain = getChainConfig(chainId);
  if (!chain?.contracts?.NODE_MANAGER) {
    console.log(
      `[APY DEBUG] calculatePoolAPYBatch END - No chain config found, returning null for all pools`
    );
    return poolAddresses.reduce(
      (acc, addr) => ({ ...acc, [addr]: null }),
      {} as Record<Address, number | null>
    );
  }

  const result: Record<Address, number | null> = {};
  for (const poolAddress of poolAddresses) {
    result[poolAddress] = null;
  }

  try {
    if (poolAddresses.length === 0) {
      return result;
    }

    // 1. Get all pool data in a single multicall
    console.log(
      `[APY DEBUG] STEP 1: Fetching pool data for ${poolAddresses.length} pools using multicall...`
    );

    const poolCalls = poolAddresses.flatMap(poolAddress => [
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
    ]);

    const poolResults = await publicClient.multicall({
      contracts: poolCalls,
      allowFailure: false,
    });

    const poolDataMap = new Map<
      Address,
      {
        nodeAddr: Address;
        creatorCutBps: bigint;
        creatorStaked: number;
        totalFanStaked: number;
        poolEffectiveStake: number;
      }
    >();

    for (let i = 0; i < poolAddresses.length; i++) {
      const poolAddress = poolAddresses[i]!;
      const baseIndex = i * 4;
      const nodeAddr = poolResults[baseIndex] as Address;
      const creatorCutBps = poolResults[baseIndex + 1] as bigint;
      const creatorStakedWei = poolResults[baseIndex + 2] as bigint;
      const totalFanStakedWei = poolResults[baseIndex + 3] as bigint;

      const creatorStaked = Number(formatUnits(creatorStakedWei, CONFIG.tokenDecimals));
      const totalFanStaked = Number(formatUnits(totalFanStakedWei, CONFIG.tokenDecimals));
      const poolEffectiveStake = creatorStaked + totalFanStaked;

      poolDataMap.set(poolAddress, {
        nodeAddr,
        creatorCutBps,
        creatorStaked,
        totalFanStaked,
        poolEffectiveStake,
      });

      console.log(`[APY DEBUG] Pool ${poolAddress}: NODE=${nodeAddr}, fanStaked=${totalFanStaked}`);
    }

    console.log(`[APY DEBUG] ✓ SUCCESS: Fetched data for ${poolDataMap.size} pools`);

    // 2. Get global system data (shared across all pools)
    console.log(
      `[APY DEBUG] STEP 2: Fetching global system data from NODE contract ${chain.contracts.NODE_MANAGER.address}...`
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
        address: chain.contracts.NODE_MANAGER.address,
        abi: NODE_MANAGER_ABI,
        functionName: "nodeTotalDelegation" as const,
        args: [node as Address] as const,
      }));

      const batchResults = await publicClient.multicall({
        contracts: batchCalls,
        allowFailure: false,
      });

      const delegations = batchResults as bigint[];
      for (const delegation of delegations) {
        totalSystemStake += delegation;
      }
    }

    console.log(`[APY DEBUG] ✓ Total system stake calculated: ${totalSystemStake} wei`);

    console.log(`[APY DEBUG] Fetching batch count and reward per batch using multicall...`);
    const [batchCount] = (await publicClient.multicall({
      contracts: [
        {
          address: chain.contracts.NODE_MANAGER.address,
          abi: NODE_MANAGER_ABI,
          functionName: "batchCount" as const,
        },
      ],
      allowFailure: false,
    })) as [bigint];

    console.log(`[APY DEBUG] ✓ SUCCESS: NODE_MANAGER.batchCount() returned: ${batchCount}`);

    console.log(`[APY DEBUG] Calling NODE_MANAGER.rewardPerBlock(${batchCount})...`);
    const rewardPerBatchWei = await publicClient.readContract({
      address: chain.contracts.NODE_MANAGER.address,
      abi: NODE_MANAGER_ABI,
      functionName: "rewardPerBlock",
      args: [batchCount],
    });

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

    // 3. Get node data for unique nodes
    const uniqueNodes = [...new Set(Array.from(poolDataMap.values()).map(p => p.nodeAddr))];
    console.log(
      `[APY DEBUG] STEP 3: Fetching node-specific data for ${uniqueNodes.length} unique nodes using multicall...`
    );

    const nodeCalls = uniqueNodes.flatMap(nodeAddr => [
      {
        address: chain.contracts.NODE_MANAGER.address,
        abi: NODE_MANAGER_ABI,
        functionName: "nodeTotalDelegation" as const,
        args: [nodeAddr as Address] as const,
      },
      {
        address: chain.contracts.NODE_MANAGER.address,
        abi: NODE_MANAGER_ABI,
        functionName: "nodeCutBps" as const,
        args: [nodeAddr as Address] as const,
      },
    ]);

    const nodeResults = await publicClient.multicall({
      contracts: nodeCalls,
      allowFailure: false,
    });

    const nodeDataMap = new Map<Address, { nodeTotalStake: number; nodeCutBps: bigint }>();

    for (let i = 0; i < uniqueNodes.length; i++) {
      const nodeAddr = uniqueNodes[i]!;
      const baseIndex = i * 2;
      const nodeTotalStakeWei = nodeResults[baseIndex] as bigint;
      const initialNodeCutBps = nodeResults[baseIndex + 1] as bigint;

      const nodeTotalStake = Number(formatUnits(nodeTotalStakeWei, CONFIG.tokenDecimals));
      let nodeCutBps = initialNodeCutBps;

      if (nodeCutBps === 0n) {
        nodeCutBps = BigInt(CONFIG.defaultNodeCutBps);
      }

      nodeDataMap.set(nodeAddr, { nodeTotalStake, nodeCutBps });
      console.log(
        `[APY DEBUG] Node ${nodeAddr}: totalStake=${nodeTotalStake}, cut=${Number(nodeCutBps)} bps`
      );
    }

    console.log(`[APY DEBUG] ✓ SUCCESS: Fetched data for ${nodeDataMap.size} unique nodes`);

    // 4. Calculate APY for each pool
    console.log(`[APY DEBUG] STEP 4: Calculating APY for ${poolAddresses.length} pools...`);

    for (const poolAddress of poolAddresses) {
      const poolData = poolDataMap.get(poolAddress);
      if (!poolData) continue;

      const { nodeAddr, creatorCutBps, totalFanStaked, poolEffectiveStake } = poolData;

      if (totalFanStaked === 0) {
        console.log(`[APY DEBUG] Pool ${poolAddress}: No fan stake, returning null`);
        continue;
      }

      const nodeData = nodeDataMap.get(nodeAddr);
      if (!nodeData) continue;

      const { nodeTotalStake, nodeCutBps } = nodeData;

      if (totalSystemStake === 0n || nodeTotalStake === 0 || poolEffectiveStake === 0) {
        console.log(`[APY DEBUG] Pool ${poolAddress}: Zero stakes detected, returning null`);
        continue;
      }

      const totalSystemStakeTokens = Number(formatUnits(totalSystemStake, CONFIG.tokenDecimals));
      const nodeWinProb = nodeTotalStake / totalSystemStakeTokens;

      const nodeAnnualGross = annualSystemRewards * nodeWinProb;
      const nodeAnnualNet = (nodeAnnualGross * (10000 - Number(nodeCutBps))) / 10000;

      const poolShare = poolEffectiveStake / nodeTotalStake;
      const poolAnnualRewards = nodeAnnualNet * poolShare;

      const fanAnnualToPool = (poolAnnualRewards * (10000 - Number(creatorCutBps))) / 10000;

      const apy = (fanAnnualToPool / totalFanStaked) * 100;
      const finalApy = Math.round(apy * 100);

      result[poolAddress] = finalApy;

      console.log(
        `[APY DEBUG] Pool ${poolAddress}: APY=${finalApy} bps (${(finalApy / 100).toFixed(2)}%)`
      );
    }

    console.log(
      `[APY DEBUG] ✓ calculatePoolAPYBatch SUCCESS - Calculated APY for ${poolAddresses.length} pools`
    );
    return result;
  } catch (error) {
    console.error(`[APY DEBUG] calculatePoolAPYBatch END - Error caught:`, error);
    return result;
  }
}

export async function calculatePoolAPYDebug(
  poolAddress: Address,
  chainId: number,
  publicClient: PublicClient
): Promise<APYDebugInfo | null> {
  console.log(
    `[APY DEBUG] calculatePoolAPYDebug START - pool: ${poolAddress}, chainId: ${chainId}`
  );

  const chain = getChainConfig(chainId);
  if (!chain?.contracts?.NODE_MANAGER) {
    console.log(`[APY DEBUG] calculatePoolAPYDebug END - No chain config found`);
    return null;
  }

  try {
    const tokenDecimals = CONFIG.tokenDecimals;
    const batchesPerYear = CONFIG.batchesPerYear;

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

    const poolResults = await publicClient.multicall({
      contracts: poolCalls,
      allowFailure: false,
    });

    const nodeAddr = poolResults[0] as Address;
    const creatorCutBps = poolResults[1] as bigint;
    const creatorStakedWei = poolResults[2] as bigint;
    const totalFanStakedWei = poolResults[3] as bigint;

    const creatorStaked = Number(formatUnits(creatorStakedWei, tokenDecimals));
    const totalFanStaked = Number(formatUnits(totalFanStakedWei, tokenDecimals));
    const poolEffectiveStake = creatorStaked + totalFanStaked;

    const step1_poolData = {
      nodeAddr,
      creatorCutBps,
      creatorStaked,
      totalFanStaked,
      poolEffectiveStake,
    };

    console.log(`[APY DEBUG] Pool ${poolAddress}: NODE=${nodeAddr}, fanStaked=${totalFanStaked}`);

    const nodes = (await publicClient.readContract({
      address: chain.contracts.NODE_MANAGER.address,
      abi: NODE_MANAGER_ABI,
      functionName: "getNodes",
    })) as Address[];

    let totalSystemStake = 0n;
    const batchSize = 5;

    for (let i = 0; i < nodes.length; i += batchSize) {
      const batch = nodes.slice(i, i + batchSize);
      const batchCalls = batch.map(node => ({
        address: chain.contracts.NODE_MANAGER.address,
        abi: NODE_MANAGER_ABI,
        functionName: "nodeTotalDelegation" as const,
        args: [node as Address] as const,
      }));

      const batchResults = await publicClient.multicall({
        contracts: batchCalls,
        allowFailure: false,
      });

      const delegations = batchResults as bigint[];
      for (const delegation of delegations) {
        totalSystemStake += delegation;
      }
    }

    const [batchCount] = (await publicClient.multicall({
      contracts: [
        {
          address: chain.contracts.NODE_MANAGER.address,
          abi: NODE_MANAGER_ABI,
          functionName: "batchCount" as const,
        },
      ],
      allowFailure: false,
    })) as [bigint];

    const rewardPerBatchWei = await publicClient.readContract({
      address: chain.contracts.NODE_MANAGER.address,
      abi: NODE_MANAGER_ABI,
      functionName: "rewardPerBlock",
      args: [batchCount],
    });

    const rewardPerBatch = Number(formatUnits(rewardPerBatchWei as bigint, tokenDecimals));
    const annualSystemRewards = rewardPerBatch * batchesPerYear;

    const step2_globalSystemData = {
      totalNodes: nodes.length,
      totalSystemStake: Number(formatUnits(totalSystemStake, tokenDecimals)),
      batchCount,
      rewardPerBatch,
      annualSystemRewards,
    };

    const nodeCalls = [
      {
        address: chain.contracts.NODE_MANAGER.address,
        abi: NODE_MANAGER_ABI,
        functionName: "nodeTotalDelegation" as const,
        args: [nodeAddr as Address] as const,
      },
      {
        address: chain.contracts.NODE_MANAGER.address,
        abi: NODE_MANAGER_ABI,
        functionName: "nodeCutBps" as const,
        args: [nodeAddr as Address] as const,
      },
    ];

    const nodeResults = await publicClient.multicall({
      contracts: nodeCalls,
      allowFailure: false,
    });

    const nodeTotalStakeWei = nodeResults[0] as bigint;
    const initialNodeCutBps = nodeResults[1] as bigint;

    const nodeTotalStake = Number(formatUnits(nodeTotalStakeWei, tokenDecimals));
    let nodeCutBps = initialNodeCutBps;

    if (nodeCutBps === 0n) {
      nodeCutBps = BigInt(CONFIG.defaultNodeCutBps);
    }

    const nodeCutPercentage = Number(nodeCutBps) / 100;

    const step3_nodeData = {
      nodeTotalStake,
      nodeCutBps,
      nodeCutPercentage,
    };

    const totalSystemStakeTokens = Number(formatUnits(totalSystemStake, tokenDecimals));
    const nodeWinProb = nodeTotalStake / totalSystemStakeTokens;
    const nodeAnnualGross = annualSystemRewards * nodeWinProb;
    const nodeAnnualNet = (nodeAnnualGross * (10000 - Number(nodeCutBps))) / 10000;
    const poolShare = poolEffectiveStake / nodeTotalStake;
    const poolAnnualRewards = nodeAnnualNet * poolShare;
    const fanAnnualToPool = (poolAnnualRewards * (10000 - Number(creatorCutBps))) / 10000;
    const apy = (fanAnnualToPool / totalFanStaked) * 100;
    const finalApy = Math.round(apy * 100);

    const step4_calculation = {
      totalSystemStakeTokens,
      nodeWinProb,
      nodeAnnualGross,
      nodeAnnualNet,
      poolShare,
      poolAnnualRewards,
      fanAnnualToPool,
      apy,
      finalApy,
      apyPercentage: (finalApy / 100).toFixed(2),
    };

    console.log(
      `[APY DEBUG] Pool ${poolAddress}: APY=${finalApy} bps (${step4_calculation.apyPercentage}%)`
    );

    return {
      step1_poolData,
      step2_globalSystemData,
      step3_nodeData,
      step4_calculation,
    };
  } catch (error) {
    console.error(`[APY DEBUG] calculatePoolAPYDebug END - Error caught:`, error);
    return null;
  }
}
