import { useReadContract, useWriteContract, useChainId } from "wagmi";
import { getChainConfig, REGISTRAR_CONTROLLER_ABI } from "@ampedbio/web3";

export function useRenewal(name: string, duration: bigint) {
  const { writeContractAsync } = useWriteContract();
  const chainId = useChainId();
  const networkConfig = getChainConfig(chainId);

  const registrarController = networkConfig?.contracts?.REGISTRAR_CONTROLLER.address;

  const { data, isLoading } = useReadContract({
    address: registrarController,
    abi: REGISTRAR_CONTROLLER_ABI,
    functionName: "rentPrice",
    args: [name, duration],
    query: {
      enabled: Boolean(name && duration > 0n && registrarController),
    },
  });

  const price = data ? data.base + data.premium : null;

  const renew = async () => {
    if (!registrarController) {
      throw new Error("Unsupported network");
    }

    if (!price) {
      throw new Error("Renewal price not available");
    }

    const renewal = await writeContractAsync({
      address: registrarController,
      abi: REGISTRAR_CONTROLLER_ABI,
      functionName: "renew",
      args: [name, duration],
      value: price,
    });

    return renewal;
  };

  return {
    renew,
    price,
    isPriceLoading: isLoading,
  };
}
