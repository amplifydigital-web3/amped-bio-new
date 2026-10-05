import * as React from "react";
import { cn } from "./utils";

interface SkeletonProps extends React.HTMLAttributes<HTMLDivElement> {
  // Wait this long before showing (Prism: skeletons appear only after 400ms)
  delayMs?: number;
}

// Prism loading placeholder: line fill, radius set by the caller to match the
// final element, no shimmer under reduced motion.
function Skeleton({ className, delayMs = 0, ...props }: SkeletonProps) {
  const [visible, setVisible] = React.useState(delayMs === 0);

  React.useEffect(() => {
    if (delayMs === 0) return;
    const timer = setTimeout(() => setVisible(true), delayMs);
    return () => clearTimeout(timer);
  }, [delayMs]);

  return (
    <div
      aria-hidden
      className={cn(
        "rounded-prism-13 bg-prism-line animate-pulse motion-reduce:animate-none",
        !visible && "invisible",
        className
      )}
      {...props}
    />
  );
}

export { Skeleton };
