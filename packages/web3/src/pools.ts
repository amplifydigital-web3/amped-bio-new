import { Address, createPublicClient, http } from "viem";
import { getChainConfig, CREATOR_POOL_ABI } from "./index";

/**
 * @deprecated call using multicall instead
 */
export const getPoolName = async (poolAddress: Address, chainId: number): Promise<string> => {
  const chain = getChainConfig(chainId);
  if (!chain) {
    throw new Error("Unsupported chain ID");
  }

  const publicClient = createPublicClient({
    chain: chain,
    transport: http(),
  });

  try {
    const poolName = await publicClient.readContract({
      address: poolAddress,
      abi: CREATOR_POOL_ABI,
      functionName: "poolName",
    });
    return poolName as string;
  } catch (error) {
    console.error(`Error fetching pool name for ${poolAddress}:`, error);
    return "Unknown Pool";
  }
};
