import { libertasTestnet } from "@repo/web3";

/**
 * The network the app runs on (VITE_DEFAULT_NETWORK_ID_HEX), as a decimal
 * string. Use it for data that must not depend on the chain the connected
 * wallet happens to sit on (Screen Review 038 I06).
 */
export function appChainId(): string {
  const raw = import.meta.env.VITE_DEFAULT_NETWORK_ID_HEX;
  const parsed = raw ? parseInt(raw, 16) : NaN;
  return String(Number.isFinite(parsed) && parsed > 0 ? parsed : libertasTestnet.id);
}
