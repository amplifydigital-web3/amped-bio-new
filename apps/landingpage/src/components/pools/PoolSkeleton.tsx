// Medium card skeleton (Screen Review 070 I09): 110 art bar and two text bars
// in line color, static (no shimmer).
const PoolSkeleton = () => (
  <div aria-hidden className="prism-glass-clear flex flex-col gap-2 p-2">
    <span className="block h-[110px] rounded-prism-13 bg-prism-line" />
    <span className="block space-y-2 px-2 pb-2 pt-1">
      <span className="block h-4 w-3/4 rounded-full bg-prism-line" />
      <span className="block h-3 w-1/2 rounded-full bg-prism-line" />
    </span>
  </div>
);

export default PoolSkeleton;
