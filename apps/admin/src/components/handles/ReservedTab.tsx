import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AtSign, Plus, SearchX } from "lucide-react";
import { Button, EmptyState, ErrorCard, cn, trpc } from "@repo/ui";
import { FilterChips, SearchWell } from "../../kit/parts";
import { SlabSkeletonRows, rowClass, stickyCell, tdClass, thClass } from "../../kit/Slab";
import { formatCount, formatDay } from "../../kit/format";
import { ReserveSheet } from "./ReserveSheet";
import { WordSheet } from "./WordSheet";
import {
  CATEGORY_LABELS,
  PrefixTag,
  StatusBadge,
  TierBadge,
  type Category,
  type WordRow,
} from "./shared";

// Reserved tab (spec 7.2, boards RA1, RA1m, RA1e, RA1n, RA1x). Both tiers in one
// slab. System rows carry a lock and open read only. Reserve a word ends the
// filter row, as New client does on OAuth clients.

type Filter = "all" | "system" | "company" | "trust" | "brand" | "partner" | "hold" | "assigned";

const FILTERS: { value: Filter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "system", label: "System" },
  { value: "company", label: "Company" },
  { value: "trust", label: "Trust" },
  { value: "brand", label: "Brand" },
  { value: "partner", label: "Partner" },
  { value: "hold", label: "Hold" },
  { value: "assigned", label: "Assigned" },
];

const EMPTY_LINES: Partial<Record<Filter, string>> = {
  company: "Reserve the company's own names so no one else can hold them.",
  trust: "Reserve words that read as official, such as support or staff.",
  brand: "Reserve a brand name while the brand verifies its account.",
  partner: "Reserve a partner name to hold it while a deal is open.",
  hold: "Hold a word for a set time. It frees itself on the end date.",
  assigned: "Assign a reserved word to an account from its word sheet.",
};

function matchesFilter(row: WordRow, filter: Filter) {
  if (filter === "all") return true;
  if (filter === "system") return row.tier === "system";
  if (filter === "assigned") return row.status === "assigned";
  return row.category === filter.toUpperCase();
}

function addedLine(row: WordRow) {
  if (row.tier === "system") return "Code";
  const who = row.addedBy?.handle ? `@${row.addedBy.handle}` : "Migration";
  return `${who}, ${formatDay(row.addedAt)}`;
}

function statusLine(row: WordRow) {
  if (row.assignedTo) return `@${row.assignedTo.handle ?? row.assignedTo.id}`;
  return row.reason ?? (row.tier === "system" ? "Route or infrastructure" : "");
}

