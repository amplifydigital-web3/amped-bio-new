import type { Address, PublicClient, Abi } from "viem";
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

async function batchMulticall(
  calls: Array<{ address: Address; abi: Abi; functionName: string; args?: readonly unknown[] }>,
  publicClient: PublicClient,
  batchSize: number = 5
): Promise<any[]> {
  const allResults: any[] = [];

  for (let i = 0; i < calls.length; i += batchSize) {
    const batch = calls.slice(i, i + batchSize);
    const results = await publicClient.multicall({
      contracts: batch,
      allowFailure: false,
    });
    allResults.push(...results);
  }

  return allResults;
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

    // 1. Get all pool data using multicall
    console.log(
      `[APY DEBUG] STEP 1: Fetching pool data for ${poolAddresses.length} pools via multicall...`
    );

    const poolCalls: Array<{ address: Address; abi: Abi; functionName: string }> = [];
    const poolCallsIndex: Map<
      Address,
      { nodeIdx: number; cutIdx: number; creatorStakedIdx: number; fanStakedIdx: number }
    > = new Map();

    for (const poolAddress of poolAddresses) {
      const baseIndex = poolCalls.length;
      poolCallsIndex.set(poolAddress, {
        nodeIdx: baseIndex,
        cutIdx: baseIndex + 1,
        creatorStakedIdx: baseIndex + 2,
        fanStakedIdx: baseIndex + 3,
      });
      poolCalls.push({ address: poolAddress, abi: CREATOR_POOL_ABI as Abi, functionName: "NODE" });
      poolCalls.push({
        address: poolAddress,
        abi: CREATOR_POOL_ABI as Abi,
        functionName: "creatorCut",
      });
      poolCalls.push({
        address: poolAddress,
        abi: CREATOR_POOL_ABI as Abi,
        functionName: "creatorStaked",
      });
      poolCalls.push({
        address: poolAddress,
        abi: CREATOR_POOL_ABI as Abi,
        functionName: "totalFanStaked",
      });
    }

    const poolResults = await batchMulticall(poolCalls, publicClient, 5);

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

    for (const poolAddress of poolAddresses) {
      const indices = poolCallsIndex.get(poolAddress);
      if (!indices) continue;

      const nodeAddr = poolResults[indices.nodeIdx] as Address;
      const creatorCutBps = poolResults[indices.cutIdx] as bigint;
      const creatorStakedWei = poolResults[indices.creatorStakedIdx] as bigint;
      const totalFanStakedWei = poolResults[indices.fanStakedIdx] as bigint;

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

    console.log(`[APY DEBUG] ✓ SUCCESS: Fetched data for ${poolDataMap.size} pools via multicall`);

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

    console.log(`[APY DEBUG] Fetching delegations for ${nodes.length} nodes via multicall...`);
    const delegationCalls: Array<{
      address: Address;
      abi: Abi;
      functionName: string;
      args: [Address];
    }> = nodes.map(node => ({
      address: chain.contracts.NODE_MANAGER.address,
      abi: NODE_MANAGER_ABI as Abi,
      functionName: "nodeTotalDelegation",
      args: [node as Address],
    }));

    const delegationResults = await batchMulticall(delegationCalls, publicClient, 5);

    let totalSystemStake = 0n;
    for (let i = 0; i < nodes.length; i++) {
      totalSystemStake += delegationResults[i] as bigint;
    }

    console.log(`[APY DEBUG] ✓ Total system stake calculated: ${totalSystemStake} wei`);

    console.log(`[APY DEBUG] Fetching batch count and reward per batch...`);
    const globalCalls = [
      {
        address: chain.contracts.NODE_MANAGER.address,
        abi: NODE_MANAGER_ABI as Abi,
        functionName: "batchCount" as const,
      },
      {
        address: chain.contracts.NODE_MANAGER.address,
        abi: NODE_MANAGER_ABI as Abi,
        functionName: "rewardPerBlock" as const,
        args: [] as any[],
      },
    ];

    console.log(`[APY DEBUG] Fetching batchCount first...`);
    const [batchCountResult] = await batchMulticall(globalCalls.slice(0, 1), publicClient, 5);
    const batchCount = batchCountResult as bigint;
    console.log(`[APY DEBUG] ✓ SUCCESS: NODE_MANAGER.batchCount() returned: ${batchCount}`);

    console.log(`[APY DEBUG] Fetching rewardPerBlock with batchCount...`);
    const rewardCall = [
      {
        address: chain.contracts.NODE_MANAGER.address,
        abi: NODE_MANAGER_ABI as Abi,
        functionName: "rewardPerBlock" as const,
        args: [batchCount],
      },
    ];
    const [rewardPerBatchWei] = await batchMulticall(rewardCall, publicClient, 5);

    const rewardPerBatch = Number(formatUnits(rewardPerBatchWei as bigint, CONFIG.tokenDecimals));
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
      `[APY DEBUG] Fetching nodeCutBps for ${uniqueNodes.length} unique nodes via multicall...`
    );

    const nodeCutCalls: Array<{
      address: Address;
      abi: Abi;
      functionName: string;
      args: [Address];
    }> = uniqueNodes.map(nodeAddr => ({
      address: chain.contracts.NODE_MANAGER.address,
      abi: NODE_MANAGER_ABI as Abi,
      functionName: "nodeCutBps",
      args: [nodeAddr as Address],
    }));

    const nodeCutResults = await batchMulticall(nodeCutCalls, publicClient, 5);

    const nodeDataMap = new Map<Address, { nodeTotalStake: number; nodeCutBps: bigint }>();

    for (let i = 0; i < uniqueNodes.length; i++) {
      const nodeAddr = uniqueNodes[i] as Address;
      const nodeIndex = nodes.indexOf(nodeAddr);
      const nodeTotalStakeWei = nodeIndex >= 0 ? (delegationResults[nodeIndex] as bigint) : 0n;
      const initialNodeCutBps = nodeCutResults[i] as bigint;

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

    console.log(
      `[APY DEBUG] ✓ SUCCESS: Fetched data for ${nodeDataMap.size} unique nodes via multicall`
    );

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

    const nodeAddr = (await publicClient.readContract({
      address: poolAddress,
      abi: CREATOR_POOL_ABI,
      functionName: "NODE",
    })) as Address;
    const creatorCutBps = (await publicClient.readContract({
      address: poolAddress,
      abi: CREATOR_POOL_ABI,
      functionName: "creatorCut",
    })) as bigint;
    const creatorStakedWei = (await publicClient.readContract({
      address: poolAddress,
      abi: CREATOR_POOL_ABI,
      functionName: "creatorStaked",
    })) as bigint;
    const totalFanStakedWei = (await publicClient.readContract({
      address: poolAddress,
      abi: CREATOR_POOL_ABI,
      functionName: "totalFanStaked",
    })) as bigint;

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

    for (const node of nodes) {
      const delegation = (await publicClient.readContract({
        address: chain.contracts.NODE_MANAGER.address,
        abi: NODE_MANAGER_ABI,
        functionName: "nodeTotalDelegation",
        args: [node as Address],
      })) as bigint;
      totalSystemStake += delegation;
    }

    const batchCount = (await publicClient.readContract({
      address: chain.contracts.NODE_MANAGER.address,
      abi: NODE_MANAGER_ABI,
      functionName: "batchCount",
    })) as bigint;

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

    const nodeTotalStakeWei = (await publicClient.readContract({
      address: chain.contracts.NODE_MANAGER.address,
      abi: NODE_MANAGER_ABI,
      functionName: "nodeTotalDelegation",
      args: [nodeAddr as Address],
    })) as bigint;
    const initialNodeCutBps = (await publicClient.readContract({
      address: chain.contracts.NODE_MANAGER.address,
      abi: NODE_MANAGER_ABI,
      functionName: "nodeCutBps",
      args: [nodeAddr as Address],
    })) as bigint;

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

    if (totalSystemStakeTokens === 0) {
      console.log(
        `[APY DEBUG] Pool ${poolAddress}: totalSystemStakeTokens is zero, returning null`
      );
      return null;
    }

    const nodeWinProb = nodeTotalStake / totalSystemStakeTokens;
    const nodeAnnualGross = annualSystemRewards * nodeWinProb;

    const nodeCutBpsNum = Number(nodeCutBps);
    const nodeAnnualNet = (nodeAnnualGross * (10000 - nodeCutBpsNum)) / 10000;

    if (nodeTotalStake === 0) {
      console.log(`[APY DEBUG] Pool ${poolAddress}: nodeTotalStake is zero, returning null`);
      return null;
    }

    let poolShare = poolEffectiveStake / nodeTotalStake;
    poolShare = Math.max(0, Math.min(1, poolShare));
    const poolAnnualRewards = nodeAnnualNet * poolShare;

    const creatorCutBpsNum = Number(creatorCutBps);
    const fanAnnualToPool = (poolAnnualRewards * (10000 - creatorCutBpsNum)) / 10000;

    if (totalFanStaked === 0) {
      console.log(`[APY DEBUG] Pool ${poolAddress}: totalFanStaked is zero, returning null`);
      return null;
    }

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
