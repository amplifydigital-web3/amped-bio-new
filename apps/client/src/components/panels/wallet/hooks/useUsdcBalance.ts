import { useQuery } from "@tanstack/react-query";
import { USDC_READ_ABI } from "@repo/web3";
import { paymentChain, paymentChainClient, paymentChainUsdc } from "@/utils/paymentChain";
import { USDC_FLAGS } from "@/config/usdc/flags";

/**
 * The wallet's USDC balance on the payment chain, read from Circle's contract
 * (Screen Review 137, spec 3.4). Refreshes every 30 seconds like wallet.balances.
 * Disabled while the flag is off or there is no address.
 */
export function useUsdcBalance(address: `0x${string}` | undefined) {
  return useQuery({
    queryKey: ["usdc-balance", paymentChain.id, address],
    enabled: USDC_FLAGS.wallet && !!address && !!paymentChainUsdc,
    refetchInterval: 30_000,
    queryFn: async () => {
      if (!address || !paymentChainUsdc) return 0n;
      return paymentChainClient().readContract({
        address: paymentChainUsdc,
        abi: USDC_READ_ABI,
        functionName: "balanceOf",
        args: [address],
      });
    },
  });
}
