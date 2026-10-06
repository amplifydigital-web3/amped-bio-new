// Loading card in the shape of the people card (042 I08): G1 clear, a 55 disc
// and two text bars in line color. No pulse under reduced motion.
const UserSkeleton = () => (
  <div aria-hidden className="prism-glass-clear flex min-h-[189px] flex-col gap-[13px] p-[21px]">
    <div className="flex items-start gap-[13px]">
      <div className="h-[55px] w-[55px] shrink-0 rounded-full bg-prism-line motion-safe:animate-pulse" />
      <div className="flex-1 space-y-2 pt-2">
        <div className="h-4 w-2/3 rounded-full bg-prism-line motion-safe:animate-pulse" />
        <div className="h-3 w-1/3 rounded-full bg-prism-line motion-safe:animate-pulse" />
      </div>
    </div>
    <div className="h-3 w-full rounded-full bg-prism-line motion-safe:animate-pulse" />
  </div>
);

export default UserSkeleton;
