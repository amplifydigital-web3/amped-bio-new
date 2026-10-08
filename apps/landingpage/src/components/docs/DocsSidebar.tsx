"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@repo/ui";
import { Eyebrow } from "@/components/layout/PublicPage";
import type { DocNavGroup } from "@/lib/docs";

/** 090 I05: the docs sidebar card. The current page carries the lens thumb and aria-current. */
export function DocsNavList({
  groups,
  onNavigate,
}: {
  groups: DocNavGroup[];
  onNavigate?: () => void;
}) {
  const pathname = usePathname();
  return (
    <div className="space-y-[21px]">
      {groups.map(group => (
        <div key={group.group}>
          <Eyebrow>{group.group}</Eyebrow>
          <ul className="mt-[13px] space-y-1">
            {group.pages.map(page => {
              const href = `/docs/${page.slug}`;
              const current = pathname === href;
              return (
                <li key={page.slug}>
                  <Link
                    href={href}
                    onClick={onNavigate}
                    aria-current={current ? "page" : undefined}
                    className={cn(
                      "prism-focus flex min-h-touch items-center rounded-prism-13 px-[13px] text-prism-label",
                      current
                        ? "prism-lens-thumb font-bold text-prism-nav-pressed"
                        : "font-medium text-prism-ink-2 transition-colors duration-prism-hover ease-prism hover:bg-white/45"
                    )}
                  >
                    {page.title}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </div>
  );
}

export function DocsSidebar({ groups }: { groups: DocNavGroup[] }) {
  return (
    <nav
      aria-label="Docs"
      className="prism-glass-clear sticky top-[89px] hidden w-[233px] shrink-0 self-start !rounded-prism-21 p-[21px] lg:block"
    >
      <DocsNavList groups={groups} />
    </nav>
  );
}
