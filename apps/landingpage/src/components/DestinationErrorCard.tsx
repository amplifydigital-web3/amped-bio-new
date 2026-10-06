"use client";

import { useEffect, useRef, useState } from "react";
import { AlertCircle, Check, Copy } from "lucide-react";

// Screen Review 097 I02, I03, I09 (row 083 destination error card): G1 clear
// r21, 508 wide, 21 danger icon, title 20/23, one line cause, a primary 55,
// a way home, and the Error ID with a 44 copy button when Next gives a digest.
// No @repo/ui import: global-error renders this when the providers failed.
export function DestinationErrorCard({
  cause,
  primaryLabel,
  onPrimary,
  digest,
  plainHomeLink = false,
}: {
  cause: string;
  primaryLabel: string;
  onPrimary: () => void;
  digest?: string;
  // Global error: a plain underlined link instead of the ghost lens
  plainHomeLink?: boolean;
}) {
  const titleRef = useRef<HTMLHeadingElement>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    titleRef.current?.focus({ preventScroll: true });
  }, []);

  const copyDigest = async () => {
    if (!digest) return;
    try {
      await navigator.clipboard.writeText(digest);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  };

  return (
    <section
      role="alert"
      className="prism-glass-clear mx-auto w-full max-w-[508px] p-[21px] font-prism text-prism-ink sm:p-[34px]"
    >
      <AlertCircle className="h-[34px] w-[34px] text-prism-danger" strokeWidth={1.75} aria-hidden />
      <h1
        ref={titleRef}
        tabIndex={-1}
        className="mt-[13px] text-prism-panel-title text-prism-ink outline-none"
      >
        This page did not load
      </h1>
      <p className="mt-2 text-prism-body text-prism-ink-2">{cause}</p>
      <div className="mt-[21px] flex flex-col gap-[13px] sm:flex-row sm:items-center sm:gap-[21px]">
        <button
          type="button"
          onClick={onPrimary}
          className="prism-btn-primary prism-focus inline-flex h-commit flex-1 items-center justify-center rounded-prism-13 px-8 text-prism-label font-bold transition-colors duration-prism-hover ease-prism"
        >
          {primaryLabel}
        </button>
        {plainHomeLink ? (
          <a
            href="/"
            className="prism-focus inline-flex h-touch items-center justify-center rounded-prism-8 px-1 text-prism-label font-semibold text-prism-ink underline underline-offset-2"
          >
            Go to Amped.Bio
          </a>
        ) : (
          <a
            href="/"
            className="prism-btn-ghost prism-focus inline-flex h-touch items-center justify-center rounded-prism-13 px-5 text-prism-label font-semibold"
          >
            Go to Amped.Bio
          </a>
        )}
      </div>
      {digest && (
        <div className="mt-[21px] flex items-center justify-between gap-3 border-t border-prism-line pt-[8px]">
          <p className="text-prism-meta tabular-nums text-prism-ink-2">Error ID {digest}</p>
          <button
            type="button"
            onClick={() => void copyDigest()}
            className="prism-icon-btn prism-focus shrink-0"
            aria-label={copied ? "Error ID copied" : "Copy error ID"}
          >
            {copied ? (
              <Check className="h-5 w-5 text-prism-success" aria-hidden />
            ) : (
              <Copy className="h-5 w-5" aria-hidden />
            )}
          </button>
          <span className="sr-only" aria-live="polite">
            {copied ? "Error ID copied" : ""}
          </span>
        </div>
      )}
    </section>
  );
}
