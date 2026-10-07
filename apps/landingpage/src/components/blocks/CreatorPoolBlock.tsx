import { Coins } from "lucide-react";
import Decimal from "decimal.js";
import { formatEther } from "viem";
import { useQuery } from "@tanstack/react-query";
import type { ThemeConfig } from "@repo/constants";
import { PoolBlock } from "@repo/constants";
import { TESTNET_NOTICE } from "@repo/ui";
import { getChainConfig } from "@repo/web3";
import { trpc } from "@/lib/trpc";
import { CreatorButton } from "./frame";

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

/**
 * Screen Review 040 I04, I08 (D1): a calm pool card in the creator's colors.
 * Surface is the creator's button color at the container transparency. The
 * only action is View pool (staking runs on the pool page, D12). The testnet
 * line shows verbatim under the stats. No reward promise and no APY or APR.
 * A missing or failed pool renders nothing to visitors (040 I01).
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
      {/* QA-043: two columns at any width. Three columns broke the values into
          two to four lines inside a 348 wide phone column. Creator share takes
          the second row in full. */}
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
        typeof pool.apy === "number" && (
          <div>
            <p className="flex flex-wrap items-baseline justify-between gap-x-3 text-[16px] leading-[20px]">
              <span>Network Reward Rate</span>
              <span className="font-semibold tabular-nums">
                {(pool.apy / 100).toLocaleString("en-US", { maximumFractionDigits: 1 })}% a year
                (est.)
              </span>
            </p>
            <p className="mt-1 text-[13px] leading-[16px]">{RATE_HELPER}</p>
          </div>
        )
      )}
      <CreatorButton
        theme={theme}
        icon={<Coins className="h-[21px] w-[21px]" />}
        label="View pool"
        href={`/i/pools/${pool.address}`}
        newTab={false}
      />
      <p className="text-[13px] leading-[16px]">{TESTNET_NOTICE}</p>
    </section>
  );
}
