import { useEffect, useState } from "react";
import { cn } from "@repo/ui";

/** 093 I09: skeletons show only after 400ms, so fast loads never flash. */
export function useShowAfter(active: boolean, delayMs = 400) {
  const [shown, setShown] = useState(false);
  useEffect(() => {
    if (!active) {
      setShown(false);
      return;
    }
    const timer = setTimeout(() => setShown(true), delayMs);
    return () => clearTimeout(timer);
  }, [active, delayMs]);
  return shown;
}

/** Line fill rgba(22,21,43,0.10), static under reduced motion. */
export function SkeletonBlock({ className }: { className?: string }) {
  return (
    <div
      aria-hidden
      className={cn(
        "rounded-prism-21 bg-[rgba(22,21,43,0.10)] motion-safe:animate-pulse",
        className
      )}
    />
  );
}

/** Rows 55 for lists and breakdowns, shown after 400ms. */
export function SkeletonRows({ count = 5, active }: { count?: number; active: boolean }) {
  const shown = useShowAfter(active);
  if (!shown) return <div aria-busy className="min-h-[110px]" />;
  return (
    <div aria-busy className="space-y-2">
      {Array.from({ length: count }).map((_, index) => (
        <SkeletonBlock key={index} className="h-commit !rounded-prism-13" />
      ))}
    </div>
  );
}
