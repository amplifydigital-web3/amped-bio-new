/**
 * People, Members (MB-1; memberships amendment 1 3.1, Screen Review row 369, board mb1).
 * One plan line with a link to Store, Membership (MB-2 draws the editor there), the
 * recurring tile, filters and one row per member with their state. Name and handle only.
 */
import { useMemo, useState } from "react";
import { useInfiniteQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router";
import { UsersRound } from "lucide-react";
import {
  MEMBERSHIP_COPY,
  MEMBERSHIP_INTERVAL_WORDS,
  PLATFORM_FEE_BPS,
  usdcDollarsLabel,
  type MemberRow,
  type MembershipPlanOut,
} from "@repo/constants";
import { Button, Chip, EmptyState, ErrorCard, Skeleton, cn, trpc } from "@repo/ui";
import { useDelayed } from "@/hooks/useDelayed";

const FILTERS = [
  ["all", "All"],
  ["every_30_days", "Every 30 days"],
  ["yearly", "Yearly"],
  ["in_grace", "In grace"],
  ["ended", "Ended"],
] as const;
type Filter = (typeof FILTERS)[number][0];

function dateLabel(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export function stateLabel(row: MemberRow): string {
  const S = MEMBERSHIP_COPY.states;
  switch (row.state) {
    case "in_grace":
      return S.in_grace(row.graceDay ?? 1);
    case "ended":
      return S.ended(row.endedAt ? dateLabel(row.endedAt) : "");
    case "not_ready":
      return S.not_ready;
    case "renewal_paused":
      return S.renewal_paused;
    default:
      return S.active;
  }
}

/** What the creator receives per renewal on the 30 day plan, after the fee. */
function perRenewal(plan: MembershipPlanOut, feeBps = PLATFORM_FEE_BPS) {
  const amount = BigInt(plan.amountEvery30Days);
  return amount - (amount * BigInt(feeBps)) / 10_000n;
}

export function MembersView({ plan }: { plan: MembershipPlanOut }) {
  const navigate = useNavigate();
  const [filter, setFilter] = useState<Filter>("all");
  const list = useInfiniteQuery(
    trpc.memberships.members.infiniteQueryOptions(
      { filter },
      { getNextPageParam: last => last.nextCursor ?? undefined }
    )
  );
  const rows = useMemo(() => list.data?.pages.flatMap(p => p.rows) ?? [], [list.data]);
  const skeleton = useDelayed(list.isLoading, 400);

  return (
    <div className="space-y-[21px]">
      <section className="flex flex-wrap items-center justify-between gap-[13px] rounded-prism-21 bg-white/70 p-[21px] shadow-prism-e1">
        <div className="min-w-0">
          <p className="truncate text-prism-label font-semibold text-prism-ink">{plan.name}</p>
          <p className="text-prism-meta text-prism-ink-2">
            {usdcDollarsLabel(plan.amountEvery30Days)} {MEMBERSHIP_INTERVAL_WORDS.every_30_days}
            {plan.amountYearly
              ? `, ${usdcDollarsLabel(plan.amountYearly)} ${MEMBERSHIP_INTERVAL_WORDS.yearly}`
              : ""}
          </p>
          <p className="text-prism-meta text-prism-ink-2">
            You receive {usdcDollarsLabel(perRenewal(plan))} per renewal.
          </p>
        </div>
        <Button variant="secondary" onClick={() => navigate("/content?tab=store&view=membership")}>
          Edit plan
        </Button>
      </section>

      <div role="group" aria-label="Filter" className="flex flex-wrap gap-2">
        {FILTERS.map(([value, label]) => (
          <Chip key={value} selected={filter === value} onClick={() => setFilter(value)}>
            {label}
          </Chip>
        ))}
      </div>

      {list.isLoading ? (
        skeleton ? (
          <div aria-busy aria-label="Loading members" className="space-y-2">
            {[0, 1, 2].map(i => (
              <Skeleton key={i} className="h-[64px] w-full rounded-prism-13" />
            ))}
          </div>
        ) : null
      ) : list.isError ? (
        <ErrorCard
          title="Members did not load"
          cause="Check your connection and try again."
          onRetry={() => void list.refetch()}
        />
      ) : rows.length === 0 ? (
        <EmptyState
          icon={UsersRound}
          title={filter === "all" ? "No members yet" : "No members match this filter"}
          description={
            filter === "all" ? "When a fan joins your membership, they show up here." : undefined
          }
        />
      ) : (
        <>
          <ul aria-label="Members" className="space-y-1">
            {rows.map(row => (
              <li
                key={row.id}
                className="flex min-h-[64px] items-center gap-3 rounded-prism-13 px-2 py-2"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-prism-label font-semibold text-prism-ink">
                    {row.member?.name ||
                      (row.member?.handle ? `@${row.member.handle}` : "A former member")}
                  </p>
                  <p className="truncate text-prism-meta text-prism-ink-2">
                    {row.member?.handle ? `@${row.member.handle}, ` : ""}
                    {usdcDollarsLabel(row.amount)} {MEMBERSHIP_INTERVAL_WORDS[row.interval]}
                    {row.accessUntil && row.state === "in_grace"
                      ? `. ${MEMBERSHIP_COPY.accessUntil(dateLabel(row.accessUntil))}`
                      : ""}
                  </p>
                </div>
                <span
                  className={cn(
                    "inline-flex h-6 shrink-0 items-center rounded-full px-2 text-[13px] font-semibold",
                    row.state === "active"
                      ? "bg-prism-nav-tint text-prism-ink"
                      : row.state === "ended"
                        ? "bg-prism-line text-prism-ink-2"
                        : "bg-prism-warning-bg text-prism-warning-ink"
                  )}
                >
                  {stateLabel(row)}
                </span>
              </li>
            ))}
          </ul>
          {list.hasNextPage && (
            <div className="flex justify-center">
              <Button
                variant="secondary"
                onClick={() => void list.fetchNextPage()}
                disabled={list.isFetchingNextPage}
              >
                {list.isFetchingNextPage ? "Loading" : "Show more"}
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
