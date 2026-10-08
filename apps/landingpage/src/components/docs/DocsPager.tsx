import Link from "next/link";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { cn } from "@repo/ui";
import { Eyebrow } from "@/components/layout/PublicPage";
import type { DocPage } from "@/lib/docs";

function PagerCard({ page, direction }: { page: DocPage; direction: "previous" | "next" }) {
  const Icon = direction === "previous" ? ArrowLeft : ArrowRight;
  return (
    <Link
      href={`/docs/${page.slug}`}
      className={cn(
        "prism-glass-clear prism-focus flex min-h-[89px] flex-1 items-center gap-[13px] !rounded-prism-21 p-[21px] transition-colors duration-prism-hover ease-prism hover:bg-white/70",
        direction === "next" && "flex-row-reverse text-right"
      )}
    >
      <Icon aria-hidden className="h-[21px] w-[21px] shrink-0 text-prism-nav" />
      <span className="min-w-0 flex-1">
        <Eyebrow className={direction === "next" ? "justify-end" : undefined}>
          {direction === "previous" ? "Previous" : "Next"}
        </Eyebrow>
        <span className="mt-1 block text-prism-label font-semibold text-prism-ink">
          {page.title}
        </span>
      </span>
    </Link>
  );
}

/** 090 I16: previous and next, in sidebar order, 34 below the article card. */
export function DocsPager({ previous, next }: { previous: DocPage | null; next: DocPage | null }) {
  if (!previous && !next) return null;
  return (
    <nav aria-label="Docs pages" className="mt-[34px] flex flex-col gap-[13px] sm:flex-row">
      {previous ? (
        <PagerCard page={previous} direction="previous" />
      ) : (
        <span className="hidden flex-1 sm:block" />
      )}
      {next ? (
        <PagerCard page={next} direction="next" />
      ) : (
        <span className="hidden flex-1 sm:block" />
      )}
    </nav>
  );
}