export function ReservedTab() {
  const list = useQuery(trpc.admin.handles.list.queryOptions({ filter: "all", limit: 500 }));
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [reserving, setReserving] = useState(false);
  const [open, setOpen] = useState<WordRow | null>(null);

  const rows = useMemo(() => list.data?.items ?? [], [list.data]);
  const counts = useMemo(
    () =>
      Object.fromEntries(
        FILTERS.map(({ value }) => [value, rows.filter(row => matchesFilter(row, value)).length])
      ) as Record<Filter, number>,
    [rows]
  );
  const term = search.trim().replace(/^@/, "").toLowerCase();
  const view = rows.filter(
    row =>
      matchesFilter(row, filter) &&
      (!term || row.word.includes(term) || (row.assignedTo?.handle ?? "").includes(term))
  );

  const refetch = () => void list.refetch();

  const body = list.isError ? (
    <ErrorCard
      title="Reserved words did not load"
      cause="The server did not answer. Check your connection, then try again."
      retryLabel="Retry"
      onRetry={refetch}
    />
  ) : !list.isPending && view.length === 0 ? (
    <div className="prism-slab">
      {term ? (
        <EmptyState
          icon={SearchX}
          title={`No words match ${search.trim()}`}
          description="Search covers words and holder handles."
          action={
            <Button variant="ghost" onClick={() => setSearch("")}>
              Clear search
            </Button>
          }
        />
      ) : (
        <EmptyState
          icon={AtSign}
          title={
            filter === "assigned"
              ? "No assigned words yet"
              : `No ${CATEGORY_LABELS[filter.toUpperCase() as Category]?.toLowerCase() ?? ""} words yet`
          }
          description={EMPTY_LINES[filter]}
          action={
            filter !== "assigned" ? (
              <Button variant="secondary" onClick={() => setReserving(true)}>
                Reserve a word
              </Button>
            ) : undefined
          }
        />
      )}
    </div>
  ) : (
    <>
      {/* Desktop slab (RA1) */}
      <div className="prism-slab hidden overflow-hidden md:block">
        <div className="overflow-x-auto">
          <table aria-label="Reserved words" className="w-full min-w-[840px] text-left">
            <thead>
              <tr>
                {["Word", "Tier and category", "Status", "Added"].map((label, index) => (
                  <th key={label} scope="col" className={cn(thClass, index === 0 && stickyCell)}>
                    {label}
                  </th>
                ))}
              </tr>
            </thead>
            {list.isPending ? (
              <SlabSkeletonRows columns={4} />
            ) : (
              <tbody>
                {view.map(row => (
                  <tr
                    key={`${row.tier}-${row.word}`}
                    onClick={() => setOpen(row)}
                    className={cn(rowClass, "cursor-pointer hover:bg-prism-nav-tint")}
                  >
                    <td className={cn(tdClass, stickyCell)}>
                      <button
                        type="button"
                        onClick={event => {
                          event.stopPropagation();
                          setOpen(row);
                        }}
                        className="prism-focus inline-flex items-center rounded-prism-8 text-left text-prism-label font-semibold text-prism-ink"
                      >
                        {row.word}
                        {row.kind === "PREFIX" && <PrefixTag />}
                      </button>
                    </td>
                    <td className={tdClass}>
                      <TierBadge row={row} />
                    </td>
                    <td className={cn(tdClass, "py-1")}>
                      <StatusBadge row={row} />
                      <span className="mt-1 block max-w-[300px] truncate text-prism-meta text-prism-ink-2">
                        {statusLine(row)}
                      </span>
                    </td>
                    <td className={cn(tdClass, "whitespace-nowrap text-prism-meta text-prism-ink")}>
                      {addedLine(row)}
                    </td>
                  </tr>
                ))}
              </tbody>
            )}
          </table>
        </div>
      </div>
      {/* Phone rows (RA1m) */}
      <ul aria-label="Reserved words" className="prism-slab divide-y divide-prism-line md:hidden">
        {list.isPending
          ? Array.from({ length: 5 }).map((_, index) => (
              <li key={index} aria-hidden className="h-14" />
            ))
          : view.map(row => (
              <li key={`${row.tier}-${row.word}`}>
                <button
                  type="button"
                  onClick={() => setOpen(row)}
                  className="prism-focus flex min-h-14 w-full items-center gap-2 px-4 py-2 text-left"
                >
                  <span className="min-w-0 flex-1 truncate text-prism-label font-semibold text-prism-ink">
                    {row.word}
                    {row.kind === "PREFIX" && <PrefixTag />}
                  </span>
                  <TierBadge row={row} />
                  <StatusBadge row={row} />
                </button>
              </li>
            ))}
      </ul>
    </>
  );

  return (
    <div className="space-y-[13px]">
      <div className="flex flex-col gap-3 md:flex-row md:items-center">
        <SearchWell
          label="Search words or holders"
          hideLabel
          placeholder="Search words or holders"
          value={search}
          onChange={setSearch}
          className="md:w-[288px]"
        />
        <FilterChips
          label="Category"
          value={filter}
          onChange={setFilter}
          options={FILTERS.map(({ value, label }) => ({
            value,
            label: (
              <>
                {label}{" "}
                {!list.isPending && (
                  <span className="tabular-nums">{formatCount(counts[value])}</span>
                )}
              </>
            ),
          }))}
        />
        <Button
          variant="secondary"
          className="w-full md:ml-auto md:w-auto"
          onClick={() => setReserving(true)}
        >
          <Plus aria-hidden />
          Reserve a word
        </Button>
      </div>
      {body}
      <ReserveSheet open={reserving} onOpenChange={setReserving} rows={rows} onReserved={refetch} />
      <WordSheet row={open} onClose={() => setOpen(null)} onChanged={refetch} />
    </div>
  );
}
