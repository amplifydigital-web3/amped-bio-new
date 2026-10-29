import { formatEther, getAddress, type Address } from "viem";
import { env } from "../../env";
import { CdpClient } from "../usdc/cdp";
import { paymentClient } from "../usdc/chain";

/**
 * AmpedPay's Coinbase Server Wallet accounts (spec 3.2, 3.4, 6.1; Build Board #53, B3).
 * Coinbase holds every key, and each account's CDP policy limits what it can do:
 *   pauser        only pause() on AmpedPay
 *   safe proposer a Safe delegate; signs Safe transactions it proposes, nothing else
 *   split signer  signs split tables (used by PAY-2)
 * The relayer is managed in services/usdc/relayer.ts.
 */

export type PaymentsAccountRole = "pauser" | "proposer" | "splitSigner";

function accountName(role: PaymentsAccountRole): string {
  switch (role) {
    case "pauser":
      return env.CDP_PAUSER_ACCOUNT;
    case "proposer":
      return env.CDP_SAFE_PROPOSER_ACCOUNT;
    case "splitSigner":
      return env.CDP_SPLIT_SIGNER_ACCOUNT;
  }
}

function cdpConfigured(): boolean {
  return Boolean(env.CDP_API_KEY_ID && env.CDP_API_KEY_SECRET && env.CDP_WALLET_SECRET);
}

export function isAccountConfigured(role: PaymentsAccountRole): boolean {
  return cdpConfigured() && Boolean(accountName(role));
}

let client: CdpClient | null = null;

export function paymentsCdp(): CdpClient {
  if (!client) {
    client = new CdpClient({
      apiKeyId: env.CDP_API_KEY_ID,
      apiKeySecret: env.CDP_API_KEY_SECRET,
      walletSecret: env.CDP_WALLET_SECRET,
    });
  }
  return client;
}

/** Test seam. */
export function setPaymentsCdpForTests(next: CdpClient | null) {
  client = next;
  addresses.clear();
}

const addresses = new Map<PaymentsAccountRole, Address>();

/** The account's address, looked up by name once per process. */
export async function accountAddress(role: PaymentsAccountRole): Promise<Address> {
  const known = addresses.get(role);
  if (known) return known;
  const account = await paymentsCdp().getEvmAccountByName(accountName(role));
  const address = getAddress(account.address);
  addresses.set(role, address);
  return address;
}

export type AccountState =
  | { configured: false }
  | { configured: true; reachable: false }
  | { configured: true; reachable: true; address: Address; balanceEth: string };

/** Address and ETH balance for Overview. The proposer and signer hold no ETH by design. */
export async function accountState(role: PaymentsAccountRole): Promise<AccountState> {
  if (!isAccountConfigured(role)) return { configured: false };
  try {
    const address = await accountAddress(role);
    const wei = await paymentClient().getBalance({ address });
    return { configured: true, reachable: true, address, balanceEth: formatEther(wei) };
  } catch (error) {
    console.error(`[payments] CDP account ${role} did not load`, error);
    return { configured: true, reachable: false };
  }
}
