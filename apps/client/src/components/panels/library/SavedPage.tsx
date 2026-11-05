/**
 * Saved (Build Board #26, FL-3, board m1 Saved tile). Items the fan saved and
 * can still open, newest save first. Lost access hides an item without
 * deleting the save (FL-2, choice 5).
 */
import { useMemo } from "react";
import { useInfiniteQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router";
import { Bookmark } from "lucide-react";
import { Button, EmptyState, ErrorCard, trpc } from "@repo/ui";
import { useDelayed } from "@/hooks/useDelayed";
import { LIBRARY_COPY } from "./copy";
import { LIBRARY_PATHS } from "./paths";
import { ItemMenu } from "./ItemMenu";
import { ItemListSkeleton, ItemRow } from "./parts";

const C = LIBRARY_COPY;

export function SavedPage() {
  const navigate = useNavigate();
  const list = useInfiniteQuery(
    trpc.library.saved.infiniteQueryOptions(
      {},
      { getNextPageParam: last => last.nextCursor ?? undefined }
    )
  );
  const items = useMemo(() => list.data?.pages.flatMap(p => p.items) ?? [], [list.data]);
  const skeleton = useDelayed(list.isLoading, 400);

  let body: React.ReactNode;
  if (list.isLoading) {
    body = skeleton ? <ItemListSkeleton label={C.savedTitle} /> : null;
  } else if (list.isError) {
    body = (
      <ErrorCard title={C.error.title} cause={C.error.cause} onRetry={() => void list.refetch()} />
    );
  } else if (!items.length) {
    body = <EmptyState icon={Bookmark} title={C.empty.savedTitle} description={C.empty.saved} />;
  } else {
    body = (
      <>
        <ul className="space-y-1">
          {items.map(item => (
            <li key={item.publicId}>
              <ItemRow
                item={item}
                onOpen={() =>
                  navigate(LIBRARY_PATHS.item(item.owner.handle, item.publicId), {
                    state: { savedAt: item.savedAt },
                  })
                }
                menu={<ItemMenu item={item} />}
              />
            </li>
          ))}
        </ul>
        {list.hasNextPage && (
          <div className="flex justify-center pt-2">
            <Button
              variant="secondary"
              onClick={() => void list.fetchNextPage()}
              disabled={list.isFetchingNextPage}
            >
              {list.isFetchingNextPage ? C.loadingMore : C.showMore}
            </Button>
          </div>
        )}
      </>
    );
  }

  return (
    <section aria-labelledby="library-saved-page" className="space-y-[13px]">
      <h2 id="library-saved-page" className="text-[20px] font-semibold text-prism-ink">
        {C.savedTitle}
      </h2>
      {body}
    </section>
  );
}
