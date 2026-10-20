import { useCallback } from "react";
import {
  useAccount,
  useChainId,
  useConnectorClient,
  useSignTypedData,
  useSwitchChain,
} from "wagmi";
import type { Hex } from "viem";
import type { UsdcClientFailure } from "@repo/constants";
import { TRANSFER_WITH_AUTHORIZATION_TYPES } from "@repo/web3";
import { paymentChain } from "@/utils/paymentChain";
import {
  ChainSwitchError,
  WalletDisconnectedError,
  WalletMismatchError,
  sameAddress,
} from "@/utils/walletSession";
import { classifyTxError } from "../../explore/pool-panel/format";

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

/** Maps a signing failure to the cause the server records and the line the fan sees. */
export function classifyUsdcSignError(error: unknown): UsdcClientFailure {
  if (error instanceof WalletMismatchError) {
    return error.changed ? "signer_changed" : "wallet_mismatch";
  }
  if (error instanceof WalletDisconnectedError) return "wallet_disconnected";
  // wagmi refuses `account: from` when the connector does not hold that key
  if ((error as { name?: string } | null)?.name === "ConnectorAccountNotFoundError") {
    return "wallet_mismatch";
  }
  if (error instanceof ChainSwitchError) {
    return classifyTxError(error.cause) === "rejected" ? "sign_rejected" : "chain_switch_failed";
  }
  return classifyTxError(error) === "rejected" ? "sign_rejected" : "sign_failed";
}

/** The part of a wallet client the account check reads. */
type AccountSource = {
  account?: { address: string };
  request: (args: { method: "eth_accounts" }) => Promise<unknown>;
};

/** The first account the live wallet reports, or undefined. */
async function liveAccount(client: AccountSource | undefined): Promise<string | undefined> {
  if (!client) return undefined;
  try {
    const accounts = (await client.request({ method: "eth_accounts" })) as string[] | undefined;
    return accounts?.[0];
  } catch {
    return client.account?.address;
  }
}

function isSwitchingNetworksError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error ?? "");
  return message.includes("is switching networks");
}

/**
 * Signs a USDC transfer authorization on the payment chain (spec 3.3). The
 * wallet stays on Libertas for everything else, so this switches to Base just
 * for the signature and back after, even when the fan cancels.
 *
 * Must have 2: before any wallet prompt, and again after the chain switch,
 * the live signer must be the authorization's `from`. After an account
 * switch in one browser the wallet can still be the previous account's; a
 * signature from it would be for the wrong authorizer, so nothing is asked.
 */
export function useUsdcSigner() {
  const chainId = useChainId();
  const { switchChainAsync } = useSwitchChain();
  const { signTypedDataAsync } = useSignTypedData();
  const { data: walletClient } = useConnectorClient();
  const { address: accountAddress } = useAccount();

  return useCallback(
    async (typed: UsdcTypedData): Promise<Hex> => {
      const expected = typed.message.from;
      if (!walletClient) throw new WalletDisconnectedError();
      const before = walletClient.account?.address ?? accountAddress;
      if (!sameAddress(before, expected)) {
        console.warn("[usdc-sign] signer does not match the send", { expected, live: before });
        throw new WalletMismatchError(expected, before);
      }
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
          throw new ChainSwitchError(switchError);
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
        // The account can change while the wallet switches chains
        const after = (await liveAccount(walletClient as unknown as AccountSource)) ?? before;
        if (!sameAddress(after, expected)) {
          console.warn("[usdc-sign] signer changed during chain switch", { expected, live: after });
          throw new WalletMismatchError(expected, after, true);
        }
        for (let attempt = 0; ; attempt++) {
          try {
            console.info(
              `[usdc-sign] signTypedData attempt ${attempt + 1}, domain.chainId=${typed.domain.chainId}`
            );
            const signature = await signTypedDataAsync({
              // Name the authorizer so a wallet holding another key refuses
              account: expected,
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
    [chainId, switchChainAsync, signTypedDataAsync, walletClient, accountAddress]
  );
}
