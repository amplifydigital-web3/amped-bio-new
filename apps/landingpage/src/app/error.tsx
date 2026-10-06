"use client";

import { usePathname } from "next/navigation";
import { DestinationErrorCard } from "@/components/DestinationErrorCard";
import { PublicPage } from "@/components/layout/PublicPage";

const FIRST_CAUSE = "Something went wrong on our side. Try again.";
const REPEAT_CAUSE = "This keeps failing. Try again later.";

// Try again counts survive the boundary remounting after a failed retry. They
// are kept per path, so another page starts over.
const retries = { path: "", count: 0 };

// Screen Review 097 I02, I09: a render error on any public route keeps the
// header and footer and shows the destination error card. After a second
// failed Try again the cause line changes. error.message is never shown.
export default function PublicError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const pathname = usePathname() ?? "";
  if (retries.path !== pathname) {
    retries.path = pathname;
    retries.count = 0;
  }

  return (
    <PublicPage mainClassName="pb-[55px] pt-[89px] sm:pt-[144px]">
      <DestinationErrorCard
        cause={retries.count >= 2 ? REPEAT_CAUSE : FIRST_CAUSE}
        primaryLabel="Try again"
        onPrimary={() => {
          retries.count += 1;
          reset();
        }}
        digest={error.digest}
      />
    </PublicPage>
  );
}
