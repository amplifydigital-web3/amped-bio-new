import { libertasTestnet } from "@repo/web3";
import type { RouterOutputs } from "@repo/ui";

// Screen Review 089. Shared pieces of the ndau conversion queue.

export type Conversion = RouterOutputs["ndauConversion"]["getAllConversions"][number];

// 089 I03 and D1: every amount carries the native symbol of the chain the
// transfer is sent on (tREVO on Libertas Testnet), never the admin wallet's
// current network and never a hardcoded REVO.
export const SEND_CHAIN = libertasTestnet;
export const SEND_SYMBOL = libertasTestnet.nativeCurrency.symbol;
export const SEND_NETWORK = libertasTestnet.name;
export const explorerTx = (hash: string) =>
  `${libertasTestnet.blockExplorers?.default?.url ?? "https://libertas.revoscan.io"}/tx/${hash}`;

// A hash for a transfer that was sent but not yet recorded on the server is kept in
// localStorage until the server confirms it. It is the only local copy of a real
// payment, so it survives reloads and closed panels (#232, 089 I02).
const UNRECORDED_TX_KEY = (conversionId: number) =>
  `ampedbio.admin.ndauConversion.unrecordedTx.${conversionId}`;

export function readUnrecordedTx(conversionId: number): string | null {
  try {
    return window.localStorage.getItem(UNRECORDED_TX_KEY(conversionId));
  } catch {
    return null;
  }
}

export function writeUnrecordedTx(conversionId: number, hash: string): void {
  try {
    window.localStorage.setItem(UNRECORDED_TX_KEY(conversionId), hash);
  } catch {
    // Storage can be unavailable (private mode). The hash is still shown on screen.
  }
}

export function clearUnrecordedTx(conversionId: number): void {
  try {
    window.localStorage.removeItem(UNRECORDED_TX_KEY(conversionId));
  } catch {
    // ignore
  }
}
