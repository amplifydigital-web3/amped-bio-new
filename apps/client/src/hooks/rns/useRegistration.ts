import { useAccount, useWriteContract, useWaitForTransactionReceipt } from "wagmi";
import { encodeFunctionData, namehash, parseEther } from "viem";
import { normalize } from "viem/ens";
import { domainName } from "@/utils/rns";
import { getChainConfig, REGISTRAR_CONTROLLER_ABI, RESOLVER_ABI } from "@ampedbio/web3";
import { useState } from "react";

export function useRegistration() {
  const { address, chainId } = useAccount();
  const networkConfig = getChainConfig(chainId ?? 0);

  const { writeContractAsync, isPending } = useWriteContract();

  const [txHash, setTxHash] = useState<`0x${string}` | null>(null);

  const {
    isLoading: isConfirming,
    isSuccess: isConfirmed,
    isError: isReceiptError,
  } = useWaitForTransactionReceipt({
    hash: txHash ?? undefined,
    confirmations: 1,
  });

  const register = async (
    name: string,
    duration: bigint,
    rentPrice: string
  ): Promise<`0x${string}`> => {
    if (!address) throw new Error("Wallet not connected");
    if (!networkConfig?.contracts) throw new Error("Contracts not found for this chain.");

    const normalizedName = normalize(domainName(name));

    const resolverData = encodeFunctionData({
      abi: RESOLVER_ABI,
      functionName: "setAddr",
      args: [namehash(normalizedName), address],
    });

    const txHash = await writeContractAsync({
      address: networkConfig.contracts.REGISTRAR_CONTROLLER.address,
      abi: REGISTRAR_CONTROLLER_ABI,
      functionName: "register",
      args: [
        {
          name,
          owner: address,
          duration,
          resolver: networkConfig.contracts.L2_RESOLVER.address,
          data: [resolverData],
          reverseRecord: true,
        },
      ],
      value: parseEther(rentPrice),
    });

    setTxHash(txHash);
    return txHash;
  };

  return {
    register,
    // submission
    isSubmitting: isPending,
    // receipt lifecycle
    txHash,
    isConfirming,
    isConfirmed,
    isReceiptError,
  };
}
