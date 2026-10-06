import { Skeleton } from "@repo/ui";

// Screen Review 042 I08. One card skeleton at the person card's size: G1 clear
// 306 x 189 r21 with a 55 disc and two text bars on line fill, where the
// avatar, name and @handle land. Skeleton has no pulse under reduced motion.
const UserSkeleton = () => (
  <div aria-hidden className="prism-glass-clear h-[189px] p-[21px]">
    <div className="flex items-center gap-[13px]">
      <Skeleton className="h-[55px] w-[55px] shrink-0 rounded-full" />
      <div className="min-w-0 flex-1 space-y-2">
        <Skeleton className="h-4 w-3/5 rounded-prism-5" />
        <Skeleton className="h-3 w-2/5 rounded-prism-5" />
      </div>
    </div>
  </div>
);

export default UserSkeleton;
