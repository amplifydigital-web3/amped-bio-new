"use client";

import { Skeleton } from "@repo/ui";
import { ARTICLE_CARD_CLASS } from "@/components/article/articleStyles";
import { PublicPage } from "@/components/layout/PublicPage";

// Screen Review 072 I16: the post skeleton (All posts, meta, title, cover and
// the article card) after 400ms, static under reduced motion.
export default function BlogPostLoading() {
  return (
    <PublicPage>
      <div aria-busy aria-label="Loading post">
        <div className="mx-auto w-full max-w-[610px] pt-[21px]">
          <Skeleton delayMs={400} className="h-touch w-[144px]" />
          <Skeleton delayMs={400} className="mt-[34px] h-[16px] w-[144px]" />
          <Skeleton delayMs={400} className="mt-[13px] h-[34px] w-full sm:h-[55px]" />
          <Skeleton delayMs={400} className="mt-[34px] aspect-[1.91/1] w-full" />
        </div>
        <div className={`mt-[21px] space-y-[21px] ${ARTICLE_CARD_CLASS}`}>
          {[100, 92, 96, 70].map(width => (
            <Skeleton
              key={width}
              delayMs={400}
              className="h-[16px]"
              style={{ width: `${width}%` }}
            />
          ))}
        </div>
      </div>
    </PublicPage>
  );
}
