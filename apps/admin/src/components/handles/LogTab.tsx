import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Download, ScrollText } from "lucide-react";
import { toast } from "sonner";
import {
  Button,
  EmptyState,
  ErrorCard,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  trpc,
  trpcClient,
} from "@repo/ui";
import { FilterChips } from "../../kit/parts";
import { SlabPager } from "../../kit/Slab";
import { formatDayTime } from "../../kit/format";
import { causeOf, describeLog } from "./shared";

// Log tab (spec 7.8, board RA8). Every handle action, newest first, filtered
// by action and admin. Export CSV covers the last 90 days of the current filter.

type ActionFilter = "all" | "reserve" | "assign" | "release" | "notice" | "expired";

const FILTERS: { value: ActionFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "reserve", label: "Reserve" },
  { value: "assign", label: "Assign" },
  { value: "release", label: "Release" },
  { value: "notice", label: "Notice" },
  { value: "expired", label: "Hold ended" },
];

const PAGE_SIZE = 50;
const EXPORT_DAYS = 90;

export function LogTab() {
  const [action, setAction] = useState<ActionFilter>("all");
  const [actor, setActor] = useState("all");
  const [page, setPage] = useState(1);
  const [exporting, setExporting] = useState(false);

  const actorId = actor === "all" ? null : Number(actor);
  const list = useQuery(
    trpc.admin.handles.log.list.queryOptions({
      action,
      actorId,
      cursor: (page - 1) * PAGE_SIZE,
      limit: PAGE_SIZE,
    })
  );
  const actors = useQuery(trpc.admin.handles.log.actors.queryOptions());

  const rows = list.data?.items ?? [];
  const total = list.data?.total ?? 0;

  const exportCsv = async () => {
    setExporting(true);
    try {
      const to = new Date();
      const from = new Date(to.getTime() - EXPORT_DAYS * 24 * 60 * 60 * 1000);
      const result = await trpcClient.admin.handles.log.export.query({
        from,
        to,
        action: action === "all" ? undefined : action,
      });
      const blob = new Blob([result.csv], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `handle-log-${to.toISOString().slice(0, 10)}.csv`;
      link.style.display = "none";
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      if (result.truncated) {
        toast.warning(`The file holds the first ${result.rows.toLocaleString("en-US")} rows only.`);
      }
    } catch (error) {
      toast.error(causeOf(error, "The export did not finish. Try again."));
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="space-y-[13px]">
      <div className="flex flex-col gap-3 md:flex-row md:items-center">
        <FilterChips
          label="Action"
          value={action}
          onChange={value => {
            setAction(value);
            setPage(1);
          }}
          options={FILTERS}
        />
        <Select
          value={actor}
          onValueChange={value => {
            setActor(value);
            setPage(1);
          }}
        >
          <SelectTrigger aria-label="Admin" className="h-touch md:w-[189px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All admins</SelectItem>
            {(actors.data ?? []).map(item => (
              <SelectItem key={item.id} value={String(item.id)}>
                @{item.handle ?? item.id}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button
          variant="secondary"
          className="w-full md:ml-auto md:w-auto"
          onClick={() => void exportCsv()}
          disabled={exporting}
          aria-busy={exporting || undefined}
        >
          <Download aria-hidden />
          Export CSV
        </Button>
      </div>

      {list.isError ? (
        <ErrorCard
          title="The log did not load"
          cause="The server did not answer. Check your connection, then try again."
          retryLabel="Retry"
          onRetry={() => void list.refetch()}
        />
      ) : !list.isPending && rows.length === 0 ? (
        <div className="prism-slab">
          <EmptyState
            icon={ScrollText}
            title="No handle actions yet"
            description="Every reserve, assign, release and notice is saved here with its reason."
          />
        </div>
      ) : (
        <div className="prism-slab overflow-hidden">
          <ul aria-label="Handle log" className="divide-y divide-prism-line">
            {list.isPending
              ? Array.from({ length: 6 }).map((_, index) => (
                  <li key={index} aria-hidden className="h-14" />
                ))
              : rows.map(row => (
                  <li
                    key={row.id}
                    className="flex min-h-14 flex-col gap-1 px-4 py-2 md:flex-row md:gap-4"
                  >
                    <time
                      dateTime={new Date(row.createdAt).toISOString()}
                      className="shrink-0 text-prism-meta tabular-nums text-prism-ink-2 md:w-[144px]"
                    >
                      {formatDayTime(row.createdAt)}
                    </time>
                    <div className="min-w-0 flex-1">
                      <p className="text-prism-label text-prism-ink">{describeLog(row)}</p>
                      {row.reason && (
                        <p className="text-prism-meta text-prism-ink-2">{row.reason}</p>
                      )}
                    </div>
                  </li>
                ))}
          </ul>
          <SlabPager
            page={page}
            pages={Math.max(1, Math.ceil(total / PAGE_SIZE))}
            total={total}
            pageSize={PAGE_SIZE}
            onPage={setPage}
            noun="Log"
          />
        </div>
      )}
    </div>
  );
}
