/** Labels shared by the library cards, the editor and the upload rows. */
import { differenceInCalendarDays, format, formatDistanceToNowStrict } from "date-fns";
import {
  Archive,
  FileText,
  Headphones,
  Image as ImageIcon,
  Radio,
  Video,
  type LucideIcon,
} from "lucide-react";
import { CONTENT_COPY } from "../copy";
import { formatBytes, formatDuration } from "./files";

export const EYEBROW_NAV =
  "flex items-center gap-2 text-prism-eyebrow uppercase text-prism-ink-2 before:h-[3px] before:w-[13px] before:rounded-full before:bg-prism-nav before:content-['']";

export const KIND_ICONS: Record<string, LucideIcon> = {
  video: Video,
  audio: Headphones,
  image: ImageIcon,
  document: FileText,
  file: Archive,
  live: Radio,
};

/** The kind label on a tile: "12:40", "PDF, 18 pages", "ZIP, 48 MB", "Image". */
export function kindBadge(item: {
  kind: string;
  durationMs: number | null;
  pageCount: number | null;
  totalBytes: number;
}): string {
  const duration = formatDuration(item.durationMs);
  if ((item.kind === "video" || item.kind === "audio") && duration) return duration;
  if (item.kind === "document") {
    return item.pageCount ? `PDF, ${item.pageCount} pages` : CONTENT_COPY.kinds.document!;
  }
  if (item.kind === "file") return `ZIP, ${formatBytes(item.totalBytes)}`;
  return CONTENT_COPY.kinds[item.kind] ?? item.kind;
}

/** "2 days ago" inside a week, then "Sep 24" (cs1). */
export function shortDate(value: string | Date, now = new Date()): string {
  const date = new Date(value);
  if (differenceInCalendarDays(now, date) < 7) {
    return formatDistanceToNowStrict(date, { addSuffix: true });
  }
  return format(date, "MMM d");
}
