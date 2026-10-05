import { decodeFunctionData, type Abi, type Hex } from "viem";
import { CREATOR_POOL_ABI, CREATOR_POOL_FACTORY_ABI, L2_BASE_TOKEN_ABI } from "@repo/web3";
import type { Transaction, Transfer } from "../ProfileTabs/types";

// Screen Review 057, 058. One activity row per transaction hash, in plain
// words. Raw method signatures never show in a collapsed row (057 I03).

export type ActivityKind =
  | "received"
  | "sent"
  | "staked"
  | "unstaked"
  | "claimed"
  | "createdPool"
  | "contractCall";

export type ActivityStatus = "included" | "pending" | "failed";

export interface ActivityItem {
  hash: string;
  time: string;
  status: ActivityStatus;
  kind: ActivityKind;
  /** The other party: a person or a pool */
  counterparty: string | null;
  /** Pool the action touched, when the kind names one */
  poolAddress: string | null;
  /** Name from the transaction itself (createPool carries it) */
  poolNameHint: string | null;
  /** Signed direction of the amount; null when nothing moved or it failed */
  direction: "in" | "out" | null;
  amount: bigint | null;
  decimals: number;
  symbol: string | null;
  /** Network fee in wei, transactions only */
  fee: bigint | null;
  from: string;
  to: string;
  /** Four byte selector, for Contract call rows */
  selector: string | null;
  token: { name: string; symbol: string; iconURL: string | null; native: boolean } | null;
  /** Mint, Internal and other non plain transfer types (058 I04) */
  transferType: string | null;
}

export const STAKING_KINDS: ActivityKind[] = ["staked", "unstaked", "claimed", "createdPool"];

const ABIS: Abi[] = [
  L2_BASE_TOKEN_ABI as unknown as Abi,
  CREATOR_POOL_ABI as unknown as Abi,
  CREATOR_POOL_FACTORY_ABI as unknown as Abi,
];

function decode(data: string) {
  if (!data || data === "0x" || data.length < 10) return null;
  for (const abi of ABIS) {
    try {
      return decodeFunctionData({ abi, data: data as Hex });
    } catch {
      // Not this contract
    }
  }
  return null;
}

function toBigInt(value: string | null | undefined): bigint {
  if (!value) return 0n;
  try {
    return BigInt(value);
  } catch {
    return 0n;
  }
}

function same(a?: string | null, b?: string | null) {
  return !!a && !!b && a.toLowerCase() === b.toLowerCase();
}

/** A transaction from the explorer, in plain words (057 I03, I05, I09). */
export function fromTransaction(tx: Transaction, me: string, nativeSymbol: string): ActivityItem {
  const decoded = decode(tx.data);
  const value = toBigInt(tx.value);
  const outgoing = same(tx.from, me);
  const base: ActivityItem = {
    hash: tx.hash,
    time: tx.receivedAt,
    status: tx.status,
    kind: outgoing ? "sent" : "received",
    counterparty: outgoing ? tx.to : tx.from,
    poolAddress: null,
    poolNameHint: null,
    direction: value > 0n ? (outgoing ? "out" : "in") : null,
    amount: value > 0n ? value : null,
    decimals: 18,
    symbol: nativeSymbol,
    fee: tx.fee ? toBigInt(tx.fee) : null,
    from: tx.from,
    to: tx.to,
    selector: null,
    token: null,
    transferType: null,
  };

  const hasData = !!tx.data && tx.data !== "0x";
  if (hasData && !decoded) {
    base.kind = "contractCall";
    base.selector = tx.data.slice(0, 10);
    base.counterparty = tx.to;
  } else if (decoded) {
    const args = (decoded.args ?? []) as readonly unknown[];
    switch (decoded.functionName) {
      case "stake":
        base.kind = "staked";
        base.poolAddress = String(args[0]);
        base.amount = typeof args[1] === "bigint" ? args[1] : base.amount;
        base.direction = "out";
        break;
      case "unstake":
        base.kind = "unstaked";
        base.poolAddress = String(args[0]);
        base.amount = typeof args[1] === "bigint" ? args[1] : null;
        base.direction = base.amount ? "in" : null;
        break;
      case "claimReward":
        base.kind = "claimed";
        base.poolAddress = tx.to;
        base.amount = null;
        base.direction = null;
        break;
      case "createPool":
        base.kind = "createdPool";
        base.poolNameHint = typeof args[2] === "string" ? args[2] : null;
        // The factory is the recipient; the row names the creator's pool
        base.counterparty = null;
        base.direction = value > 0n ? "out" : null;
        break;
      default:
        base.kind = "contractCall";
        base.selector = tx.data.slice(0, 10);
        base.counterparty = tx.to;
    }
  }

  if (tx.status === "failed") base.direction = null;
  return base;
}

