import { useAccount, useReadContract } from "wagmi";
import type { PublicClient } from "viem";
import { getChainConfig, libertasTestnet, REGISTRAR_CONTROLLER_ABI } from "@repo/web3";
import { useFeeEstimate, useTrackedWrite } from "./useRegistration";

/**
 * Screen Review 080 I03, I05: extend one RNS name. Renewal price is rentPrice
 * base plus premium; the network fee is estimated for the exact renew call;
 * Paid comes from the receipt. Any connected wallet may pay.
 */
export function useRenewName(label: string, durationSeconds: bigint | undefined) {
  const { address, chainId } = useAccount();
  const chain = getChainConfig(chainId ?? 0) ?? libertasTestnet;
  const controller = chain.contracts.REGISTRAR_CONTROLLER.address;
  const tracked = useTrackedWrite();

  const price = useReadContract({
    address: controller,
    abi: REGISTRAR_CONTROLLER_ABI,
    functionName: "rentPrice",
    args: [label, durationSeconds ?? 0n],
    chainId: chain.id,
    query: { enabled: !!label && !!durationSeconds, staleTime: 15_000 },
  });
  const priceWei = price.data ? price.data.base + price.data.premium : undefined;

  const request =
    priceWei !== undefined && durationSeconds
      ? {
          address: controller,
          abi: REGISTRAR_CONTROLLER_ABI,
          functionName: "renew" as const,
          args: [label, durationSeconds] as const,
          value: priceWei,
        }
      : null;

  const fee = useFeeEstimate(
    ["renew", label, durationSeconds?.toString(), priceWei?.toString(), address, chain.id],
    !!request && !!address,
    (client: PublicClient) => client.estimateContractGas({ ...request!, account: address! })
  );

  return {
    priceWei,
    priceLoading: price.isLoading,
    priceFailed: price.isError,
    retryPrice: () => void price.refetch(),
    feeWei: fee.data,
    feeLoading: fee.isLoading,
    feeFailed: fee.isError,
    retryFee: () => void fee.refetch(),
    tx: tracked.state,
    renew: () =>
      request
        ? tracked.run(request as unknown as Parameters<typeof tracked.run>[0], request.value)
        : Promise.resolve(false),
    reset: tracked.reset,
  };
}
