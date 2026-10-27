"use client";

import { useEffect, useState } from "react";
import { AlertCircle, CircleCheck, LoaderCircle } from "lucide-react";
import { Button, cn } from "@repo/ui";
import { HANDLE_MIN_LENGTH } from "@repo/constants";
import type { URLStatus } from "@/hooks/useHandleAvailability";

// One status line under a handle well, in words with a 21 icon, announced
// politely (Screen Review 008 I05). Checking shows only after 400ms.
export function HandleStatusLine({
  id,
  status,
  handle,
  onRetry,
  onBareRoom = false,
}: {
  id: string;
  status: URLStatus;
  handle: string;
  onRetry: () => void;
  // On the bare room the Available line uses ink text with the success icon
  onBareRoom?: boolean;
}) {
  const [showChecking, setShowChecking] = useState(false);
  useEffect(() => {
    if (status !== "Checking") return setShowChecking(false);
    const timer = setTimeout(() => setShowChecking(true), 400);
    return () => clearTimeout(timer);
  }, [status]);

  const url = `amped.bio/${handle}`;
  let content: React.ReactNode = null;
  if (status === "Checking" && showChecking) {
    content = (
      <>
        <LoaderCircle
          className="h-[21px] w-[21px] shrink-0 animate-spin text-prism-nav motion-reduce:animate-none"
          aria-hidden
        />
        <span className="text-prism-ink-2">Checking {url}</span>
      </>
    );
  } else if (status === "Available") {
    content = (
      <>
        <CircleCheck className="h-[21px] w-[21px] shrink-0 text-prism-success" aria-hidden />
        <span className={onBareRoom ? "text-prism-ink" : "text-prism-success"}>
          {url} is available
        </span>
      </>
    );
  } else if (status === "Unavailable") {
    content = (
      <>
        <AlertCircle className="h-[21px] w-[21px] shrink-0 text-prism-danger" aria-hidden />
        <span className="text-prism-danger">{url} is taken. Pick another.</span>
      </>
    );
  } else if (status === "TooShort") {
    content = (
      <>
        <AlertCircle className="h-[21px] w-[21px] shrink-0 text-prism-danger" aria-hidden />
        <span className="text-prism-danger">Use at least {HANDLE_MIN_LENGTH} characters</span>
      </>
    );
  } else if (status === "Invalid") {
    content = (
      <>
        <AlertCircle className="h-[21px] w-[21px] shrink-0 text-prism-danger" aria-hidden />
        <span className="text-prism-danger">
          Use lowercase letters, numbers, hyphens or underscores
        </span>
      </>
    );
  } else if (status === "Error") {
    content = (
      <>
        <AlertCircle className="h-[21px] w-[21px] shrink-0 text-prism-danger" aria-hidden />
        <span className="text-prism-danger">This URL check did not finish.</span>
        <Button variant="ghost" size="sm" className="-my-3" onClick={onRetry}>
          Retry
        </Button>
      </>
    );
  }

  return (
    <p
      id={id}
      aria-live="polite"
      className={cn("flex min-h-[21px] flex-wrap items-center gap-1.5 font-prism text-prism-meta")}
    >
      {content}
    </p>
  );
}
