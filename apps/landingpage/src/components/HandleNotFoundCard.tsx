"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { AtSign } from "lucide-react";
import { Button } from "@repo/ui";
import { normalizeHandle } from "@/lib/handle";

// Screen Review 039 I04: the shared G1 clear card, 508 wide. The handle comes
// from the address because not-found pages do not receive route params.
export function HandleNotFoundCard() {
  const pathname = usePathname() ?? "";
  const handle = normalizeHandle(decodeURIComponent(pathname.split("/")[1] ?? ""));
  return (
    <section className="prism-glass-clear flex w-full max-w-[508px] flex-col items-center !rounded-prism-21 p-[34px] text-center">
      <span className="prism-disc" aria-hidden>
        <AtSign className="h-[34px] w-[34px] text-prism-ink-3" strokeWidth={1.5} />
      </span>
      <h1 className="mt-[13px] break-all text-prism-panel-title text-prism-ink">
        {handle ? `No page at @${handle}` : "No page here"}
      </h1>
      {/* QA-044: the card never says whether the name is free or taken. A
          name can belong to an account with no published page. */}
      <p className="mt-2 text-prism-body text-prism-ink-2">
        {handle
          ? "Want this name? Check if it is free when you sign up."
          : "Check if a name is free when you sign up."}
      </p>
      <Button asChild size="lg" className="mt-[21px] w-full">
        <Link href={handle ? `/register?handle=${encodeURIComponent(handle)}` : "/register"}>
          Check and claim
        </Link>
      </Button>
      <Button asChild variant="ghost" className="mt-2">
        <Link href="/">Go to Amped.Bio</Link>
      </Button>
    </section>
  );
}
