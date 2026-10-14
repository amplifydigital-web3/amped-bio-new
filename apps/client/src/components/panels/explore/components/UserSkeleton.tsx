import { Skeleton } from "@repo/ui";

/**
 * Screen Review 042 I08, updated for the Explore person cards build. One
 * skeleton at the person card's size: G1 clear r21 with the 89 cover band,
 * the 55 disc over its edge and text bars where name, @handle, bio and the
 * figures land. The row variant is one 55 row on line fill. Skeleton has no
 * pulse under reduced motion.
 */
const UserSkeleton = ({ view = "cards" }: { view?: "cards" | "rows" }) => {
  if (view === "rows") {
    return (
      <div
        aria-hidden
        className="grid grid-cols-[34px_minmax(0,1fr)_auto] items-center gap-[13px] border-b border-prism-line py-2 last:border-b-0"
      >
        <Skeleton className="h-[34px] w-[34px] rounded-full" />
        <div className="space-y-2">
          <Skeleton className="h-4 w-2/5 rounded-prism-5" />
          <Skeleton className="h-3 w-1/4 rounded-prism-5" />
        </div>
        <Skeleton className="h-touch w-[110px] rounded-prism-13" />
      </div>
    );
  }
  return (
    <div aria-hidden className="prism-glass-clear h-[377px] overflow-hidden p-[21px]">
      <div className="-mx-[21px] -mt-[21px] h-[89px] bg-prism-nav-tint" />
      <div className="-mt-[34px] flex items-end gap-[13px]">
        <Skeleton className="h-[61px] w-[61px] shrink-0 rounded-full" />
        <div className="min-w-0 flex-1 space-y-2 pb-1">
          <Skeleton className="h-4 w-3/5 rounded-prism-5" />
          <Skeleton className="h-3 w-2/5 rounded-prism-5" />
        </div>
      </div>
      <div className="mt-[13px] space-y-2">
        <Skeleton className="h-3 w-full rounded-prism-5" />
        <Skeleton className="h-3 w-4/5 rounded-prism-5" />
      </div>
      <div className="mt-[21px] flex gap-2">
        <Skeleton className="h-8 w-1/3 rounded-prism-5" />
        <Skeleton className="h-8 w-1/3 rounded-prism-5" />
      </div>
      <Skeleton className="mt-[21px] h-touch w-full rounded-prism-13" />
    </div>
  );
};

export default UserSkeleton;
