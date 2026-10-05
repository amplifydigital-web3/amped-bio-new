import { useAccount, usePublicClient, useWriteContract, useWaitForTransactionReceipt } from "wagmi";
import { encodeFunctionData, parseEther, type Address, type PublicClient } from "viem";
import {
  BASE_REGISTRAR_ABI,
  getChainConfig,
  parseRnsInput,
  REGISTRAR_CONTROLLER_ABI,
  RESOLVER_ABI,
  REVERSE_REGISTRAR_ABI,
  rnsNode,
  rnsTokenId,
} from "@repo/web3";
import { useState } from "react";

type RnsContracts = NonNullable<ReturnType<typeof getChainConfig>>["contracts"];

/**
 * True when the wallet already has a primary RNS name it still owns: the
 * reverse record names a label and BaseRegistrar ownerOf that label is the
 * wallet (ownerOf reverts once the name expires).
 */
export async function walletHasPrimaryName(
  client: PublicClient,
  contracts: RnsContracts,
  wallet: Address,
  chainId: number
): Promise<boolean> {
  const node = await client.readContract({
    address: contracts.REVERSE_REGISTRAR.address,
    abi: REVERSE_REGISTRAR_ABI,
    functionName: "node",
    args: [wallet],
  });
  const name = (await client.readContract({
    address: contracts.L2_RESOLVER.address,
    abi: RESOLVER_ABI,
    functionName: "name",
    args: [node as `0x${string}`],
  })) as string;
  const label = name ? parseRnsInput(name, chainId) : "";
  if (!label) return false;
  try {
    const owner = (await client.readContract({
      address: contracts.BASE_REGISTRAR.address,
      abi: BASE_REGISTRAR_ABI,
      functionName: "ownerOf",
      args: [rnsTokenId(label)],
    })) as string;
    return owner.toLowerCase() === wallet.toLowerCase();
  } catch {
    // ownerOf reverts for an expired or transferred name: no live primary
    return false;
  }
}

export function useRegistration() {
  const { address, chainId } = useAccount();
  const networkConfig = getChainConfig(chainId ?? 0);
  const publicClient = usePublicClient();

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

    const resolverData = encodeFunctionData({
      abi: RESOLVER_ABI,
      functionName: "setAddr",
      args: [rnsNode(name, chainId), address],
    });

    // 078 D2: registering another RNS name keeps the current primary. Only a
    // wallet with no live primary gets the reverse record. If the check fails
    // the primary is left alone; Set as primary is offered after.
    let reverseRecord = false;
    if (publicClient && chainId) {
      try {
        reverseRecord = !(await walletHasPrimaryName(
          publicClient as PublicClient,
          networkConfig.contracts,
          address,
          chainId
        ));
      } catch (error) {
        console.warn("[rns] primary name check failed, keeping the primary as is:", error);
      }
    }

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
          reverseRecord,
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
