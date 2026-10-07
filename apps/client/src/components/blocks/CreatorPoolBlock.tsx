import { Coins } from "lucide-react";
import Decimal from "decimal.js";
import { formatEther } from "viem";
import { useQuery } from "@tanstack/react-query";
import type { ThemeConfig } from "../../types/editor";
import { PoolBlock } from "@repo/constants";
import { trpc, TESTNET_NOTICE } from "@repo/ui";
import { getChainConfig } from "@repo/web3";
import { cn } from "../../utils/cn";
import { getButtonBaseStyle, getButtonEffectStyle } from "../../utils/styles";

interface CreatorPoolBlockProps {
  block: PoolBlock;
  theme: ThemeConfig;
}

// creatorFee is in basis points; 10000 means the creator keeps every reward
const FULL_CREATOR_SHARE = 10000;
const RATE_HELPER =
  "Estimated from current network stake and rewards. It changes as stake changes and is not guaranteed.";

/** The server sends bigints as wei strings (BigInt toJSON). */
function toWei(value: unknown): bigint {
  try {
    return BigInt(value as string | bigint);
  } catch {
    return 0n;
  }
}

/** Up to 4 decimals, trailing zeros removed, rounded down, digits grouped. */
function formatAmount(wei: bigint) {
  const floored = new Decimal(formatEther(wei)).toDecimalPlaces(4, Decimal.ROUND_DOWN);
  const [whole, fraction] = floored.toFixed().split(".");
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return fraction ? `${grouped}.${fraction}` : grouped;
}

/** Creator font size clamped to 16 to 20 (040 I06, I10). */
function clampedFontSize(theme: ThemeConfig) {
  const raw = parseFloat(String(theme.fontSize ?? "16"));
  const size = Number.isFinite(raw) ? Math.min(20, Math.max(16, raw)) : 16;
  return `${size}px`;
}

/**
 * The live preview's pool block (Screen Review 040, QA-043). A port of the
 * public renderer in apps/landingpage/src/components/blocks/CreatorPoolBlock.tsx
 * so the editor shows what visitors see: the creator's colors, Total staked,
 * Fans and Creator share in two columns, View pool, the testnet line. The
 * button is inert in the preview.
 */
export function CreatorPoolBlock({ block, theme }: CreatorPoolBlockProps) {
  const address = block.config.address;
  const valid = !!address && /^0x[a-fA-F0-9]{40}$/.test(address);
  const { data: pool, isLoading } = useQuery(
    trpc.pools.fan.getPoolByAddress.queryOptions(
      { poolAddress: address },
      { enabled: valid, retry: 1, staleTime: 60_000 }
    )
  );
  const { data: details } = useQuery(
    trpc.pools.fan.getPoolDetailsForModal.queryOptions(
      { poolAddress: address },
      { enabled: valid, retry: false, staleTime: 60_000 }
    )
  );

  if (!valid) return null;
  if (isLoading) {
    return (
      <div
        aria-hidden
        className="h-[233px] w-full rounded-prism-13 bg-[rgba(22,21,43,0.10)] motion-safe:animate-pulse"
      />
    );
  }
  if (!pool) return null;

  const text = { fontFamily: theme.fontFamily, color: theme.fontColor };
  const alpha = Math.round((theme.transparency ?? 100) * 2.55)
    .toString(16)
    .padStart(2, "0");
  const symbol = getChainConfig(Number(pool.chainId))?.nativeCurrency.symbol ?? "tREVO";
  const share = typeof pool.creatorFee === "number" ? pool.creatorFee : null;
  const keepsAll = share !== null && share >= FULL_CREATOR_SHARE;
  const handle = details?.creator?.handle;
  const apy = (pool as { apy?: unknown }).apy;

  return (
    <section
      aria-label={`Creator pool: ${pool.name}`}
      className="w-full space-y-[21px] rounded-prism-13 p-[21px]"
      style={{ backgroundColor: `${theme.buttonColor ?? "#ffffff"}${alpha}`, ...text }}
    >
      <div className="flex items-center gap-[13px]">
        <span className="flex h-commit w-commit shrink-0 items-center justify-center overflow-hidden rounded-prism-13">
          {pool.image?.url ? (
            <img src={pool.image.url} alt="" className="h-full w-full object-cover" />
          ) : (
            <Coins aria-hidden className="h-[21px] w-[21px]" />
          )}
        </span>
        <div className="min-w-0">
          <h3 className="break-words text-[20px] font-bold leading-[23px]">{pool.name}</h3>
          {handle && <p className="text-[13px] leading-[16px]">@{handle}</p>}
        </div>
      </div>
      {pool.description && (
        <p className="line-clamp-3 text-[16px] leading-[26px]">{pool.description}</p>
      )}
      <dl className="grid grid-cols-2 gap-[13px]">
        <div className="min-w-0">
          <dt className="text-[13px] leading-[16px]">Total staked</dt>
          <dd className="break-words text-[16px] font-semibold leading-[20px] tabular-nums">
            {formatAmount(toWei(pool.stakedAmount))} {symbol}
          </dd>
        </div>
        <div className="min-w-0">
          <dt className="text-[13px] leading-[16px]">Fans</dt>
          <dd className="text-[16px] font-semibold leading-[20px] tabular-nums">
            {pool.fans.toLocaleString("en-US")}
          </dd>
        </div>
        <div className="col-span-2 min-w-0">
          <dt className="text-[13px] leading-[16px]">Creator share</dt>
          <dd className="text-[16px] font-semibold leading-[20px] tabular-nums">
            {share === null
              ? "Not set"
              : `${(share / 100).toLocaleString("en-US", { maximumFractionDigits: 2 })}% of pool rewards`}
          </dd>
        </div>
      </dl>
      {keepsAll ? (
        <p className="text-[16px] leading-[26px]">
          The creator keeps 100% of pool rewards. Fans in this pool receive no rewards.
        </p>
      ) : (
        typeof apy === "number" && (
          <div>
            <p className="flex flex-wrap items-baseline justify-between gap-x-3 text-[16px] leading-[20px]">
              <span>Network Reward Rate</span>
              <span className="font-semibold tabular-nums">
                {(apy / 100).toLocaleString("en-US", { maximumFractionDigits: 1 })}% a year (est.)
              </span>
            </p>
            <p className="mt-1 text-[13px] leading-[16px]">{RATE_HELPER}</p>
          </div>
        )
      )}
      <span
        role="presentation"
        className={cn(
          "flex min-h-commit w-full items-center gap-[13px] px-[21px] py-2",
          getButtonBaseStyle(theme.buttonStyle),
          getButtonEffectStyle(theme.buttonEffect)
        )}
        style={{ backgroundColor: theme.buttonColor, ...text }}
      >
        <span aria-hidden className="flex h-[21px] w-[21px] shrink-0 items-center justify-center">
          <Coins className="h-[21px] w-[21px]" />
        </span>
        <span
          className="line-clamp-2 flex-1 break-words text-center font-semibold"
          style={{ fontSize: clampedFontSize(theme), lineHeight: "20px" }}
        >
          View pool
        </span>
        <span aria-hidden className="w-[21px] shrink-0" />
      </span>
      <p className="text-[13px] leading-[16px]">{TESTNET_NOTICE}</p>
    </section>
  );
}
