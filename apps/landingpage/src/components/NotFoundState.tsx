"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import { Button } from "@repo/ui";
import { DISPLAY_TITLE_CLASS, Eyebrow } from "@/components/layout/PublicPage";

export interface NotFoundLink {
  label: string;
  href: string;
}

// Screen Review 097 I01, I05, I10, I11: one not found hero for the whole public
// site (site, blog post, pool, docs). It sits on the bare room with no card:
// eyebrow with the nav marker, the Bebas title as the page's only h1, one line
// of cause, a primary next step 55, then secondary lenses 44. Each route only
// supplies its copy and links. Focus moves to the title on arrival (I07).
export function NotFoundState({
  eyebrow,
  title,
  body,
  primary,
  secondary = [],
}: {
  eyebrow: string;
  title: string;
  body: string;
  primary: NotFoundLink;
  secondary?: NotFoundLink[];
}) {
  const titleRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    titleRef.current?.focus({ preventScroll: true });
  }, []);

  return (
    <section className="mx-auto flex w-full max-w-[856px] flex-col items-center pb-[55px] pt-[89px] text-center sm:pt-[144px]">
      <Eyebrow>{eyebrow}</Eyebrow>
      <h1
        ref={titleRef}
        tabIndex={-1}
        className={`mt-[13px] break-words uppercase outline-none ${DISPLAY_TITLE_CLASS}`}
      >
        {title}
      </h1>
      <p className="mt-[21px] max-w-[508px] text-prism-body text-prism-ink-2">{body}</p>
      <div className="mt-[34px] flex w-full flex-col items-center gap-[13px]">
        <Button asChild size="lg" className="w-full sm:w-auto sm:min-w-[233px]">
          <Link href={primary.href}>{primary.label}</Link>
        </Button>
        {secondary.length > 0 && (
          <div className="flex w-full flex-col gap-[13px] sm:w-auto sm:flex-row sm:gap-2">
            {secondary.map(link => (
              <Button key={link.href} asChild variant="secondary" className="w-full sm:w-auto">
                <Link href={link.href}>{link.label}</Link>
              </Button>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
