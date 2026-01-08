import { useParams, useNavigate } from "react-router-dom";
import { useReadContracts, useReadContract } from "wagmi";
import { CREATOR_POOL_ABI } from "@ampedbio/web3";
import { type Address } from "viem";
import { formatEther } from "viem";
import { getChainConfig } from "@ampedbio/web3";
import { Button } from "../components/ui/Button";
import { useEffect, useState } from "react";
import { trpc } from "../utils/trpc/trpc";

export function PoolDebugPage() {
  const { address: poolAddress } = useParams<{ address: string }>();
  const navigate = useNavigate();
  const [chainId, setChainId] = useState<number | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // First, fetch pool info to get the chainId
  const { data: poolInfo, isLoading: isPoolLoading } = trpc.pools.fan.getPoolDetailsForModal.useQuery(
    {
      poolAddress: poolAddress || undefined,
      walletAddress: undefined, // We don't need wallet info for debug
    },
    {
      enabled: !!poolAddress,
      staleTime: 1000 * 60,
    }
  );

  // When pool info is loaded, set the chainId
  useEffect(() => {
    if (poolInfo && poolInfo.chainId) {
      setChainId(Number(poolInfo.chainId));
    }
  }, [poolInfo]);

  // Prepare contracts to read from blockchain
  const contracts = chainId ? [
    { 
      address: poolAddress as Address, 
      abi: CREATOR_POOL_ABI, 
      functionName: "poolName",
    },
    { 
      address: poolAddress as Address, 
      abi: CREATOR_POOL_ABI, 
      functionName: "CREATOR",
    },
    { 
      address: poolAddress as Address, 
      abi: CREATOR_POOL_ABI, 
      functionName: "creatorCut",
    },
    { 
      address: poolAddress as Address, 
      abi: CREATOR_POOL_ABI, 
      functionName: "totalFanStaked",
    },
    { 
      address: poolAddress as Address, 
      abi: CREATOR_POOL_ABI, 
      functionName: "creatorStaked",
    },
    { 
      address: poolAddress as Address, 
      abi: CREATOR_POOL_ABI, 
      functionName: "accRewardPerShare",
    },
    { 
      address: poolAddress as Address, 
      abi: CREATOR_POOL_ABI, 
      functionName: "pendingRewards",
    },
    { 
      address: poolAddress as Address, 
      abi: CREATOR_POOL_ABI, 
      functionName: "FACTORY",
    },
    { 
      address: poolAddress as Address, 
      abi: CREATOR_POOL_ABI, 
      functionName: "NODE",
    },
    { 
      address: poolAddress as Address, 
      abi: CREATOR_POOL_ABI, 
      functionName: "MAX_CREATOR_CUT",
    },
    { 
      address: poolAddress as Address, 
      abi: CREATOR_POOL_ABI, 
      functionName: "PRECISION",
    },
  ] : [];

  const { data: contractData, isLoading: isContractLoading, error: contractError } = useReadContracts({
    contracts: contracts as any,
    query: {
      enabled: !!poolAddress && !!chainId,
    },
  });

  // Get creator's stake and reward debt
  const creatorAddress = contractData?.[1]?.result as Address | undefined;
  const { data: creatorStakeData } = useReadContract({
    address: poolAddress as Address,
    abi: CREATOR_POOL_ABI,
    functionName: "fanStakes",
    args: creatorAddress ? [creatorAddress] : undefined,
    query: {
      enabled: !!poolAddress && !!chainId && !!creatorAddress,
    },
  });

  const { data: creatorRewardDebtData } = useReadContract({
    address: poolAddress as Address,
    abi: CREATOR_POOL_ABI,
    functionName: "rewardDebt",
    args: creatorAddress ? [creatorAddress] : undefined,
    query: {
      enabled: !!poolAddress && !!chainId && !!creatorAddress,
    },
  });

  // Combine all data and loading states
  useEffect(() => {
    if (isPoolLoading || isContractLoading) {
      setIsLoading(true);
    } else {
      setIsLoading(false);
    }
  }, [isPoolLoading, isContractLoading]);

  useEffect(() => {
    if (contractError) {
      setError(contractError.message);
    } else if (!poolAddress) {
      setError("Pool address not provided");
    } else {
      setError(null);
    }
  }, [contractError, poolAddress]);

  const handleBack = () => {
    navigate(`/i/pools/${poolAddress}`);
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-900 text-white p-6">
        <div className="max-w-6xl mx-auto">
          <div className="bg-gray-800 rounded-lg p-6">
            <h1 className="text-2xl font-bold mb-4">Pool Debug - Loading...</h1>
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

  if (error || !contractData) {
    return (
      <div className="min-h-screen bg-gray-900 text-white p-6">
        <div className="max-w-6xl mx-auto">
          <div className="bg-gray-800 rounded-lg p-6">
            <h1 className="text-2xl font-bold mb-4">Pool Debug - Error</h1>
            <div className="bg-red-900/50 border border-red-700 rounded-lg p-4">
              <p className="text-red-300">
                {error || "Failed to load pool data from blockchain"}
              </p>
            </div>
            <Button onClick={handleBack} className="mt-4">
              Back to Pool
            </Button>
          </div>
        </div>
      </div>
    );
  }

  const chainConfig = getChainConfig(chainId || 73863); // Default to libertas testnet
  const currencySymbol = chainConfig?.nativeCurrency.symbol || "REVO";

  return (
    <div className="min-h-screen bg-gray-900 text-white p-4 md:p-6">
      <div className="max-w-6xl mx-auto">
        <div className="bg-gray-800 rounded-lg p-6">
          {/* Header */}
          <div className="flex items-center justify-between mb-6">
            <h1 className="text-2xl font-bold">
              Pool Debug: {contractData[0]?.result as string || "Unknown Pool"}
            </h1>
            <Button onClick={handleBack} variant="secondary">
              ← Back to Pool
            </Button>
          </div>

          {/* Pool Address */}
          <div className="mb-6">
            <h2 className="text-lg font-semibold mb-2">Pool Address</h2>
            <div className="bg-gray-700 rounded-lg p-3 font-mono text-sm break-all">
              {poolAddress}
            </div>
          </div>

          {/* Chain Info */}
          <div className="mb-6">
            <h2 className="text-lg font-semibold mb-2">Chain Information</h2>
            <div className="bg-gray-700 rounded-lg p-3 font-mono text-sm">
              <div><span className="text-gray-400">Chain ID:</span> {chainId}</div>
              <div><span className="text-gray-400">Chain Name:</span> {chainConfig?.name || "Unknown"}</div>
              <div><span className="text-gray-400">Currency:</span> {currencySymbol}</div>
            </div>
          </div>

          {/* Core Pool Data */}
          <div className="mb-6">
            <h2 className="text-lg font-semibold mb-2">Core Pool Data</h2>
            <div className="bg-gray-700 rounded-lg p-4 font-mono text-sm overflow-x-auto">
              <pre className="whitespace-pre-wrap">
{`Pool Name: ${contractData[0]?.result as string}
Creator Address: ${contractData[1]?.result as Address}
Creator Cut: ${contractData[2]?.result as bigint} (${Number(contractData[2]?.result) / 100}%)
Total Fan Staked: ${contractData[3]?.result as bigint} wei (${formatEther(contractData[3]?.result as bigint)} ${currencySymbol})
Creator Staked: ${contractData[4]?.result as bigint} wei (${formatEther(contractData[4]?.result as bigint)} ${currencySymbol})
Accumulated Reward Per Share: ${contractData[5]?.result as bigint}
Pending Rewards: ${contractData[6]?.result as bigint} wei (${formatEther(contractData[6]?.result as bigint)} ${currencySymbol})
Creator's Own Stake: ${creatorStakeData?.result as bigint} wei (${formatEther(creatorStakeData?.result as bigint)} ${currencySymbol})
Creator's Reward Debt: ${creatorRewardDebtData?.result as bigint}
`}
              </pre>
            </div>
          </div>

          {/* Contract References */}
          <div className="mb-6">
            <h2 className="text-lg font-semibold mb-2">Contract References</h2>
            <div className="bg-gray-700 rounded-lg p-4 font-mono text-sm">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <div><span className="text-gray-400">FACTORY:</span> {contractData[7]?.result as Address}</div>
                  <div><span className="text-gray-400">NODE:</span> {contractData[8]?.result as Address}</div>
                </div>
                <div>
                  <div><span className="text-gray-400">MAX_CREATOR_CUT:</span> {contractData[9]?.result as bigint}</div>
                  <div><span className="text-gray-400">PRECISION:</span> {contractData[10]?.result as bigint}</div>
                </div>
              </div>
            </div>
          </div>

          {/* Raw Data Section */}
          <div className="mb-6">
            <h2 className="text-lg font-semibold mb-2">Raw Blockchain Data (JSON)</h2>
            <div className="bg-gray-700 rounded-lg p-4 font-mono text-xs overflow-x-auto">
              <pre>
{JSON.stringify({
  poolAddress: poolAddress,
  chainId: chainId,
  poolName: contractData[0]?.result,
  creatorAddress: contractData[1]?.result,
  creatorCut: contractData[2]?.result,
  totalFanStaked: contractData[3]?.result,
  creatorStaked: contractData[4]?.result,
  accRewardPerShare: contractData[5]?.result,
  pendingRewards: contractData[6]?.result,
  factory: contractData[7]?.result,
  node: contractData[8]?.result,
  maxCreatorCut: contractData[9]?.result,
  precision: contractData[10]?.result,
  creatorFanStake: creatorStakeData?.result,
  creatorRewardDebt: creatorRewardDebtData?.result,
}, null, 2)}
              </pre>
            </div>
          </div>

          {/* Additional Info */}
          <div className="mb-6">
            <h2 className="text-lg font-semibold mb-2">Additional Information</h2>
            <div className="bg-blue-900/30 border border-blue-700 rounded-lg p-4 text-sm">
              <p className="mb-2">
                This debug page shows raw blockchain data directly from the Creator Pool contract.
              </p>
              <p className="mb-2">
                All values are displayed in their raw format (wei for amounts, raw numbers for percentages).
              </p>
              <p>
                Use this information for debugging and development purposes only.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}