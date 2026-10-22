/**
 * USDC in the wallet flags (Build Board #29, #5). A surface whose flag is off
 * renders nothing (D07). VITE_USDC_WALLET turns on the Base network beside
 * Libertas in the Wallet; VITE_USDC_ONRAMP adds Buy USDC on top of it.
 */
const on = (value: string | undefined) => value === "true";

export const USDC_FLAGS = {
  /** USDC tile, Tokens row, Receive network chips, Deposit USDC (rows 137) */
  wallet: on(import.meta.env.VITE_USDC_WALLET),
  /** Buy USDC through Coinbase in Wallet, Fund (row 138). Needs the wallet flag. */
  onramp: on(import.meta.env.VITE_USDC_WALLET) && on(import.meta.env.VITE_USDC_ONRAMP),
} as const;
