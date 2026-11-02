/**
 * One status per library item (cs1): the creator sees what the item needs
 * next, never internal state names. In PR 5 every item is Public or a Draft;
 * rule names (Followers, Members, Paid) arrive with gated content in PR 8.
 */
import { CONTENT_COPY } from "../copy";
import { format } from "date-fns";

export interface ItemStatusInput {
  status: "uploading" | "processing" | "ready" | "failed" | "blocked" | "deleted";
  publishState: "draft" | "published" | "archived";
  moderationState: "pending" | "clear" | "held" | "blocked";
  processingStep: string | null;
  failureReason: string | null;
}

export type StatusTone = "public" | "draft" | "progress" | "review" | "danger";

export interface ItemStatus {
  key:
    | "uploading"
    | "processing"
    | "review"
    | "failed"
    | "blocked"
    | "draft"
    | "public"
    | "removed";
  label: string;
  tone: StatusTone;
  /** The line under the title on the card */
  line: string;
}

const UNREADABLE = CONTENT_COPY.errors.typeMismatch;

// Processor and API reasons (spec 3.5, PR 4) to one plain line each
const FAILURE_LINES: Record<string, string> = {
  size_mismatch: CONTENT_COPY.errors.sizeMismatch,
  type_mismatch: CONTENT_COPY.errors.typeMismatch,
  upload_expired: CONTENT_COPY.errors.expired,
  queue_unavailable: "Processing could not start. Remove it and upload the file again.",
  source_missing: CONTENT_COPY.errors.expired,
  pdf_encrypted: "This PDF has a password. Remove it, then upload it again.",
  archive_encrypted: "This ZIP has a password. Make one without a password and upload it.",
  archive_ratio: "This ZIP expands too far to check. Make a smaller ZIP and upload it.",
  archive_too_large: "This ZIP holds too much to check. Split it into smaller ZIPs.",
  archive_corrupt: "This ZIP could not be opened. Make it again and upload it.",
  epub_entry_too_large: "This EPUB holds a file too large to check. Export it again.",
  image_too_large: "This image is too large to process. Export a smaller one.",
  audio_too_long: "This audio is longer than we can process. Upload a shorter file.",
  document_unsupported: "This document type is not supported. Use PDF or EPUB.",
  scan_limits: "This file is too complex to scan. Export it again and upload.",
  pdf_unreadable: UNREADABLE,
  epub_unreadable: UNREADABLE,
  image_unreadable: UNREADABLE,
  audio_unreadable: UNREADABLE,
};

/** The line for a failed item, from its failureReason. */
export function failureLine(reason: string | null): string {
  if (!reason) return CONTENT_COPY.errors.processing;
  if (reason.startsWith("stream:")) return CONTENT_COPY.errors.video;
  return FAILURE_LINES[reason] ?? CONTENT_COPY.errors.processing;
}

export function itemStatus(
  item: ItemStatusInput & { restorableUntil?: string | Date | null }
): ItemStatus {
  const c = CONTENT_COPY.card;
  // Recently removed (PR 6): restorable until the purge date
  if (item.status === "deleted") {
    const until = item.restorableUntil ? format(new Date(item.restorableUntil), "MMM d") : "";
    return {
      key: "removed",
      label: c.removedLabel,
      tone: "draft",
      line: until ? c.removedLine(until) : "",
    };
  }
  if (item.status === "blocked" || item.moderationState === "blocked") {
    return { key: "blocked", label: c.blocked, tone: "danger", line: c.blockedLine };
  }
  if (item.status === "failed") {
    return {
      key: "failed",
      label: c.failed,
      tone: "danger",
      line: failureLine(item.failureReason),
    };
  }
  if (item.status === "uploading") {
    return { key: "uploading", label: c.uploading, tone: "progress", line: c.uploadingLine };
  }
  if (item.status === "processing") {
    return {
      key: "processing",
      label: c.processing,
      tone: "progress",
      line: c.processingLine(item.processingStep),
    };
  }
  if (item.moderationState === "held") {
    return { key: "review", label: c.review, tone: "review", line: c.reviewLine };
  }
  if (item.publishState === "published") {
    return { key: "public", label: c.public, tone: "public", line: "" };
  }
  return { key: "draft", label: c.draft, tone: "draft", line: c.notPublished };
}

/** Items the library keeps polling, because the server is still working on them. */
export function isSettling(item: Pick<ItemStatusInput, "status">): boolean {
  return item.status === "processing";
}
