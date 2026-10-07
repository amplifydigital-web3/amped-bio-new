/**
 * Bounded waits on the wallet (QA-055, QA-057). A wallet request that never
 * answers (popup lost, embed not ready, an RPC that holds the broadcast) used
 * to leave a flow on "Confirm in wallet" for good. Every signing call waits
 * at most WALLET_SIGN_TIMEOUT_MS and then fails with TxTimeoutError, which the
 * flows show as their own cause.
 */

/** How long the wallet gets to answer a signing request. */
export const WALLET_SIGN_TIMEOUT_MS = 120_000;

export class TxTimeoutError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TxTimeoutError";
  }
}

export function withTimeout<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new TxTimeoutError(message)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

/** The wallet signing wait, with the shared limit and message. */
export function withWalletTimeout<T>(promise: Promise<T>): Promise<T> {
  return withTimeout(promise, WALLET_SIGN_TIMEOUT_MS, "Wallet did not respond");
}

export function isWalletTimeout(error: unknown): boolean {
  return error instanceof TxTimeoutError;
}