/** A token transfer from the explorer (058 I02, I03). */
export function fromTransfer(transfer: Transfer, me: string, nativeSymbol: string): ActivityItem {
  const outgoing = same(transfer.from, me);
  const native =
    transfer.token?.symbol?.toUpperCase() === nativeSymbol.toUpperCase() ||
    /^0x0+800a$/i.test(transfer.tokenAddress ?? "");
  const amount = toBigInt(transfer.amount);
  const type = transfer.isInternal ? "Internal" : transfer.type;
  return {
    hash: transfer.transactionHash,
    time: transfer.timestamp,
    status: "included",
    kind: outgoing ? "sent" : "received",
    counterparty: outgoing ? transfer.to : transfer.from,
    poolAddress: null,
    poolNameHint: null,
    direction: amount > 0n ? (outgoing ? "out" : "in") : null,
    amount: amount > 0n ? amount : null,
    decimals: transfer.token?.decimals ?? 18,
    symbol: transfer.token?.symbol ?? nativeSymbol,
    fee: null,
    from: transfer.from,
    to: transfer.to,
    selector: null,
    token: transfer.token
      ? {
          name: transfer.token.name,
          symbol: transfer.token.symbol,
          iconURL: native ? null : transfer.token.iconURL || null,
          native,
        }
      : null,
    transferType:
      type && type.toLowerCase() !== "transfer"
        ? type.charAt(0).toUpperCase() + type.slice(1)
        : null,
  };
}

/**
 * 057 I14: one row per hash. A transaction wins over its transfers, so a
 * contract call reads as what it did, not as a send to the contract.
 */
export function mergeByHash(transactions: ActivityItem[], transfers: ActivityItem[]) {
  const byHash = new Map<string, ActivityItem>();
  for (const item of transactions) byHash.set(item.hash.toLowerCase(), item);
  for (const item of transfers) {
    const key = item.hash.toLowerCase();
    if (!byHash.has(key)) byHash.set(key, item);
  }
  return [...byHash.values()].sort((a, b) => Date.parse(b.time) - Date.parse(a.time));
}

/** Up to `max` decimals, trailing zeros removed, thousands grouped (057 I06). */
export function formatAmount(value: bigint, decimals: number, max = 4) {
  const negative = value < 0n;
  const abs = negative ? -value : value;
  const base = 10n ** BigInt(decimals);
  const whole = abs / base;
  const scale = 10n ** BigInt(Math.max(decimals - max, 0));
  const fraction = ((abs % base) / scale).toString().padStart(Math.min(max, decimals), "0");
  const trimmed = fraction.replace(/0+$/, "");
  const wholeText = whole.toLocaleString("en-US");
  if (whole === 0n && !trimmed && abs > 0n)
    return `${negative ? "-" : ""}<0.${"0".repeat(max - 1)}1`;
  return `${negative ? "-" : ""}${wholeText}${trimmed ? `.${trimmed}` : ""}`;
}

export function shortAddress(address: string) {
  return address ? `${address.slice(0, 6)}…${address.slice(-4)}` : "";
}

const UNITS: [Intl.RelativeTimeFormatUnit, number][] = [
  ["year", 31_536_000],
  ["month", 2_592_000],
  ["week", 604_800],
  ["day", 86_400],
  ["hour", 3_600],
  ["minute", 60],
];

/** Relative time for the row meta (057 I08). */
export function relativeTime(iso: string, now = Date.now()) {
  const seconds = Math.round((Date.parse(iso) - now) / 1000);
  const rtf = new Intl.RelativeTimeFormat("en", { numeric: "auto" });
  for (const [unit, size] of UNITS) {
    if (Math.abs(seconds) >= size) return rtf.format(Math.round(seconds / size), unit);
  }
  return "Just now";
}

export function absoluteTime(iso: string) {
  return new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}
