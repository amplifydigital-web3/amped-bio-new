import { isAddress, isAddressEqual } from "viem";

/**
 * Wallet session hygiene for one browser that signs in to more than one
 * Amped.Bio account. Signing out of Amped.Bio and signing out of the wallet
 * are separate steps; when only the first runs, the next account inherits the
 * previous account's wallet and every signature comes from the wrong key.
 */

export const WALLET_TOKEN_EXPIRATION_KEY = "walletTokenExpiration";

/** localStorage and sessionStorage key prefixes the wallet SDKs own. */
const WALLET_STORAGE_PREFIXES = ["wagmi.", "Web3Auth", "w3a:", "auth_store", "openlogin"] as const;

function clearStorage(storage: Storage | undefined) {
  if (!storage) return;
  const keys: string[] = [];
  for (let index = 0; index < storage.length; index++) {
    const key = storage.key(index);
    if (key && WALLET_STORAGE_PREFIXES.some(prefix => key.startsWith(prefix))) keys.push(key);
  }
  keys.forEach(key => storage.removeItem(key));
}

/**
 * Removes the wallet SDK state this browser keeps between visits. Called on
 * sign out after the SDK's own disconnect, so a cached session can never be
 * restored for the next account. Storage can throw in private windows.
 */
export function clearWalletBrowserState() {
  try {
    localStorage.removeItem(WALLET_TOKEN_EXPIRATION_KEY);
    clearStorage(localStorage);
  } catch (error) {
    console.warn("[wallet-session] could not clear localStorage", error);
  }
  try {
    clearStorage(sessionStorage);
  } catch (error) {
    console.warn("[wallet-session] could not clear sessionStorage", error);
  }
}

/** True when both are valid addresses for the same account, ignoring case. */
export function sameAddress(a?: string | null, b?: string | null): boolean {
  if (!a || !b) return false;
  if (!isAddress(a, { strict: false }) || !isAddress(b, { strict: false })) return false;
  return isAddressEqual(a, b);
}

/**
 * True when the account has a linked wallet and the live wallet in this
 * browser is a different one. Unknown on either side is not a mismatch; the
 * reconnect path covers a missing live wallet.
 */
export function isWalletMismatch(
  accountWallet?: string | null,
  liveAddress?: string | null
): boolean {
  if (!accountWallet || !liveAddress) return false;
  return !sameAddress(accountWallet, liveAddress);
}

/** Thrown before a signature is requested when the signer is not the send's authorizer. */
export class WalletMismatchError extends Error {
  constructor(
    readonly expected: string,
    readonly actual: string | undefined,
    readonly changed = false
  ) {
    super(
      changed
        ? "The wallet account changed before signing."
        : "The connected wallet does not match this account."
    );
    this.name = "WalletMismatchError";
  }
}

/** Thrown when the wallet could not move to the payment chain. */
export class ChainSwitchError extends Error {
  constructor(readonly cause: unknown) {
    super("The wallet could not switch to the payment chain.");
    this.name = "ChainSwitchError";
  }
}

/** Thrown when there is no live wallet client at sign time. */
export class WalletDisconnectedError extends Error {
  constructor() {
    super("No connected wallet.");
    this.name = "WalletDisconnectedError";
  }
}
