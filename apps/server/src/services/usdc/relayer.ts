import {
  encodeFunctionData,
  formatEther,
  parseEther,
  serializeTransaction,
  type Address,
  type Hex,
} from "viem";
import { USDC_EIP3009_ABI } from "@repo/web3";
import { env } from "../../env";
import { gasLines } from "../payments/settings";
import { CdpClient, CdpError } from "./cdp";
import { cdpNetwork, paymentClient, usdcAddress } from "./chain";
import { splitAuthorizationSignature, type TransferAuthorization } from "./authorization";

/**
 * The relayer (spec 3.4, decision 2): a CDP Server Wallet account on Base.
 * Coinbase holds the key; the CDP Policy Engine limits the account to the
 * USDC contract, the two authorization functions and ETH value 0. The account
 * submits the fan's signed authorization and pays Base gas, so the fan never
 * holds ETH. Gas is funded from the treasury and tracked in Admin, Money.
 */

export type RelayerFailure =
  | "not_configured"
  | "out_of_gas"
  | "policy_rejected"
  | "unavailable"
  | "reverted";

export class RelayerError extends Error {
  constructor(
    readonly code: RelayerFailure,
    message: string
  ) {
    super(message);
    this.name = "RelayerError";
  }
}

export interface Relayer {
  address(): Promise<Address>;
  /** ETH balance and whether it is below the alarm and stop lines. */
  gas(): Promise<{ wei: bigint; eth: string; alarm: boolean; stopped: boolean }>;
  submit(auth: TransferAuthorization, signature: Hex, idempotencyKey: string): Promise<Hex>;
}

export function isRelayerConfigured() {
  return Boolean(
    env.CDP_API_KEY_ID && env.CDP_API_KEY_SECRET && env.CDP_WALLET_SECRET && env.CDP_RELAYER_ACCOUNT
  );
}

/** The transferWithAuthorization calldata the relayer sends to the USDC contract. */
export function encodeAuthorizationCall(auth: TransferAuthorization, signature: Hex): Hex {
  const { v, r, s } = splitAuthorizationSignature(signature);
  return encodeFunctionData({
    abi: USDC_EIP3009_ABI,
    functionName: "transferWithAuthorization",
    args: [auth.from, auth.to, auth.value, auth.validAfter, auth.validBefore, auth.nonce, v, r, s],
  });
}

/**
 * Relayer gas against the alarm and stop lines. The lines are AmpedPay settings changed
 * through the admin two person flow (spec docs/features/ampedpay.md 3.3); the env values
 * are the fallback until a change is approved.
 */
export function gasState(
  wei: bigint,
  lines: { alarmEth: string; stopEth: string } = {
    alarmEth: env.RELAYER_GAS_ALARM_ETH,
    stopEth: env.RELAYER_GAS_STOP_ETH,
  }
) {
  return {
    wei,
    eth: formatEther(wei),
    alarm: wei < parseEther(lines.alarmEth),
    stopped: wei < parseEther(lines.stopEth),
  };
}

class CdpRelayer implements Relayer {
  private cachedAddress: Address | null = null;
  private readonly cdp = new CdpClient({
    apiKeyId: env.CDP_API_KEY_ID,
    apiKeySecret: env.CDP_API_KEY_SECRET,
    walletSecret: env.CDP_WALLET_SECRET,
  });

  async address(): Promise<Address> {
    if (this.cachedAddress) return this.cachedAddress;
    try {
      const account = await this.cdp.getEvmAccountByName(env.CDP_RELAYER_ACCOUNT);
      this.cachedAddress = account.address;
      return account.address;
    } catch (error) {
      console.error("[usdc relayer] could not load the CDP relayer account", error);
      throw new RelayerError("unavailable", "Relayer account not reachable");
    }
  }

  async gas() {
    const wei = await paymentClient().getBalance({ address: await this.address() });
    return gasState(wei, await gasLines());
  }

  async submit(auth: TransferAuthorization, signature: Hex, idempotencyKey: string): Promise<Hex> {
    const from = await this.address();
    const { stopped } = await this.gas();
    if (stopped) throw new RelayerError("out_of_gas", "Relayer ETH is below the stop line");

    const data = encodeAuthorizationCall(auth, signature);
    // Estimate here so a revert (used nonce, expired, blocklisted, short balance) never reaches CDP
    try {
      await paymentClient().estimateGas({ account: from, to: usdcAddress(), data, value: 0n });
    } catch (error) {
      console.warn("[usdc relayer] the authorization would revert", error);
      throw new RelayerError("reverted", "The USDC contract would refuse this transfer");
    }

    // CDP fills nonce, gas and fees; chainId is ignored in favor of network
    const transaction = serializeTransaction({
      chainId: 1,
      type: "eip1559",
      to: usdcAddress(),
      data,
      value: 0n,
    });
    try {
      const { transactionHash } = await this.cdp.sendEvmTransaction(
        from,
        { network: cdpNetwork(), transaction },
        idempotencyKey
      );
      return transactionHash;
    } catch (error) {
      if (error instanceof CdpError) {
        console.error("[usdc relayer] CDP refused the send", {
          status: error.status,
          type: error.errorType,
          correlationId: error.correlationId,
        });
        if (error.errorType === "policy_violation" || error.status === 403) {
          throw new RelayerError("policy_rejected", error.message);
        }
      }
      throw new RelayerError("unavailable", "CDP did not accept the transaction");
    }
  }
}

let relayer: Relayer | null = null;

export function getRelayer(): Relayer {
  if (relayer) return relayer;
  if (!isRelayerConfigured())
    throw new RelayerError("not_configured", "CDP relayer is not configured");
  relayer = new CdpRelayer();
  return relayer;
}

/** Test seam. */
export function setRelayerForTests(next: Relayer | null) {
  relayer = next;
}
