"use client";

import { Skeleton } from "@repo/ui";
import { PublicPage } from "@/components/layout/PublicPage";

// Screen Review 072 I16: the index skeleton (hero, featured card, three grid
// cards) on the line token, shown only after 400ms, static under reduced motion.
export default function BlogLoading() {
  return (
    <PublicPage>
      <div
        aria-busy
        aria-label="Loading posts"
        className="mx-auto w-full max-w-[1173px] pt-[34px] sm:pt-[21px]"
      >
        <Skeleton delayMs={400} className="h-[55px] w-[233px] sm:h-[100px]" />
        <Skeleton delayMs={400} className="mt-[21px] h-[16px] w-[320px] max-w-full" />
        <Skeleton delayMs={400} className="mt-[34px] h-[319px] w-full !rounded-prism-21" />
        <div className="mt-[21px] grid gap-[21px] sm:grid-cols-2 lg:grid-cols-3">
          {[0, 1, 2].map(index => (
            <Skeleton key={index} delayMs={400} className="h-[377px] w-full !rounded-prism-21" />
          ))}
        </div>
      </div>
    </PublicPage>
  );
}
