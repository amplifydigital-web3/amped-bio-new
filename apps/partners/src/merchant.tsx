import { createContext, useContext } from "react";
import type { RouterOutputs } from "@repo/ui";

export type MyMerchant = RouterOutputs["merchant"]["mine"][number];

export const MerchantContext = createContext<MyMerchant | null>(null);

/** The merchant this console session works on (the first membership for now). */
export function useMerchant(): MyMerchant {
  const merchant = useContext(MerchantContext);
  if (!merchant) throw new Error("useMerchant outside ConsoleGate");
  return merchant;
}

export function usdc(units: string | number | bigint): string {
  const n = Number(units) / 1_000_000;
  return `$${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USDC`;
}

export function shortAddress(address: string | null | undefined): string {
  return address ? `${address.slice(0, 6)}...${address.slice(-4)}` : "None yet";
}

export function day(iso: string | null | undefined): string {
  return iso
    ? new Date(iso).toLocaleString(undefined, {
        day: "numeric",
        month: "short",
        year: "numeric",
        hour: "numeric",
        minute: "2-digit",
      })
    : "";
}
