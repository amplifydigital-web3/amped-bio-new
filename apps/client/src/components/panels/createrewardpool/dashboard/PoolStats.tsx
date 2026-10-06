import { ArrowDown, ArrowUp } from "lucide-react";
import { ErrorCard } from "@repo/ui";
import { formatPoolAmount } from "./format";

export interface DashboardStats {
  totalStakePercentageChange: number | null;
  stakeAtStartOfMonth: string;
  totalStake: string;
  newFansThisWeek: number;
  rewardsToFans: string | null;
  rewardsIndexing: boolean;
}

function Cell({
  label,
  value,
  unit,
  line,
  icon,
  srValue,
  className,
}: {
  label: string;
  value: React.ReactNode;
  unit?: string;
  line: React.ReactNode;
  icon?: React.ReactNode;
  srValue?: string;
  className?: string;
}) {
  return (
    <div className={className}>
      <dt className="text-prism-eyebrow uppercase text-prism-ink-2">{label}</dt>
      <dd className="mt-1 flex min-w-0 flex-wrap items-baseline gap-x-1.5">
        <span
          aria-hidden={srValue ? true : undefined}
          className="inline-flex items-center gap-1.5 whitespace-nowrap text-prism-card-title tabular-nums text-prism-ink"
        >
          {icon}
          {value}
        </span>
        {unit && <span className="text-prism-label font-semibold text-prism-ink">{unit}</span>}
        {srValue && <span className="sr-only">{srValue}</span>}
      </dd>
      <dd className="mt-1 text-prism-meta text-prism-ink-2">{line}</dd>
    </div>
  );
}

/** 067 I03: the arrow and the word match the sign; a pool new this month reads New. */
function stakeChange(stats: DashboardStats) {
  const pct = stats.totalStakePercentageChange;
  if (pct === null) {
    return BigInt(stats.totalStake || "0") > 0n
      ? { value: "New", direction: "up" as const, word: "Up this month", sr: "new this month" }
      : { value: "0%", direction: null, word: "No change this month", sr: "no change this month" };
  }
  const abs = Math.abs(pct).toFixed(2);
  if (pct > 0)
    return {
      value: `${abs}%`,
      direction: "up" as const,
      word: "Up this month",
      sr: `up ${abs} percent this month`,
    };
  if (pct < 0)
    return {
      value: `${abs}%`,
      direction: "down" as const,
      word: "Down this month",
      sr: `down ${abs} percent this month`,
    };
  return { value: "0%", direction: null, word: "No change this month", sr: "no change this month" };
}

/**
 * Screen Review 067 I03, I05, I06, I17 and Rob's 30 Sep call (Rewards to
 * fans): one G1 clear card of stat cells. Your stake comes first.
 */
export function PoolStats({
  creatorStake,
  creatorCutBps,
  symbol,
  stats,
  loading,
  error,
  onRetry,
}: {
  creatorStake: bigint | undefined;
  creatorCutBps: bigint | undefined;
  symbol: string;
  stats: DashboardStats | undefined;
  loading: boolean;
  error: boolean;
  onRetry: () => void;
}) {
  if (error) {
    return (
      <ErrorCard
        title="Pool stats did not load"
        cause="The pool contract did not respond. Try again in a moment."
        onRetry={onRetry}
        retryLabel="Retry"
        className="!rounded-prism-21"
      />
    );
  }

  const bar = (
    <span aria-label="Loading" className="inline-block h-6 w-20 rounded-full bg-prism-line" />
  );
  const change = stats ? stakeChange(stats) : null;
  const ArrowIcon = change?.direction === "down" ? ArrowDown : ArrowUp;

  return (
    <section
      aria-labelledby="pool-stats-title"
      className="prism-glass-clear space-y-3 !rounded-prism-21 p-[21px] font-prism"
    >
      <h2
        id="pool-stats-title"
        className="flex items-center gap-2 text-prism-eyebrow uppercase text-prism-ink-2"
      >
        <span aria-hidden className="h-[3px] w-[13px] rounded-full bg-prism-value" />
        Pool stats
      </h2>
      <dl className="grid grid-cols-2 gap-[21px] xl:grid-cols-5 xl:gap-0 xl:divide-x xl:divide-prism-line [&>div]:min-w-0 [&>div]:xl:px-[13px] [&>div:first-child]:xl:pl-0">
        <Cell
          className="col-span-2 xl:col-span-1"
          label="Your stake"
          value={creatorStake === undefined ? bar : formatPoolAmount(creatorStake)}
          unit={creatorStake === undefined ? undefined : symbol}
          line="Counted in Total staked"
        />
        <Cell
          label="Rewards to fans"
          value={
            loading || !stats
              ? bar
              : stats.rewardsToFans === null
                ? "0"
                : formatPoolAmount(stats.rewardsToFans)
          }
          unit={loading || !stats ? undefined : symbol}
          line={
            stats?.rewardsIndexing || stats?.rewardsToFans === null
              ? "Updating"
              : "Network rewards since launch"
          }
        />
        <Cell
          label="New fans this week"
          value={loading || !stats ? bar : stats.newFansThisWeek}
          line={
            !stats || stats.newFansThisWeek > 0
              ? "Joined in the last 7 days"
              : "No new fans this week"
          }
        />
        <Cell
          label="Stake change this month"
          value={loading || !change ? bar : change.value}
          srValue={change?.sr}
          icon={
            change?.direction ? (
              <ArrowIcon aria-hidden className="h-[21px] w-[21px] shrink-0 text-prism-ink-2" />
            ) : undefined
          }
          line={change?.word ?? ""}
        />
        <Cell
          label="Creator share"
          value={creatorCutBps === undefined ? bar : `${Number(creatorCutBps) / 100}%`}
          line="Set at launch"
        />
      </dl>
    </section>
  );
}
