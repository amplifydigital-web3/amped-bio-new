import { useQuery } from "@tanstack/react-query";
import { Button, Skeleton, trpc, type RouterOutputs } from "@repo/ui";
import { PoolArt } from "../../explore/pool-panel/PoolArt";
import { formatTokenAmount, toWei } from "../../explore/pool-panel/format";

// Screen Review 059 I03 to I07. One G0 row per stake: 34 art, the pool name
// (two lines at most) with the creator @handle, Staked and Pending figures,
// and Manage. The row and Manage both open the pool details panel (D25).

type Stake = RouterOutputs["pools"]["fan"]["getUserStakedPools"][number];

function amountText(value: bigint | null, symbol: string) {
  return value === null ? "Unavailable" : `${formatTokenAmount(value)} ${symbol}`;
}

function Figure({ label, value }: { label: string; value: string }) {
  return (
    <span className="flex flex-col items-end">
      <span className="text-prism-meta text-prism-ink-2">{label}</span>
      <span className="whitespace-nowrap text-prism-label font-semibold tabular-nums text-prism-ink">
        {value}
      </span>
    </span>
  );
}

export function StakeRow({
  stake,
  symbol,
  viewer,
  onManage,
}: {
  stake: Stake;
  symbol: string;
  viewer: string | undefined;
  onManage: (poolId: number) => void;
}) {
  const { pool } = stake;
  const name = pool.name || `Pool ${pool.id}`;
  // Same query and key as the pool panel, so opening Manage reads from cache
  const details = useQuery({
    ...trpc.pools.fan.getPoolDetailsForModal.queryOptions({
      poolId: pool.id,
      poolAddress: undefined,
      walletAddress: viewer || undefined,
    }),
    staleTime: 60_000,
    retry: false,
  });
  const handle = details.data?.creator?.handle;
  const staked = amountText(toWei(pool.stakedByYou), symbol);
  const pending = amountText(toWei(pool.pendingRewards), symbol);
  const open = () => onManage(pool.id);

  return (
    <li className="flex min-h-commit items-center gap-3 border-b border-prism-line py-2 last:border-b-0">
      <button
        type="button"
        onClick={open}
        aria-label={`${name}, staked ${staked}`}
        className="prism-focus flex min-w-0 flex-1 items-center gap-3 rounded-prism-13 text-left transition-colors hover:bg-white/50 motion-reduce:transition-none"
      >
        <span
          aria-hidden
          className="prism-glass-clear h-[34px] w-[34px] shrink-0 overflow-hidden !rounded-[8px]"
        >
          <PoolArt url={pool.image?.url} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="line-clamp-2 break-words text-prism-label font-semibold text-prism-ink">
            {name}
          </span>
          {handle ? (
            <span className="block truncate text-prism-meta text-prism-ink-2">@{handle}</span>
          ) : details.isPending ? (
            <Skeleton className="mt-1 h-3 w-[89px] rounded-full" />
          ) : null}
          {/* Mobile: the figures sit under the name on one line (I06) */}
          <span className="mt-0.5 block text-prism-meta tabular-nums text-prism-ink-2 sm:hidden">
            <span className="whitespace-nowrap">Staked {staked}</span>
            <span aria-hidden> · </span>
            <span className="whitespace-nowrap">Pending {pending}</span>
          </span>
        </span>
        <span className="hidden shrink-0 items-start gap-[21px] sm:flex">
          <Figure label="Staked" value={staked} />
          <Figure label="Pending" value={pending} />
        </span>
      </button>
      <Button
        type="button"
        variant="secondary"
        className="min-w-[89px] shrink-0"
        aria-label={`Manage stake in ${name}`}
        onClick={open}
      >
        Manage
      </Button>
    </li>
  );
}
