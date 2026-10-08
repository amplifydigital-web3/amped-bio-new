"use client";

import { useState } from "react";
import { usePathname } from "next/navigation";
import { ChevronDown } from "lucide-react";
import { BottomSheet, BottomSheetContent, BottomSheetTrigger } from "@repo/ui";
import { Eyebrow } from "@/components/layout/PublicPage";
import type { DocNavGroup } from "@/lib/docs";
import { DocsNavList } from "./DocsSidebar";

/** 090 I02: below 1024 the sidebar is a 55 disclosure row that opens a bottom sheet. */
export function DocsMobileMenu({ groups }: { groups: DocNavGroup[] }) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const currentTitle =
    groups.flatMap(group => group.pages).find(page => pathname === `/docs/${page.slug}`)?.title ??
    "Developers home";
  return (
    <BottomSheet open={open} onOpenChange={setOpen}>
      <BottomSheetTrigger asChild>
        <button
          type="button"
          aria-expanded={open}
          className="prism-glass-clear prism-focus flex h-commit w-full items-center justify-between !rounded-prism-21 px-[21px] text-left lg:hidden"
        >
          <span className="min-w-0">
            <Eyebrow>Docs</Eyebrow>
            <span className="block truncate text-prism-label font-semibold text-prism-ink">
              {currentTitle}
            </span>
          </span>
          <ChevronDown aria-hidden className="h-[21px] w-[21px] shrink-0 text-prism-ink-2" />
        </button>
      </BottomSheetTrigger>
      <BottomSheetContent title="Docs">
        <DocsNavList groups={groups} onNavigate={() => setOpen(false)} />
      </BottomSheetContent>
    </BottomSheet>
  );
}
