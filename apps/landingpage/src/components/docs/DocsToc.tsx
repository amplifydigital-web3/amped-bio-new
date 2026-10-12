"use client";

import { useEffect, useState } from "react";
import { cn } from "@repo/ui";
import { Eyebrow } from "@/components/layout/PublicPage";
import type { DocHeading } from "@/lib/docsRender";

/** 090 I14: On this page, at 1280 and wider, for pages with three or more h2. */
export function DocsToc({ headings }: { headings: DocHeading[] }) {
  const [active, setActive] = useState<string | null>(headings[0]?.id ?? null);

  useEffect(() => {
    const targets = headings
      .map(heading => document.getElementById(heading.id))
      .filter((node): node is HTMLElement => !!node);
    if (!targets.length) return;
    const observer = new IntersectionObserver(
      entries => {
        const visible = entries.filter(entry => entry.isIntersecting);
        if (visible.length) setActive(visible[0].target.id);
      },
      { rootMargin: "-89px 0px -60% 0px" }
    );
    targets.forEach(target => observer.observe(target));
    return () => observer.disconnect();
  }, [headings]);

  if (headings.filter(heading => heading.depth === 2).length < 3) return null;

  const go = (event: React.MouseEvent<HTMLAnchorElement>, id: string) => {
    const target = document.getElementById(id);
    if (!target) return;
    event.preventDefault();
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    target.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" });
    history.replaceState(null, "", `#${id}`);
    setActive(id);
  };

  return (
    <nav
      aria-label="On this page"
      className="sticky top-[89px] hidden w-[233px] shrink-0 self-start xl:block"
    >
      <Eyebrow>On this page</Eyebrow>
      <ul className="mt-[13px]">
        {headings.map(heading => {
          const current = active === heading.id;
          return (
            <li key={heading.id}>
              <a
                href={`#${heading.id}`}
                onClick={event => go(event, heading.id)}
                aria-current={current ? "location" : undefined}
                className={cn(
                  "prism-focus flex min-h-touch items-center gap-2 rounded-prism-13 pr-[8px] text-prism-meta",
                  heading.depth === 3 ? "pl-[26px]" : "pl-[13px]",
                  current ? "font-bold text-prism-nav-pressed" : "text-prism-ink-2"
                )}
              >
                <span
                  aria-hidden
                  className={cn(
                    "h-[3px] w-[13px] shrink-0 rounded-full",
                    current ? "bg-prism-nav" : "bg-transparent"
                  )}
                />
                {heading.text}
              </a>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
