import { useQuery } from "@tanstack/react-query";
import { ErrorCard, Skeleton, trpc } from "@repo/ui";
import { Eyebrow } from "../../kit/parts";
import { formatCount, publicPageUrl } from "../../kit/format";

// Screen Review 087 I11 and I12: the Content row. Block performance as two key
// figures and proportional bars (#5650A2 on a line track, 8 high, exact
// percents), and Top handles as a G2 slab whose rows open the public page.

function BlockPerformance() {
  const stats = useQuery(trpc.admin.dashboard.getDashboardStats.queryOptions());
  const blocks = useQuery(trpc.admin.blocks.getBlockStats.queryOptions({}));

  if (stats.isPending || blocks.isPending) {
    return (
      <div aria-busy className="prism-glass-clear !rounded-prism-21 p-5">
        <Skeleton delayMs={400} className="h-6 w-48" />
        {Array.from({ length: 5 }).map((_, index) => (
          <Skeleton key={index} delayMs={400} className="mt-4 h-3 w-full" />
        ))}
      </div>
    );
  }
  if (stats.isError || blocks.isError || !stats.data || !blocks.data) {
    return (
      <ErrorCard
        title="Block performance did not load"
        cause="Check your connection, then try again."
        retryLabel="Retry"
        onRetry={() => {
          void stats.refetch();
          void blocks.refetch();
        }}
      />
    );
  }

  const total = blocks.data.totalBlocks || 0;
  const rows = ((blocks.data.blocksByType ?? []) as { type: string; count: number }[])
    .map(item => ({
      type: item.type,
      percent: total > 0 ? Math.round((item.count / total) * 100) : 0,
    }))
    .sort((a, b) => b.percent - a.percent);
  const { mostPopularBlockType, averageBlocksPerUser } = stats.data.blockStats;

  return (
    <section
      aria-labelledby="block-performance"
      className="prism-glass-clear !rounded-prism-21 p-5 font-prism"
    >
      <h3 id="block-performance" className="text-prism-panel-title text-prism-ink">
        Block performance
      </h3>
      <dl className="mt-[13px] flex flex-wrap gap-x-8 gap-y-2">
        <div>
          <dt className="text-prism-meta text-prism-ink-2">Most popular</dt>
          <dd className="text-prism-label font-semibold capitalize text-prism-ink">
            {mostPopularBlockType || "None yet"}
          </dd>
        </div>
        <div>
          <dt className="text-prism-meta text-prism-ink-2">Average per user</dt>
          <dd className="text-prism-label font-semibold tabular-nums text-prism-ink">
            {Number(averageBlocksPerUser).toLocaleString("en-US", { maximumFractionDigits: 1 })}{" "}
            blocks
          </dd>
        </div>
      </dl>
      <ul className="mt-5 space-y-[13px]">
        {rows.map(row => (
          <li key={row.type} className="grid grid-cols-[110px_1fr_44px] items-center gap-3">
            <span className="truncate text-prism-label capitalize text-prism-ink">{row.type}</span>
            <span aria-hidden className="h-2 overflow-hidden rounded-full bg-[rgba(22,21,43,0.10)]">
              <span
                className="block h-full rounded-full bg-prism-nav"
                style={{ width: `${row.percent}%` }}
              />
            </span>
            <span className="text-right text-prism-meta tabular-nums text-prism-ink">
              {row.percent}%
            </span>
          </li>
        ))}
        {rows.length === 0 && <li className="text-prism-body text-prism-ink-2">No blocks yet.</li>}
      </ul>
    </section>
  );
}

function TopHandles() {
  const handles = useQuery(trpc.admin.users.getTopHandles.queryOptions({ limit: 5 }));

  if (handles.isError) {
    return (
      <ErrorCard
        title="Top handles did not load"
        cause="Check your connection, then try again."
        retryLabel="Retry"
        onRetry={() => void handles.refetch()}
      />
    );
  }

  const rows = (handles.data ?? []).filter(
    (item): item is NonNullable<typeof item> => !!item && !!item.handle
  );

  return (
    <div className="prism-slab overflow-hidden font-prism">
      <table aria-label="Top handles" className="w-full text-left">
        <thead>
          <tr className="h-touch text-prism-eyebrow uppercase text-prism-ink-2">
            <th scope="col" className="px-4 font-semibold">
              Handle
            </th>
            <th scope="col" className="px-4 text-right font-semibold">
              Clicks
            </th>
            <th scope="col" className="px-4 text-right font-semibold">
              Blocks
            </th>
          </tr>
        </thead>
        <tbody>
          {handles.isPending
            ? Array.from({ length: 5 }).map((_, index) => (
                <tr key={index} aria-hidden className="h-touch border-t border-prism-line">
                  <td className="px-4" colSpan={3}>
                    <Skeleton delayMs={400} className="h-3 w-2/3" />
                  </td>
                </tr>
              ))
            : rows.map(item => (
                <tr
                  key={item.userId}
                  className="h-touch cursor-pointer border-t border-prism-line hover:bg-prism-nav-tint"
                  onClick={() => window.open(publicPageUrl(item.handle!), "_blank", "noopener")}
                >
                  <td className="px-4">
                    <a
                      href={publicPageUrl(item.handle!)}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={event => event.stopPropagation()}
                      className="prism-focus rounded-prism-8 text-prism-label font-semibold text-prism-ink"
                    >
                      @{item.handle}
                      <span className="sr-only"> (opens the public page in a new tab)</span>
                    </a>
                  </td>
                  <td className="px-4 text-right text-prism-label tabular-nums text-prism-ink">
                    {formatCount(item.totalClicks)}
                  </td>
                  <td className="px-4 text-right text-prism-label tabular-nums text-prism-ink">
                    {formatCount(item.blockCount)}
                  </td>
                </tr>
              ))}
          {!handles.isPending && rows.length === 0 && (
            <tr className="h-touch border-t border-prism-line">
              <td colSpan={3} className="px-4 text-prism-label text-prism-ink-2">
                No clicks yet.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

export function ContentRow() {
  return (
    <section aria-labelledby="dash-content" className="space-y-[13px]">
      <Eyebrow id="dash-content">Content</Eyebrow>
      <div className="grid gap-5 lg:grid-cols-2 [&>*]:min-w-0">
        <BlockPerformance />
        <TopHandles />
      </div>
    </section>
  );
}
