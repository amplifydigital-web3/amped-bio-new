import { Layers } from "lucide-react";
import { cn } from "@repo/ui";
import { CONTENT_COPY } from "./copy";
import { formatBytes } from "./lib/files";

export interface StorageData {
  bytesLimit: number;
  bytesUsed: number;
  bytesReserved: number;
  pageFilesBytes: number;
  byKind: Partial<Record<string, number>>;
  videoMinutesLimit: number;
  videoMinutesUsed: number;
}

// Segment colors: Prism utility and brand inks, each at or above 3:1 on the
// track, and every segment is named in the legend with its size (never color alone)
const SEGMENTS: { key: string; label: string; color: string }[] = [
  { key: "video", label: "Video", color: "bg-prism-nav" },
  { key: "audio", label: "Audio", color: "bg-[#0B5A80]" },
  { key: "image", label: "Images", color: "bg-prism-value" },
  { key: "docs", label: "Docs and files", color: "bg-prism-success" },
  { key: "page", label: CONTENT_COPY.meter.pageFiles, color: "bg-prism-ink-3" },
];

/**
 * Storage and video minutes (cs1). The bar sums library items by kind plus the
 * creator's page images (spec 3.3), so it matches what Account shows. Video
 * bytes live on Stream and count as minutes, but they still show in the bar.
 */
export function StorageMeter({ data, className }: { data: StorageData; className?: string }) {
  const parts: Record<string, number> = {
    video: data.byKind.video ?? 0,
    audio: data.byKind.audio ?? 0,
    image: data.byKind.image ?? 0,
    docs: (data.byKind.document ?? 0) + (data.byKind.file ?? 0),
    page: data.pageFilesBytes,
  };
  const used = Object.values(parts).reduce((a, b) => a + b, 0);
  const limit = Math.max(1, data.bytesLimit);
  const minutesPct = Math.min(
    100,
    (data.videoMinutesUsed / Math.max(1, data.videoMinutesLimit)) * 100
  );
  const full = data.bytesUsed + data.bytesReserved >= data.bytesLimit;

  return (
    <section
      aria-label={CONTENT_COPY.meter.storage}
      className={cn(
        "prism-glass-clear flex flex-col gap-[21px] !rounded-prism-21 p-[21px] font-prism md:flex-row md:items-center",
        className
      )}
    >
      <span
        aria-hidden
        className="hidden h-[55px] w-[55px] shrink-0 items-center justify-center rounded-full bg-white/80 md:flex"
      >
        <Layers className="h-[21px] w-[21px] text-prism-create-ink" />
      </span>

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-prism-label font-bold text-prism-ink">
            {CONTENT_COPY.meter.storage}
          </h2>
          <span className="text-prism-meta text-prism-ink-2">
            {CONTENT_COPY.meter.used(formatBytes(used), formatBytes(data.bytesLimit))}
          </span>
        </div>
        <div
          role="meter"
          aria-label={CONTENT_COPY.meter.storage}
          aria-valuemin={0}
          aria-valuemax={data.bytesLimit}
          aria-valuenow={Math.min(used, data.bytesLimit)}
          aria-valuetext={CONTENT_COPY.meter.used(formatBytes(used), formatBytes(data.bytesLimit))}
          className="mt-2 flex h-[8px] w-full overflow-hidden rounded-full bg-[rgba(22,21,43,0.10)]"
        >
          {SEGMENTS.map(segment =>
            parts[segment.key]! > 0 ? (
              <span
                key={segment.key}
                className={cn("h-full", segment.color)}
                style={{ width: `${Math.min(100, (parts[segment.key]! / limit) * 100)}%` }}
              />
            ) : null
          )}
        </div>
        <ul className="mt-2 flex flex-wrap gap-x-[21px] gap-y-1 text-prism-meta text-prism-ink-2">
          {SEGMENTS.filter(s => parts[s.key]! > 0).map(segment => (
            <li key={segment.key} className="flex items-center gap-1.5">
              <span aria-hidden className={cn("h-[8px] w-[8px] rounded-[2px]", segment.color)} />
              {segment.label} {formatBytes(parts[segment.key]!)}
            </li>
          ))}
        </ul>
        {full && (
          <p className="mt-2 text-prism-meta font-semibold text-prism-danger">
            {CONTENT_COPY.meter.full}
          </p>
        )}
      </div>

      <div className="min-w-0 md:w-[30%] md:border-l md:border-prism-line md:pl-[21px]">
        <h2 className="text-prism-label font-bold text-prism-ink">{CONTENT_COPY.meter.minutes}</h2>
        <div
          role="meter"
          aria-label={CONTENT_COPY.meter.minutes}
          aria-valuemin={0}
          aria-valuemax={data.videoMinutesLimit}
          aria-valuenow={Math.min(data.videoMinutesUsed, data.videoMinutesLimit)}
          className="mt-2 h-[8px] w-full overflow-hidden rounded-full bg-[rgba(22,21,43,0.10)]"
        >
          <span className="block h-full bg-prism-nav" style={{ width: `${minutesPct}%` }} />
        </div>
        <p className="mt-2 text-prism-meta text-prism-ink-2">
          {CONTENT_COPY.meter.minutesUsed(data.videoMinutesUsed, data.videoMinutesLimit)}
        </p>
      </div>
    </section>
  );
}
