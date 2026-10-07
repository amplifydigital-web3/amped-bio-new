import { useState } from "react";
import { BarChart3, Copy, ExternalLink, Share2 } from "lucide-react";
import { Button, ErrorCard, Skeleton } from "@repo/ui";
import { copyPageLink, publicPageUrl } from "@/components/shell/pageLink";
import { useShellNavigation } from "@/components/shell/ShellNavigation";
import { PUBLISH_FIRST } from "@/components/shell/pageVisibility";
import { Eyebrow } from "./TestnetCard";

// Screen Review 016 I04, I15. Where the page stands: photo, name and URL,
// View page, Copy page link, Share on touch, View analytics, and Show setup
// checklist while setup is incomplete and the checklist is hidden. While the
// page is unpublished (QA-008), View page, Copy page link and Share are
// disabled and the reason shows below them.

function displayUrl(handle: string) {
  return publicPageUrl(handle).replace(/^https?:\/\//, "");
}

export function PageStatusCard({
  handle,
  name,
  photoUrl,
  onShowChecklist,
  restoring,
  unpublished = false,
}: {
  handle: string;
  name: string;
  photoUrl?: string;
  onShowChecklist?: () => void;
  restoring?: boolean;
  unpublished?: boolean;
}) {
  const { go } = useShellNavigation();
  const [photoFailed, setPhotoFailed] = useState(false);
  const url = publicPageUrl(handle);
  const canShare = typeof navigator !== "undefined" && typeof navigator.share === "function";

  const share = async () => {
    try {
      await navigator.share({ title: name || handle, url });
    } catch (error) {
      // Closing the share sheet is not an error
      if ((error as DOMException)?.name !== "AbortError") void copyPageLink(handle);
    }
  };

  return (
    <section
      aria-labelledby="page-status-title"
      className="prism-glass-clear space-y-[21px] p-[21px]"
    >
      <Eyebrow id="page-status-title">Your page</Eyebrow>
      <div className="flex items-center gap-[13px]">
        {photoUrl && !photoFailed ? (
          <img
            src={photoUrl}
            alt=""
            onError={() => setPhotoFailed(true)}
            className="h-commit w-commit shrink-0 rounded-full object-cover"
          />
        ) : (
          <span
            aria-hidden
            className="prism-glass-clear flex h-commit w-commit shrink-0 items-center justify-center !rounded-full text-prism-panel-title font-bold text-prism-ink-2"
          >
            {(handle || "?").charAt(0).toUpperCase()}
          </span>
        )}
        <div className="min-w-0">
          <p className="truncate text-prism-panel-title font-bold text-prism-ink">
            {name || handle}
          </p>
          <p className="truncate text-prism-label font-semibold text-prism-ink-2">
            {displayUrl(handle)}
          </p>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-[13px]">
        {unpublished ? (
          <Button type="button" variant="secondary" disabled aria-describedby="page-status-reason">
            View page
            <ExternalLink aria-hidden />
          </Button>
        ) : (
          <Button asChild variant="secondary">
            <a href={url} target="_blank" rel="noopener noreferrer">
              View page
              <ExternalLink aria-hidden />
              <span className="sr-only">(opens in a new tab)</span>
            </a>
          </Button>
        )}
        <Button
          type="button"
          variant="secondary"
          size="icon"
          aria-label="Copy page link"
          aria-describedby={unpublished ? "page-status-reason" : undefined}
          disabled={unpublished}
          onClick={() => void copyPageLink(handle)}
          className="rounded-prism-13"
        >
          <Copy aria-hidden />
        </Button>
        {canShare && (
          <Button
            type="button"
            variant="secondary"
            size="icon"
            aria-label="Share page"
            aria-describedby={unpublished ? "page-status-reason" : undefined}
            disabled={unpublished}
            onClick={() => void share()}
            className="rounded-prism-13 md:hidden"
          >
            <Share2 aria-hidden />
          </Button>
        )}
        <Button type="button" variant="ghost" onClick={() => go("analytics")}>
          <BarChart3 aria-hidden />
          View analytics
        </Button>
      </div>
      {unpublished && (
        <p id="page-status-reason" className="-mt-[8px] text-prism-meta text-prism-ink-2">
          {PUBLISH_FIRST}
        </p>
      )}
      {onShowChecklist && (
        <Button
          type="button"
          variant="ghost"
          onClick={onShowChecklist}
          disabled={restoring}
          className="-ml-3 -mt-[8px]"
        >
          Show setup checklist
        </Button>
      )}
    </section>
  );
}

export function PageStatusSkeleton() {
  return (
    <div
      aria-busy
      aria-label="Loading your page"
      className="prism-glass-clear space-y-[21px] p-[21px]"
    >
      <Skeleton className="h-3 w-[89px] rounded-full" />
      <div className="flex items-center gap-[13px]">
        <Skeleton className="h-commit w-commit rounded-full" />
        <div className="flex-1 space-y-2">
          <Skeleton className="h-5 w-[144px] rounded-full" />
          <Skeleton className="h-4 w-[188px] rounded-full" />
        </div>
      </div>
      <div className="flex gap-[13px]">
        <Skeleton className="h-touch w-[132px] rounded-prism-13" />
        <Skeleton className="h-touch w-touch rounded-prism-13" />
      </div>
    </div>
  );
}

export function PageStatusError({ onRetry, retrying }: { onRetry: () => void; retrying: boolean }) {
  return (
    <ErrorCard
      title="Your page details did not load"
      cause="Check your connection and try again."
      onRetry={onRetry}
      retryLabel={retrying ? "Retrying" : "Retry"}
    />
  );
}
