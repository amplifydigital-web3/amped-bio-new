import Decimal from "decimal.js";
import { formatEther } from "viem";
import { toast } from "@/components/ui/toast";
import { formatTokenAmount } from "../../explore/pool-panel/format";

// Screen Review 067 to 069: formatting and link helpers for the My Pool dashboard.

/** Up to 4 decimals, trailing zeros removed; a nonzero amount under 0.0001 reads < 0.0001. */
export function formatPoolAmount(wei: bigint | string | null | undefined): string {
  const value = typeof wei === "string" ? BigInt(wei || "0") : (wei ?? 0n);
  if (value > 0n && new Decimal(formatEther(value)).lt("0.0001")) return "< 0.0001";
  return formatTokenAmount(value);
}

export function shortAddress(address: string) {
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

export function poolPageUrl(address: string) {
  return `${import.meta.env.VITE_LANDINGPAGE_URL ?? "https://amped.bio"}/i/pools/${address}`;
}

export function fanPageUrl(handle: string) {
  return `${import.meta.env.VITE_LANDINGPAGE_URL ?? "https://amped.bio"}/@${handle}`;
}

export function copyText(text: string, title: string) {
  return navigator.clipboard
    .writeText(text)
    .then(() => toast.add({ title, type: "success" }))
    .catch(() => undefined);
}

/** 069 I03: Just now, 12 min ago, 3 h ago, 2 d ago, then a date like Sep 12. */
export function relativeTime(value: string | Date) {
  const date = new Date(value);
  const seconds = Math.max(0, Math.floor((Date.now() - date.getTime()) / 1000));
  if (seconds < 60) return "Just now";
  if (seconds < 3600) return `${Math.floor(seconds / 60)} min ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)} h ago`;
  if (seconds < 7 * 86400) return `${Math.floor(seconds / 86400)} d ago`;
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}
