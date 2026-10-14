import { getCurrencySymbol } from "@repo/web3";
import { Button, Skeleton } from "@repo/ui";
import { appChainId } from "@/utils/appChain";
import { useDelayed } from "@/hooks/useDelayed";
import { formatTokenAmount } from "../../explore/pool-panel/format";
import { useWalletStats } from "../hooks/useWalletStats";

const LABEL = "text-prism-meta text-prism-ink-2";
const VALUE = "text-prism-label font-semibold tabular-nums text-prism-ink";

/**
 * Screen Review 049 I07 to I09, I12, I14, I15. Two quiet figures under the
 * balance, 34 apart: Staked (fan stakes plus the creator's own pool stake) and
 * Pools joined (other creators' pools). Definitions are visually hidden text
 * linked by aria-describedby; no tooltips. A failed query shows Could not load
 * with one Retry, never 0.
 */
export function SummaryFigures() {
  const { stats, loading, failed, refetch } = useWalletStats();
  const showSkeleton = useDelayed(loading, 400);
  const symbol = getCurrencySymbol(Number(appChainId()));

  const value = (render: () => React.ReactNode) => {
    if (failed) return <span className={LABEL}>Could not load</span>;
    if (loading || !stats) {
      return showSkeleton ? (
        <Skeleton className="mt-0.5 h-4 w-[89px] rounded-full" />
      ) : (
        <span className="block h-5" aria-hidden />
      );
    }
    return render();
  };

  return (
    <div className="flex flex-wrap items-end gap-x-[34px] gap-y-3" aria-busy={loading || undefined}>
      <dl className="contents">
        <div className="min-w-0">
          <dt className={LABEL}>Staked</dt>
          <dd className={VALUE} aria-describedby="wallet-staked-definition">
            {value(() => `${formatTokenAmount(stats!.staked)} ${symbol}`)}
          </dd>
          {stats && stats.ownPoolStake > 0n && (
            <dd className={LABEL}>
              Includes {formatTokenAmount(stats.ownPoolStake)} {symbol} in your pool
            </dd>
          )}
        </div>
        <div className="min-w-0">
          <dt className={LABEL}>Pools joined</dt>
          <dd className={VALUE} aria-describedby="wallet-pools-joined-definition">
            {value(() => stats!.poolsJoined.toLocaleString("en-US"))}
          </dd>
        </div>
      </dl>
      <span id="wallet-staked-definition" className="sr-only">
        Total {symbol} you have staked across all pools, including your own pool.
      </span>
      <span id="wallet-pools-joined-definition" className="sr-only">
        Creator pools you back, not counting your own.
      </span>
      {failed && (
        <Button type="button" variant="ghost" onClick={() => void refetch()}>
          Retry
        </Button>
      )}
    </div>
  );
}
