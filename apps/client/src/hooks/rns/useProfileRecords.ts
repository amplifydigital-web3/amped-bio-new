import { PROFILE_KEYS, ProfileKey } from "@/types/rns/name";
import { domainName } from "@/utils/rns";
import { getChainConfig, RESOLVER_ABI } from "@ampedbio/web3";
import { encodeFunctionData, namehash } from "viem";
import { useChainId, useWaitForTransactionReceipt, useWriteContract } from "wagmi";

export type ProfileUpdates = Partial<Record<ProfileKey, string>>;

export function useProfileRecords(name: string) {
  if (!name) throw new Error("Name is required");
  const revoName = domainName(name);
  const chainId = useChainId();
  const networkConfig = getChainConfig(chainId);
  const nodeHash = namehash(revoName);

  const resolverAddress = networkConfig?.contracts.L2_RESOLVER.address;

  const { writeContract, data: txHash, isPending, error: writeError } = useWriteContract();

  const {
    isLoading: isConfirming,
    isSuccess: isConfirmed,
    error: receiptError,
  } = useWaitForTransactionReceipt({
    hash: txHash,
  });

  const setRecords = async (updates: ProfileUpdates) => {
    const entries = Object.entries(updates) as [ProfileKey, string][];
    if (entries.length === 0) return;

    if (!resolverAddress) {
      throw new Error("Resolver address not available.");
    }

    if (entries.length === 1) {
      // Single record — skip multicall overhead
      const [key, value] = entries[0];
      writeContract({
        address: resolverAddress as `0x${string}`,
        abi: RESOLVER_ABI,
        functionName: "setText",
        args: [nodeHash, PROFILE_KEYS[key], value],
      });
      return;
    }

    // Multiple records — encode each setText call and batch via multicall
    const calldata = entries.map(([key, value]) =>
      encodeFunctionData({
        abi: RESOLVER_ABI,
        functionName: "setText",
        args: [nodeHash, PROFILE_KEYS[key], value],
      })
    );

    writeContract({
      address: resolverAddress as `0x${string}`,
      abi: RESOLVER_ABI,
      functionName: "multicallWithNodeCheck",
      args: [nodeHash, calldata],
    });
  };

  return {
    setRecords,
    txHash,
    isPending,
    isConfirming,
    isConfirmed,
    error: writeError || receiptError,
  };
}
