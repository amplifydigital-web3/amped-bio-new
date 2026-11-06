/**
 * USDC in the wallet flags (Build Board #29, #5). A surface whose flag is off
 * renders nothing (D07). VITE_USDC_WALLET turns on the Base network beside
 * Libertas in the Wallet; VITE_USDC_ONRAMP adds Buy USDC on top of it.
 */
import { isFeatureOn } from "../featureFlags";
export const USDC_FLAGS = {
  /** USDC tile, Tokens row, Receive network chips, Deposit USDC (rows 137) */
  wallet: isFeatureOn("usdc"),
  /** Buy USDC through Coinbase in Wallet, Fund (row 138). Needs the wallet flag. */
  onramp: isFeatureOn("usdc") && isFeatureOn("onramp"),
} as const;
