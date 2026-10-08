import { useQuery } from "@tanstack/react-query";
import { ErrorCard, Skeleton, cn, trpc } from "@repo/ui";
import { formatCount } from "../../kit/format";
import { Eyebrow } from "../../kit/parts";

// Screen Review 087 I07. Four G1 clear r21 tiles, 306 wide at 1440, padding
// 21: eyebrow, value 26/33 700 tabular, then up to two 13/16 meta lines. The
// direction of a trend is a word (Up or Down) in success or danger, never
// color or an arrow alone. Each tile loads and fails on its own (I06).

function percentChange(current: number, previous: number): number | null {
  if (previous > 0) return Math.round(((current - previous) / previous) * 100);
  return current > 0 ? null : 0;
}

function Trend({ change, suffix }: { change: number | null; suffix: string }) {
  if (change === null) return <>New, none {suffix}</>;
  if (change === 0) return <>No change {suffix}</>;
  const up = change > 0;
  return (
    <>
      <span className={cn("font-semibold", up ? "text-prism-success" : "text-prism-danger")}>
        {up ? "Up" : "Down"} {Math.abs(change)}%
      </span>{" "}
      {suffix}
    </>
  );
}

function Tile({
  label,
  value,
  lines,
}: {
  label: string;
  value: React.ReactNode;
  lines: React.ReactNode[];
}) {
  return (
    <section
      aria-label={label}
      className="prism-glass-clear min-h-[144px] !rounded-prism-21 p-5 font-prism"
    >
      <Eyebrow as="h3">{label}</Eyebrow>
      <p className="mt-3 text-prism-card-title tabular-nums text-prism-ink">{value}</p>
      <div className="mt-2 space-y-1 text-prism-meta tabular-nums text-prism-ink-2">
        {lines.map((line, index) => (
          <p key={index}>{line}</p>
        ))}
      </div>
    </section>
  );
}

function TileSkeleton({ label }: { label: string }) {
  return (
    <section
      aria-label={label}
      aria-busy
      className="prism-glass-clear min-h-[144px] !rounded-prism-21 p-5"
    >
      <Eyebrow as="h3">{label}</Eyebrow>
      <Skeleton delayMs={400} className="mt-3 h-8 w-28" />
      <Skeleton delayMs={400} className="mt-3 h-3 w-36" />
      <Skeleton delayMs={400} className="mt-2 h-3 w-28" />
    </section>
  );
}

const LABELS = ["Users", "Blocks", "Clicks", "Reward program"];

export function StatTiles() {
  const stats = useQuery(trpc.admin.dashboard.getDashboardStats.queryOptions());

  let tiles: React.ReactNode[];
  if (stats.isPending) {
    tiles = LABELS.map(label => <TileSkeleton key={label} label={label} />);
  } else if (stats.isError || !stats.data) {
    tiles = LABELS.map(label => (
      <ErrorCard
        key={label}
        className="min-h-[144px] !rounded-prism-21"
        title={`${label} did not load`}
        cause="Check your connection, then try again."
        retryLabel="Retry"
        onRetry={() => void stats.refetch()}
      />
    ));
  } else {
    const { userStats: u, blockStats: b } = stats.data;
    tiles = [
      <Tile
        key="users"
        label="Users"
        value={formatCount(u.totalUsers)}
        lines={[
          `${formatCount(u.newThisWeek)} new this week`,
          <Trend
            key="t"
            change={percentChange(u.newThisWeek, u.usersLastWeek ?? 0)}
            suffix="vs last week"
          />,
        ]}
      />,
      <Tile
        key="blocks"
        label="Blocks"
        value={formatCount(b.totalBlocks)}
        lines={[
          `${formatCount(b.blocksCreatedToday)} created today`,
          `${formatCount(b.blocksCreatedLastWeek)} created last week`,
        ]}
      />,
      <Tile
        key="clicks"
        label="Clicks"
        value={formatCount(b.totalClicks)}
        lines={[
          <>
            This week {formatCount(b.clicksThisWeek)},{" "}
            <Trend
              change={percentChange(b.clicksThisWeek, b.clicksLastWeek)}
              suffix="vs last week"
            />
          </>,
          <>
            This month{" "}
            <Trend
              change={percentChange(b.clicksThisMonth, b.clicksLastMonth)}
              suffix="vs last month"
            />
          </>,
        ]}
      />,
      <Tile
        key="reward"
        label="Reward program"
        value={formatCount(u.rewardProgramUsers)}
        lines={["Users in the program", `${u.rewardProgramPercentage}% of all users`]}
      />,
    ];
  }

  return (
    <section aria-labelledby="dash-platform" className="space-y-[13px]">
      <Eyebrow id="dash-platform">Platform</Eyebrow>
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-4 [&>*]:min-w-0">
        {tiles}
      </div>
    </section>
  );
}
