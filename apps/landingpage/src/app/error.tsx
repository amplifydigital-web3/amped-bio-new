"use client";

import { useMemo } from "react";
import { usePathname } from "next/navigation";
import { DestinationErrorCard } from "@/components/DestinationErrorCard";
import { PublicPage } from "@/components/layout/PublicPage";

const FIRST_CAUSE = "Something went wrong on our side. Try again.";
const REPEAT_CAUSE = "This keeps failing. Try again later.";

// A failed Try again remounts the boundary, so the count lives outside it.
// QA-050: it is keyed by path and error digest and expires a minute after the
// last Try again, so a new error or a later visit starts over.
const RETRY_WINDOW_MS = 60_000;
const retries = { key: "", count: 0, at: 0 };

function failedRetries(key: string) {
  if (retries.key !== key || Date.now() - retries.at > RETRY_WINDOW_MS) {
    retries.key = key;
    retries.count = 0;
    retries.at = 0;
  }
  return retries.count;
}

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
  const key = `${pathname}|${error.digest ?? error.message}`;
  const count = useMemo(() => failedRetries(key), [key]);

  return (
    <PublicPage mainClassName="pb-[55px] pt-[89px] sm:pt-[144px]">
      <DestinationErrorCard
        cause={count >= 2 ? REPEAT_CAUSE : FIRST_CAUSE}
        primaryLabel="Try again"
        onPrimary={() => {
          retries.key = key;
          retries.count = count + 1;
          retries.at = Date.now();
          reset();
        }}
        digest={error.digest}
      />
    </PublicPage>
  );
}
