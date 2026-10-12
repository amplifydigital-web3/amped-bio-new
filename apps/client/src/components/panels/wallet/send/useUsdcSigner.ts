import { useCallback } from "react";
import { useChainId, useSignTypedData, useSwitchChain } from "wagmi";
import type { Hex } from "viem";
import { TRANSFER_WITH_AUTHORIZATION_TYPES } from "@repo/web3";
import { paymentChain } from "@/utils/paymentChain";

/** The typed data wallet.sendUsdc.prepare returns, with amounts as strings. */
export type UsdcTypedData = {
  domain: { name: string; version: string; chainId: number; verifyingContract: `0x${string}` };
  message: {
    from: `0x${string}`;
    to: `0x${string}`;
    value: string;
    validAfter: string;
    validBefore: string;
    nonce: `0x${string}`;
  };
};

/**
 * Signs a USDC transfer authorization on the payment chain (spec 3.3). The
 * wallet stays on Libertas for everything else, so this switches to Base just
 * for the signature and back after, even when the fan cancels.
 */
export function useUsdcSigner() {
  const chainId = useChainId();
  const { switchChainAsync } = useSwitchChain();
  const { signTypedDataAsync } = useSignTypedData();

  return useCallback(
    async (typed: UsdcTypedData): Promise<Hex> => {
      const original = chainId;
      if (original !== paymentChain.id) await switchChainAsync({ chainId: paymentChain.id });
      try {
        return await signTypedDataAsync({
          domain: typed.domain,
          types: TRANSFER_WITH_AUTHORIZATION_TYPES,
          primaryType: "TransferWithAuthorization",
          message: {
            from: typed.message.from,
            to: typed.message.to,
            value: BigInt(typed.message.value),
            validAfter: BigInt(typed.message.validAfter),
            validBefore: BigInt(typed.message.validBefore),
            nonce: typed.message.nonce,
          },
        });
      } finally {
        if (original !== paymentChain.id) {
          await switchChainAsync({ chainId: original }).catch(() => undefined);
        }
      }
    },
    [chainId, switchChainAsync, signTypedDataAsync]
  );
}
