/**
 * People, Access (gating spec 3.10 deltas 7 to 9, G6). Rules and their totals: by rule,
 * by refusal reason and by item. Totals only. Never a fan's name, handle, avatar or
 * wallet, and no per fan rows or times. A bucket under 5 arrives as "under_5" from the
 * server and shows as "Under 5". The tab is only rendered while accessGating is on.
 */
import { useState } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { ChevronDown, Lock } from "lucide-react";
import {
  ACCESS_STATS_RANGES,
  type AccessReason,
  type AccessStatCount,
  type AccessStatRow,
  type AccessStatsRange,
} from "@repo/constants";
import {
  EmptyState,
  ErrorCard,
  Menu,
  MenuContent,
  MenuItem,
  MenuTrigger,
  Skeleton,
  trpc,
} from "@repo/ui";
import { useDelayed } from "@/hooks/useDelayed";
import { ACCESS_INSIGHTS_COPY as C } from "./accessCopy";

const EYEBROW_NAV =
  "flex items-center gap-2 text-prism-eyebrow uppercase text-prism-ink-2 before:h-[3px] before:w-[13px] before:rounded-full before:bg-prism-nav before:content-['']";

const numberFormat = new Intl.NumberFormat("en-US");
const dayFormat = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" });

export function countText(value: AccessStatCount): string {
  return value === "under_5" ? C.under5 : numberFormat.format(value);
}

function rateText(rate: number | null): string {
  return rate === null ? C.noRate : `${rate}%`;
}

function Tile({ label, value, note }: { label: string; value: string; note: string }) {
  return (
    <div className="prism-glass-clear flex min-w-0 flex-col !rounded-prism-21 p-[13px] font-prism md:p-[21px]">
      <span className="text-prism-label font-semibold text-prism-ink-2">{label}</span>
      <div className="mt-[8px] text-prism-card-title tabular-nums text-prism-ink">{value}</div>
      <span className="mt-1 text-prism-meta text-prism-ink-2">{note}</span>
    </div>
  );
}

/** Saw it locked, opened and the open rate, in one line under a rule or an item. */
function RowNumbers({ row }: { row: AccessStatRow }) {
  return (
    <dl className="flex flex-wrap gap-x-[21px] gap-y-1 text-prism-meta text-prism-ink-2">
      <div className="flex gap-1">
        <dt>{C.columns.locked}</dt>
        <dd className="font-semibold tabular-nums text-prism-ink">
          {countText(row.lockedViewers)}
        </dd>
      </div>
      <div className="flex gap-1">
        <dt>{C.columns.opened}</dt>
        <dd className="font-semibold tabular-nums text-prism-ink">
          {countText(row.openedViewers)}
        </dd>
      </div>
      <div className="flex gap-1">
        <dt>{C.columns.rate}</dt>
        <dd className="font-semibold tabular-nums text-prism-ink">{rateText(row.openRate)}</dd>
      </div>
    </dl>
  );
}

