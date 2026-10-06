// Loading card in the shape of the Prism medium pool card (QA-028): G1 clear,
// 110 art and two text bars in line color. No pulse under reduced motion.
const PoolSkeleton = () => (
  <div aria-hidden className="prism-glass-clear flex flex-col gap-2 p-2">
    <div className="h-[110px] w-full rounded-prism-13 bg-prism-line motion-safe:animate-pulse" />
    <div className="space-y-2 px-2 pb-2">
      <div className="h-4 w-3/4 rounded-full bg-prism-line motion-safe:animate-pulse" />
      <div className="h-3 w-1/2 rounded-full bg-prism-line motion-safe:animate-pulse" />
    </div>
  </div>
);

export default PoolSkeleton;
