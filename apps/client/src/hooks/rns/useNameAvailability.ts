import { useChainId, useReadContracts } from "wagmi";
import { formatEther } from "viem";
import { REGISTRATION_DURATIONS } from "@/config/rns/constants";
import { getChainConfig, REGISTRAR_CONTROLLER_ABI } from "@repo/web3";

export function useNameAvailability(
  name: string,
  duration: bigint = BigInt(REGISTRATION_DURATIONS["1_year"])
) {
  const chainId = useChainId();
  const networkConfig = getChainConfig(chainId);
  const registrarAddress = networkConfig?.contracts.REGISTRAR_CONTROLLER.address;

  const enabled = Boolean(name && registrarAddress);

  const { data, isLoading, error } = useReadContracts({
    contracts: [
      {
        address: registrarAddress as `0x${string}`,
        abi: REGISTRAR_CONTROLLER_ABI,
        functionName: "available",
        args: [name],
      },
      {
        address: registrarAddress as `0x${string}`,
        abi: REGISTRAR_CONTROLLER_ABI,
        functionName: "registerPrice",
        args: [name, BigInt(duration)],
      },
      {
        address: registrarAddress as `0x${string}`,
        abi: REGISTRAR_CONTROLLER_ABI,
        functionName: "minRegistrationDuration",
        args: [],
      },
    ],
    query: {
      enabled,
      staleTime: 30_000, // 30s — re-validate availability so expired names aren't stale
      gcTime: 5 * 60_000, // 5 min
      refetchOnMount: true,
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
    },
  });

  // Destructure results safely; `status === "failure"` yields `undefined`.
  const isAvailable = data?.[0]?.status === "success" ? data[0].result : undefined;
  const price = data?.[1]?.status === "success" ? data[1].result : undefined;
  const minDuration = data?.[2]?.status === "success" ? data[2].result : undefined;

  return {
    isAvailable,
    price: price ? formatEther(price as bigint) : null,
    isPriceLoading: isLoading,
    isLoading: enabled && isLoading,
    minDuration: minDuration as bigint | undefined,
    errors: {
      availability: error,
      price: error,
    },
  };
}