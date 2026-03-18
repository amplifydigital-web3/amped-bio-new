import { useChainId, useReadContract } from "wagmi";
import { formatEther } from "viem";
import { REGISTRATION_DURATIONS } from "@/config/rns/constants";
import { getChainConfig, REGISTRAR_CONTROLLER_ABI } from "@ampedbio/web3";

export function useNameAvailability(
  name: string,
  duration: bigint = BigInt(REGISTRATION_DURATIONS["1_year"])
) {
  const chainId = useChainId();
  const networkConfig = getChainConfig(chainId);
  const registrarAddress = networkConfig?.contracts.REGISTRAR_CONTROLLER.address;

  const {
    data: isAvailable,
    isLoading: isCheckingAvailability,
    error: availabilityError,
  } = useReadContract({
    address: registrarAddress,
    abi: REGISTRAR_CONTROLLER_ABI,
    functionName: "available",
    args: [name],
    query: {
      enabled: Boolean(name && registrarAddress),
    },
  });

  const priceQueryEnabled = Boolean(
    name && registrarAddress && isAvailable !== undefined && isAvailable !== null
  );

  const {
    data: price,
    isLoading: isLoadingPrice,
    error: priceError,
  } = useReadContract({
    address: registrarAddress as `0x${string}`,
    abi: REGISTRAR_CONTROLLER_ABI,
    functionName: "registerPrice",
    args: [name, BigInt(duration)],
    query: {
      enabled: priceQueryEnabled,
    },
  });

  const { data: minDuration } = useReadContract({
    address: registrarAddress as `0x${string}`,
    abi: REGISTRAR_CONTROLLER_ABI,
    functionName: "minRegistrationDuration",
    args: [],
    query: {
      enabled: Boolean(registrarAddress),
    },
  });

  return {
    isAvailable,
    price: price ? formatEther(price) : null,
    isPriceLoading: isLoadingPrice,
    isLoading: isCheckingAvailability,
    minDuration,
    errors: {
      availability: availabilityError,
      price: priceError,
    },
  };
}