export function AccessView() {
  const [range, setRange] = useState<AccessStatsRange>("30d");
  const stats = useQuery({
    ...trpc.access.rules.stats.queryOptions({ range }),
    placeholderData: keepPreviousData,
  });
  const showSkeleton = useDelayed(stats.isLoading, 400);
  const data = stats.data;

  return (
    <div className="space-y-[21px] px-[21px] pb-[55px] pt-[21px] font-prism">
      <div className="flex flex-wrap items-center justify-between gap-[13px]">
        <h2 className={EYEBROW_NAV}>{C.title}</h2>
        {data && data.rules.length > 0 && (
          <Menu>
            <MenuTrigger
              aria-label={`${C.periodLabel}: ${C.ranges[range]}`}
              className="prism-well prism-focus flex h-touch items-center justify-between gap-2 px-[13px] text-prism-label text-prism-ink md:w-[233px]"
            >
              <span className="truncate">{C.ranges[range]}</span>
              <ChevronDown aria-hidden className="h-[21px] w-[21px] shrink-0 text-prism-ink-2" />
            </MenuTrigger>
            <MenuContent align="end" className="min-w-[233px]">
              {ACCESS_STATS_RANGES.map(value => (
                <MenuItem
                  key={value}
                  role="menuitemradio"
                  aria-checked={value === range}
                  onSelect={() => setRange(value)}
                >
                  {C.ranges[value]}
                </MenuItem>
              ))}
            </MenuContent>
          </Menu>
        )}
      </div>
      <p className="text-prism-meta text-prism-ink-2">{C.pilot}</p>

      {stats.isError ? (
        <ErrorCard title={C.errorTitle} cause={C.errorCause} onRetry={() => void stats.refetch()} />
      ) : stats.isLoading || !data ? (
        showSkeleton ? (
          <div
            className="grid grid-cols-2 gap-[13px] md:grid-cols-4 md:gap-[21px]"
            aria-busy
            aria-label={C.loading}
          >
            {[0, 1, 2, 3].map(index => (
              <Skeleton
                key={index}
                className="h-[110px] rounded-prism-21 motion-reduce:animate-none"
              />
            ))}
          </div>
        ) : null
      ) : data.rules.length === 0 ? (
        <div className="prism-glass-clear flex min-h-[377px] items-center justify-center !rounded-prism-21">
          <EmptyState icon={Lock} title={C.emptyTitle} description={C.emptyBody} />
        </div>
      ) : (
        <>
          <section
            aria-label={C.totalsLabel}
            className="grid grid-cols-2 gap-[13px] md:grid-cols-4 md:gap-[21px]"
          >
            <Tile
              label={C.tiles.locked}
              value={countText(data.totals.lockedViewers)}
              note={C.tiles.lockedNote}
            />
            <Tile
              label={C.tiles.tried}
              value={countText(data.totals.triedViewers)}
              note={C.tiles.triedNote}
            />
            <Tile
              label={C.tiles.opened}
              value={countText(data.totals.openedViewers)}
              note={C.tiles.openedNote}
            />
            <Tile
              label={C.tiles.rate}
              value={rateText(data.totals.openRate)}
              note={C.tiles.rateNote}
            />
          </section>

          <div className="grid gap-[21px] lg:grid-cols-[minmax(0,1fr)_386px]">
            <div className="flex min-w-0 flex-col gap-[21px]">
              <section
                aria-labelledby="access-rules"
                className="prism-glass-clear min-w-0 !rounded-prism-21 p-[21px]"
              >
                <h3 id="access-rules" className={EYEBROW_NAV}>
                  {C.rulesTitle}
                </h3>
                <ul className="mt-[13px]">
                  {data.rules.map(rule => (
                    <li
                      key={rule.ruleId}
                      className="flex flex-col gap-1 border-t border-prism-line py-[13px] first:border-t-0"
                    >
                      <div className="flex min-w-0 flex-wrap items-baseline justify-between gap-x-3">
                        <span className="truncate text-prism-label font-semibold text-prism-ink">
                          {rule.name ?? rule.summary}
                        </span>
                        <span className="text-prism-meta text-prism-ink-2">
                          {C.uses(rule.uses)}
                        </span>
                      </div>
                      {rule.name && (
                        <span className="text-prism-meta text-prism-ink-2">{rule.summary}</span>
                      )}
                      {rule.opensToAllAt && (
                        <span className="text-prism-meta text-prism-ink-2">
                          {new Date(rule.opensToAllAt) <= new Date()
                            ? C.openedToAll(dayFormat.format(new Date(rule.opensToAllAt)))
                            : C.opensToAll(dayFormat.format(new Date(rule.opensToAllAt)))}
                        </span>
                      )}
                      <RowNumbers row={rule} />
                    </li>
                  ))}
                </ul>
              </section>

              <section
                aria-labelledby="access-items"
                className="prism-glass-clear min-w-0 !rounded-prism-21 p-[21px]"
              >
                <h3 id="access-items" className={EYEBROW_NAV}>
                  {C.itemsTitle}
                </h3>
                {data.items.length === 0 ? (
                  <p className="mt-[13px] text-prism-body text-prism-ink-2">{C.itemsEmpty}</p>
                ) : (
                  <ul className="mt-[13px]">
                    {data.items.map(item => (
                      <li
                        key={`${item.type}:${item.id}`}
                        className="flex flex-col gap-1 border-t border-prism-line py-[13px] first:border-t-0"
                      >
                        <span className="truncate text-prism-label font-semibold text-prism-ink">
                          {item.label}
                        </span>
                        <span className="text-prism-meta text-prism-ink-2">
                          {item.type === "block" ? C.itemBlock : C.itemContent}
                        </span>
                        <RowNumbers row={item} />
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            </div>

            <aside className="flex flex-col gap-[21px]">
              <section
                aria-labelledby="access-reasons"
                className="prism-glass-clear flex flex-col gap-[13px] !rounded-prism-21 p-[21px]"
              >
                <h3 id="access-reasons" className={EYEBROW_NAV}>
                  {C.reasonsTitle}
                </h3>
                {data.reasons.length === 0 ? (
                  <p className="text-prism-body text-prism-ink-2">{C.reasonsEmpty}</p>
                ) : (
                  <ul>
                    {data.reasons.map(row => (
                      <li
                        key={row.reason}
                        className="flex justify-between gap-3 border-t border-prism-line py-[8px] text-prism-body text-prism-ink first:border-t-0"
                      >
                        <span className="min-w-0 truncate">{reasonText(row.reason)}</span>
                        <span className="shrink-0 font-semibold tabular-nums">
                          {countText(row.viewers)}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
              <p className="text-prism-meta text-prism-ink-2">{C.privacy}</p>
            </aside>
          </div>
        </>
      )}
    </div>
  );
}

export function reasonText(reason: AccessReason): string {
  return C.reasons[reason] ?? C.reasons.kind_unavailable;
}
