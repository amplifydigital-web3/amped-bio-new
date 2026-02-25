import { useParams, useNavigate } from "react-router";
import { usePublicClient } from "wagmi";
import { useChainId } from "wagmi";
import { useState, useEffect } from "react";
import { calculatePoolAPYDebug, APYDebugInfo } from "@ampedbio/web3";
import { Button } from "../components/ui/Button";

export function PoolAPYDebugPage() {
  const { address: poolAddress } = useParams<{ address: string }>();
  const navigate = useNavigate();
  const publicClient = usePublicClient();
  const chainId = useChainId();

  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [debugData, setDebugData] = useState<APYDebugInfo | null>(null);
  const [poolName, setPoolName] = useState<string>("Unknown");

  useEffect(() => {
    const fetchData = async () => {
      if (!poolAddress || !publicClient) {
        setError("Pool address or public client not available");
        setIsLoading(false);
        return;
      }

      try {
        setIsLoading(true);

        const { CREATOR_POOL_ABI } = await import("@ampedbio/web3");

        const poolNameResult = await publicClient.readContract({
          address: poolAddress as `0x${string}`,
          abi: CREATOR_POOL_ABI,
          functionName: "poolName",
        });

        setPoolName(poolNameResult as string);

        const result = await calculatePoolAPYDebug(
          poolAddress as `0x${string}`,
          chainId,
          publicClient
        );
        setDebugData(result);
        setError(null);
      } catch (err) {
        console.error("Error fetching APY debug data:", err);
        setError(err instanceof Error ? err.message : "Failed to fetch APY debug data");
      } finally {
        setIsLoading(false);
      }
    };

    fetchData();
  }, [poolAddress, publicClient, chainId]);

  const handleBack = () => {
    navigate(`/i/pools/${poolAddress}`);
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-900 text-white p-6">
        <div className="max-w-4xl mx-auto">
          <div className="bg-gray-800 rounded-lg p-6">
            <h1 className="text-2xl font-bold mb-4">APY Debug - Loading...</h1>
            <div className="animate-pulse">
              <div className="h-4 bg-gray-700 rounded mb-2"></div>
              <div className="h-4 bg-gray-700 rounded mb-2 w-3/4"></div>
              <div className="h-4 bg-gray-700 rounded mb-4 w-1/2"></div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (error || !debugData) {
    return (
      <div className="min-h-screen bg-gray-900 text-white p-6">
        <div className="max-w-4xl mx-auto">
          <div className="bg-gray-800 rounded-lg p-6">
            <h1 className="text-2xl font-bold mb-4">APY Debug - Error</h1>
            <div className="bg-red-900/50 border border-red-700 rounded-lg p-4">
              <p className="text-red-300">{error || "Failed to load APY debug data"}</p>
            </div>
            <Button onClick={handleBack} className="mt-4">
              Back to Pool
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-900 text-white p-6">
      <div className="max-w-4xl mx-auto">
        <div className="bg-gray-800 rounded-lg p-6">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h1 className="text-2xl font-bold">APY Debug: {poolName}</h1>
              <p className="text-gray-400 text-sm mt-1">{poolAddress}</p>
            </div>
            <Button onClick={handleBack} variant="outline">
              Back to Pool
            </Button>
          </div>

          <div className="space-y-6 font-mono text-sm">
            <div>
              <h2 className="text-lg font-bold text-blue-400 mb-3">STEP 1: Pool Data</h2>
              <pre className="bg-gray-900 rounded-lg p-4 whitespace-pre-wrap text-xs">
                {`Node Address: ${debugData.step1_poolData.nodeAddr}
Creator Cut: ${debugData.step1_poolData.creatorCutBps} bps (${(Number(debugData.step1_poolData.creatorCutBps) / 100).toFixed(2)}%)
Creator Staked: ${debugData.step1_poolData.creatorStaked.toFixed(6)} tokens
Total Fan Staked: ${debugData.step1_poolData.totalFanStaked.toFixed(6)} tokens
Pool Effective Stake: ${debugData.step1_poolData.poolEffectiveStake.toFixed(6)} tokens`}
              </pre>
            </div>

            <div>
              <h2 className="text-lg font-bold text-green-400 mb-3">STEP 2: Global System Data</h2>
              <pre className="bg-gray-900 rounded-lg p-4 whitespace-pre-wrap text-xs">
                {`Total Nodes: ${debugData.step2_globalSystemData.totalNodes}
Total System Stake: ${debugData.step2_globalSystemData.totalSystemStake.toFixed(6)} tokens
Batch Count: ${debugData.step2_globalSystemData.batchCount.toString()}
Reward Per Batch: ${debugData.step2_globalSystemData.rewardPerBatch.toFixed(6)} tokens
Annual System Rewards: ${debugData.step2_globalSystemData.annualSystemRewards.toFixed(6)} tokens
Batches Per Year: 525,600 (60 batches/hour × 24 × 365)`}
              </pre>
            </div>

            <div>
              <h2 className="text-lg font-bold text-yellow-400 mb-3">STEP 3: Node Data</h2>
              <pre className="bg-gray-900 rounded-lg p-4 whitespace-pre-wrap text-xs">
                {`Node Total Stake: ${debugData.step3_nodeData.nodeTotalStake.toFixed(6)} tokens
Node Cut: ${debugData.step3_nodeData.nodeCutBps} bps (${debugData.step3_nodeData.nodeCutPercentage.toFixed(2)}%)`}
              </pre>
            </div>

            <div>
              <h2 className="text-lg font-bold text-purple-400 mb-3">STEP 4: APY Calculation</h2>
              <pre className="bg-gray-900 rounded-lg p-4 whitespace-pre-wrap text-xs">
                {`1. Total System Stake (tokens): ${debugData.step4_calculation.totalSystemStakeTokens.toFixed(6)}

2. Node Win Probability:
   ${debugData.step3_nodeData.nodeTotalStake.toFixed(6)} / ${debugData.step4_calculation.totalSystemStakeTokens.toFixed(6)}
   = ${debugData.step4_calculation.nodeWinProb.toFixed(6)}

3. Node Annual Gross Rewards:
   ${debugData.step2_globalSystemData.annualSystemRewards.toFixed(6)} × ${debugData.step4_calculation.nodeWinProb.toFixed(6)}
   = ${debugData.step4_calculation.nodeAnnualGross.toFixed(6)} tokens/year

4. Node Annual Net Rewards (after node cut):
   ${debugData.step4_calculation.nodeAnnualGross.toFixed(6)} × (10000 - ${debugData.step3_nodeData.nodeCutBps}) / 10000
   = ${debugData.step4_calculation.nodeAnnualNet.toFixed(6)} tokens/year

5. Pool Share of Node Rewards:
   ${debugData.step1_poolData.poolEffectiveStake.toFixed(6)} / ${debugData.step3_nodeData.nodeTotalStake.toFixed(6)}
   = ${debugData.step4_calculation.poolShare.toFixed(6)}

6. Pool Annual Rewards:
   ${debugData.step4_calculation.nodeAnnualNet.toFixed(6)} × ${debugData.step4_calculation.poolShare.toFixed(6)}
   = ${debugData.step4_calculation.poolAnnualRewards.toFixed(6)} tokens/year

7. Fan Annual Rewards (after creator cut):
   ${debugData.step4_calculation.poolAnnualRewards.toFixed(6)} × (10000 - ${debugData.step1_poolData.creatorCutBps}) / 10000
   = ${debugData.step4_calculation.fanAnnualToPool.toFixed(6)} tokens/year

8. APY Calculation:
   (${debugData.step4_calculation.fanAnnualToPool.toFixed(6)} / ${debugData.step1_poolData.totalFanStaked.toFixed(6)}) × 100
   = ${debugData.step4_calculation.apy.toFixed(4)}%

9. Final APY (in basis points):
   ${debugData.step4_calculation.apy.toFixed(2)} × 100 = ${debugData.step4_calculation.finalApy} bps`}
              </pre>
            </div>

            <div>
              <h2 className="text-lg font-bold text-red-400 mb-3">FINAL RESULT</h2>
              <pre className="bg-gray-900 rounded-lg p-4 whitespace-pre-wrap text-xs">
                {`APY: ${debugData.step4_calculation.finalApy} bps (${debugData.step4_calculation.apyPercentage}%)`}
              </pre>
            </div>

            <div className="mt-8 p-4 bg-blue-900/30 border border-blue-700 rounded-lg">
              <h3 className="text-sm font-semibold text-blue-300 mb-2">APY Formula Explanation:</h3>
              <p className="text-xs text-blue-200">
                APY = (Annual Rewards / Total Fan Staked) × 100
              </p>
              <p className="text-xs text-blue-200 mt-2">
                Annual Rewards = System Annual Rewards × Node Win Probability × (1 - Node Cut) ×
                Pool Share × (1 - Creator Cut)
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
