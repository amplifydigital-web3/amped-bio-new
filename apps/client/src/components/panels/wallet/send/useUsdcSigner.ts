import { useCallback } from "react";
import { useChainId, useConnectorClient, useSignTypedData, useSwitchChain } from "wagmi";
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

const SWITCH_POLL_MS = 100;
const SWITCH_WAIT_MS = 5_000;
const SIGN_RETRIES = 2;

function isSwitchingNetworksError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error ?? "");
  return message.includes("is switching networks");
}

/**
 * Signs a USDC transfer authorization on the payment chain (spec 3.3). The
 * wallet stays on Libertas for everything else, so this switches to Base just
 * for the signature and back after, even when the fan cancels.
 */
export function useUsdcSigner() {
  const chainId = useChainId();
  const { switchChainAsync } = useSwitchChain();
  const { signTypedDataAsync } = useSignTypedData();
  const { data: walletClient } = useConnectorClient();

  return useCallback(
    async (typed: UsdcTypedData): Promise<Hex> => {
      const original = chainId;
      console.info(
        `[usdc-sign] start: wallet chainId=${original}, payment chainId=${paymentChain.id}`
      );
      if (original !== paymentChain.id) {
        console.info("[usdc-sign] switching to payment chain...", {
          rpcTarget: paymentChain.rpcUrls.default.http[0],
        });
        try {
          await switchChainAsync({ chainId: paymentChain.id });
          console.info("[usdc-sign] switchChainAsync resolved");
        } catch (switchError) {
          console.error("[usdc-sign] switchChainAsync failed", switchError);
          throw switchError;
        }
        // Web3Auth resolves the switch before its middleware reports the new
        // chain, and a signature arriving mid-switch is refused with
        // "Cannot sign messages ... switching networks". Wait until the
        // wallet actually reports the payment chain before signing.
        const deadline = Date.now() + SWITCH_WAIT_MS;
        let polls = 0;
        while (Date.now() < deadline) {
          polls++;
          try {
            const current = await walletClient?.request({ method: "eth_chainId" } as const);
            const parsed = current ? Number.parseInt(current, 16) : null;
            if (polls <= 5 || polls % 10 === 0) {
              console.info(`[usdc-sign] poll #${polls}: eth_chainId=${parsed ?? "(no client)"}`);
            }
            if (parsed === paymentChain.id) {
              console.info(`[usdc-sign] wallet reports payment chain after ${polls} polls`);
              break;
            }
          } catch (pollError) {
            if (polls <= 5 || polls % 10 === 0) {
              console.warn(`[usdc-sign] poll #${polls} threw`, pollError);
            }
          }
          await new Promise(resolve => setTimeout(resolve, SWITCH_POLL_MS));
        }
        if (Date.now() >= deadline) {
          console.warn(`[usdc-sign] wait timed out after ${polls} polls; signing anyway`);
        }
      }
      try {
        for (let attempt = 0; ; attempt++) {
          try {
            console.info(
              `[usdc-sign] signTypedData attempt ${attempt + 1}, domain.chainId=${typed.domain.chainId}`
            );
            const signature = await signTypedDataAsync({
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
            console.info(`[usdc-sign] signed on attempt ${attempt + 1}`);
            return signature;
          } catch (error) {
            console.error(`[usdc-sign] sign attempt ${attempt + 1} failed`, error);
            if (attempt >= SIGN_RETRIES || !isSwitchingNetworksError(error)) throw error;
            console.warn(
              `[usdc-sign] switching-networks error; retrying after ${SWITCH_POLL_MS * (attempt + 1)}ms`
            );
            await new Promise(resolve => setTimeout(resolve, SWITCH_POLL_MS * (attempt + 1)));
          }
        }
      } finally {
        if (original !== paymentChain.id) {
          console.info(`[usdc-sign] switching back to chain ${original}`);
          await switchChainAsync({ chainId: original }).catch(backError => {
            console.warn("[usdc-sign] switch back failed", backError);
          });
          console.info("[usdc-sign] switched back");
        }
      }
    },
    [chainId, switchChainAsync, signTypedDataAsync, walletClient]
  );
}
