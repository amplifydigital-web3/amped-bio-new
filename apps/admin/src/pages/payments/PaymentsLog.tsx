import { useState } from "react";
import { useInfiniteQuery, useQuery, useQueryClient } from "@tanstack/react-query";
import { Download } from "lucide-react";
import { toast } from "sonner";
import { Button, ErrorCard, trpc } from "@repo/ui";
import { FilterChips } from "../../kit/parts";
import {
  SlabMessageRow,
  SlabSkeletonRows,
  SlabTable,
  rowClass,
  stickyCell,
  tdClass,
  thClass,
} from "../../kit/Slab";
import { downloadCsv, formatDayTime } from "../../kit/format";
import { ReviewSheet } from "./ChangeSheet";
import {
  PaymentsNav,
  StatusBadge,
  WhereBadge,
  changeStatus,
  who,
  type PaymentChange,
} from "./shared";

// Board a4, Change log (spec 3.7, 3.8, acceptance 7). Every payments change in order:
// when, setting, old, new, reason, who drafted it, who approved it and its status. Rows
// cannot be edited or deleted. Filters by status and by where the value lives; CSV export.

type Filter = "all" | "waiting" | "applied" | "closed";
type Target = "any" | "server" | "contract";

const PAGE = 50;

export function PaymentsLog() {
  const queryClient = useQueryClient();
  const viewer = useQuery(trpc.admin.payments.viewer.queryOptions());
  const [filter, setFilter] = useState<Filter>("all");
  const [target, setTarget] = useState<Target>("any");
  const [review, setReview] = useState<PaymentChange | null>(null);
  const [exporting, setExporting] = useState(false);

  const input = {
    filter,
    limit: PAGE,
    ...(target !== "any" ? { target } : {}),
  } as const;

  const log = useInfiniteQuery({
    queryKey: [...trpc.admin.payments.changes.list.queryKey(input), "infinite"],
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam }) =>
      queryClient.fetchQuery(
        trpc.admin.payments.changes.list.queryOptions({
          ...input,
          ...(pageParam ? { before: pageParam } : {}),
        })
      ),
    getNextPageParam: last => last.nextBefore ?? undefined,
  });

  const rows = log.data?.pages.flatMap(page => page.items) ?? [];

  const exportCsv = async () => {
    setExporting(true);
    try {
      const all = await queryClient.fetchQuery(trpc.admin.payments.changes.export.queryOptions());
      downloadCsv(
        `payments-change-log-${new Date().toISOString().slice(0, 10)}.csv`,
        [
          "When",
          "Setting",
          "Where",
          "Old",
          "New",
          "Applies from",
          "Reason",
          "Drafted by",
          "Approved by",
          "Status",
          "Note",
          "Applied at",
        ],
        all.map(change => [
          change.createdAt,
          change.label,
          change.target,
          change.oldText,
          change.newText,
          change.effectiveAt,
          change.reason,
          who(change.draftedBy, change.draftedById),
          who(change.approvedBy, change.approvedById),
          changeStatus(change).label,
          change.decisionNote,
          change.appliedAt,
        ])
      );
    } catch {
      toast.error("The export did not finish. Try again.");
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="space-y-[21px] font-prism">
      <PaymentsNav />
      <div className="flex flex-wrap items-end justify-between gap-3">
        <p className="max-w-[72ch] text-prism-body text-prism-ink-2">
          Every payments change, in order. Rows cannot be edited or deleted. Each one names who
          drafted it, who approved it and why.
        </p>
        <Button
          variant="secondary"
          onClick={() => void exportCsv()}
          disabled={exporting}
          aria-busy={exporting || undefined}
        >
          <Download aria-hidden />
          Export CSV
        </Button>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <FilterChips<Filter>
          className="max-w-full"
          label="Status"
          value={filter}
          onChange={setFilter}
          options={[
            { value: "all", label: "All" },
            { value: "waiting", label: "Waiting" },
            { value: "applied", label: "Applied" },
            { value: "closed", label: "Rejected or expired" },
          ]}
        />
        <FilterChips<Target>
          className="max-w-full"
          label="Where"
          value={target}
          onChange={setTarget}
          options={[
            { value: "any", label: "Any" },
            { value: "server", label: "Server" },
            { value: "contract", label: "On chain" },
          ]}
        />
      </div>
      {log.isError ? (
        <ErrorCard
          title="The change log did not load"
          cause="Try again in a moment."
          retryLabel="Retry"
          onRetry={() => void log.refetch()}
        />
      ) : (
        <SlabTable label="Payments change log">
          <thead>
            <tr>
              <th scope="col" className={`${thClass} ${stickyCell}`}>
                When
              </th>
              <th scope="col" className={thClass}>
                Setting
              </th>
              <th scope="col" className={thClass}>
                Old
              </th>
              <th scope="col" className={thClass}>
                New
              </th>
              <th scope="col" className={thClass}>
                Reason
              </th>
              <th scope="col" className={thClass}>
                Drafted
              </th>
              <th scope="col" className={thClass}>
                Approved
              </th>
              <th scope="col" className={thClass}>
                Status
              </th>
            </tr>
          </thead>
          {log.isPending ? (
            <SlabSkeletonRows columns={8} />
          ) : rows.length === 0 ? (
            <SlabMessageRow columns={8}>
              <p className="px-4 py-5 text-prism-body text-prism-ink-2">
                {filter === "all" && target === "any"
                  ? "No payments changes yet."
                  : "No changes match these filters."}
              </p>
            </SlabMessageRow>
          ) : (
            <tbody>
              {rows.map(change => (
                <tr key={change.id} className={`${rowClass} align-top`}>
                  <td
                    className={`${tdClass} ${stickyCell} whitespace-nowrap py-3 text-prism-meta tabular-nums text-prism-ink-2`}
                  >
                    {formatDayTime(change.createdAt)}
                  </td>
                  <td className={`${tdClass} py-3`}>
                    <span className="block text-prism-label font-semibold text-prism-ink">
                      {change.label}
                    </span>
                    <WhereBadge target={change.target} />
                  </td>
                  <td className={`${tdClass} py-3 font-mono text-prism-meta text-prism-ink-2`}>
                    {change.oldText}
                  </td>
                  <td className={`${tdClass} py-3 font-mono text-prism-meta text-prism-ink`}>
                    {change.newText}
                    {change.effectiveAt && (
                      <span className="block font-prism text-prism-ink-2">
                        from {formatDayTime(change.effectiveAt)}
                      </span>
                    )}
                  </td>
                  <td className={`${tdClass} max-w-[280px] py-3 text-prism-meta text-prism-ink`}>
                    {change.reason}
                  </td>
                  <td
                    className={`${tdClass} whitespace-nowrap py-3 text-prism-meta text-prism-ink-2`}
                  >
                    {who(change.draftedBy, change.draftedById)}
                  </td>
                  <td className={`${tdClass} py-3 text-prism-meta text-prism-ink-2`}>
                    {change.approvedById
                      ? who(change.approvedBy, change.approvedById)
                      : change.key === "payments_paused" && change.status === "applied"
                        ? "Not needed for pause"
                        : change.status === "draft"
                          ? "Waiting"
                          : ""}
                  </td>
                  <td className={`${tdClass} py-3`}>
                    <StatusBadge change={change} />
                    {change.decisionNote && change.status === "rejected" && (
                      <span className="mt-1 block max-w-[220px] text-prism-meta text-prism-ink-2">
                        {change.decisionNote}
                      </span>
                    )}
                    {change.status === "draft" && viewer.data?.canChange && (
                      <Button variant="link" className="block" onClick={() => setReview(change)}>
                        {viewer.data.userId === change.draftedById ? "Your draft" : "Review"}
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          )}
        </SlabTable>
      )}
      {log.hasNextPage && (
        <Button
          variant="secondary"
          onClick={() => void log.fetchNextPage()}
          disabled={log.isFetchingNextPage}
          aria-busy={log.isFetchingNextPage || undefined}
        >
          Show older changes
        </Button>
      )}
      <ReviewSheet
        change={review}
        viewer={viewer.data}
        open={review !== null}
        onOpenChange={open => !open && setReview(null)}
      />
    </div>
  );
}
