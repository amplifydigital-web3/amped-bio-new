import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight, Link2 } from "lucide-react";
import { toast } from "sonner";
import { Button, EmptyState, ErrorCard, trpc, trpcClient } from "@repo/ui";
import { undoToast } from "../../kit/parts";
import { SlabPager } from "../../kit/Slab";
import { formatCount } from "../../kit/format";
import { causeOf, shortDay } from "./shared";

// Redirects tab (spec 7.7, board RA7). Live old links, newest first. End now
// stops one at once and offers Undo.

const PAGE_SIZE = 50;

export function RedirectsTab() {
  const [page, setPage] = useState(1);
  const [ending, setEnding] = useState<string | null>(null);
  const list = useQuery(
    trpc.admin.handles.redirects.list.queryOptions({
      cursor: (page - 1) * PAGE_SIZE,
      limit: PAGE_SIZE,
    })
  );

  const refetch = () => void list.refetch();

  const end = async (oldHandle: string) => {
    setEnding(oldHandle);
    try {
      const { auditId } = await trpcClient.admin.handles.redirects.end.mutate({
        oldHandle,
        reason: "Ended from the Redirects tab",
      });
      refetch();
      undoToast(`amped.bio/${oldHandle} no longer redirects.`, () => {
        trpcClient.admin.handles.redirects.restore
          .mutate({ auditId })
          .then(() => {
            toast.success(`amped.bio/${oldHandle} redirects again.`);
            refetch();
          })
          .catch(error => toast.error(causeOf(error, "The redirect could not be restored.")));
      });
    } catch (error) {
      toast.error(causeOf(error, "The redirect did not end. Try again."));
    } finally {
      setEnding(null);
    }
  };

  const rows = list.data?.items ?? [];
  const total = list.data?.total ?? 0;

  if (list.isError) {
    return (
      <ErrorCard
        title="Redirects did not load"
        cause="The server did not answer. Check your connection, then try again."
        retryLabel="Retry"
        onRetry={refetch}
      />
    );
  }

  return (
    <div className="space-y-[13px]">
      {!list.isPending && rows.length === 0 ? (
        <div className="prism-slab">
          <EmptyState
            icon={Link2}
            title="No live redirects"
            description="When an account moves to a new link, its old link can send visitors on for 90 days."
          />
        </div>
      ) : (
        <div className="prism-slab overflow-hidden">
          <ul aria-label="Redirects" className="divide-y divide-prism-line">
            {list.isPending
              ? Array.from({ length: 4 }).map((_, index) => (
                  <li key={index} aria-hidden className="h-16" />
                ))
              : rows.map(row => (
                  <li
                    key={row.oldHandle}
                    className="flex min-h-16 flex-col gap-2 px-4 py-3 md:flex-row md:items-center"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="flex flex-wrap items-center gap-1 text-prism-label font-semibold text-prism-ink">
                        <span className="truncate">amped.bio/{row.oldHandle}</span>
                        <ArrowRight aria-label="to" className="h-4 w-4 shrink-0 text-prism-ink-2" />
                        <span className="truncate">
                          {row.user.handle ? `amped.bio/${row.user.handle}` : "Account has no link"}
                        </span>
                      </p>
                      <p className="text-prism-meta tabular-nums text-prism-ink-2">
                        Ends {shortDay(row.endsAt)}. {formatCount(row.hits)}{" "}
                        {row.hits === 1 ? "visit" : "visits"} in 30 days.
                      </p>
                    </div>
                    <Button
                      variant="secondary"
                      className="w-full md:w-auto"
                      onClick={() => void end(row.oldHandle)}
                      disabled={ending === row.oldHandle}
                      aria-busy={ending === row.oldHandle || undefined}
                    >
                      End now
                    </Button>
                  </li>
                ))}
          </ul>
          <SlabPager
            page={page}
            pages={Math.max(1, Math.ceil(total / PAGE_SIZE))}
            total={total}
            pageSize={PAGE_SIZE}
            onPage={setPage}
            noun="Redirects"
          />
        </div>
      )}
      <p className="text-prism-meta text-prism-ink-2">
        A redirect ends early when someone claims the old link after it is released.
      </p>
    </div>
  );
}
