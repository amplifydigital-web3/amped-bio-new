"use client";

import { useState } from "react";
import { Download, Loader2 } from "lucide-react";
import { cn } from "@repo/ui";
import { fetchDownload } from "@/lib/content";
import { SITE_CONTENT_COPY as copy } from "./copy";
import { CREATOR_FOCUS_RING } from "./theme";

/**
 * Download (decision 24): asks for a fresh single use link on tap, so no link
 * sits in the page. The link works once and expires in 2 minutes.
 */
export function DownloadButton({ publicId, className }: { publicId: string; className?: string }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const start = async () => {
    setBusy(true);
    setError(null);
    try {
      const download = await fetchDownload(publicId);
      if (!download) throw new Error(copy.downloadFailed);
      const link = document.createElement("a");
      link.href = download.url;
      link.download = download.fileName;
      link.rel = "noopener";
      document.body.appendChild(link);
      link.click();
      link.remove();
    } catch (failure) {
      setError(failure instanceof Error && failure.message ? failure.message : copy.downloadFailed);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className={className}>
      <button
        type="button"
        onClick={() => void start()}
        disabled={busy}
        className={cn(
          "inline-flex min-h-[55px] w-full items-center justify-center gap-[8px] rounded-[13px] bg-white px-[21px] text-[17px] font-semibold text-[#16152B] disabled:opacity-70",
          CREATOR_FOCUS_RING
        )}
      >
        {busy ? (
          <Loader2 className="h-5 w-5 animate-spin motion-reduce:animate-none" aria-hidden />
        ) : (
          <Download className="h-5 w-5" aria-hidden />
        )}
        {busy ? copy.downloading : copy.download}
      </button>
      <p className="mt-[8px] text-[14px] opacity-80">{copy.downloadNote}</p>
      {error && (
        <p role="alert" className="mt-[4px] text-[14px] font-semibold">
          {error}
        </p>
      )}
    </div>
  );
}
