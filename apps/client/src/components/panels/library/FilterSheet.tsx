/**
 * The Filter sheet (Build Board #26, FL-3, spec 2.2 item 2, board m1). Type and
 * How you have it, and Where: On this device, the downloads here (FL-5). The
 * sheet stays Prism (spec 3.2). The filter lives in the URL, so Back keeps it.
 */
import { useEffect, useState } from "react";
import { X } from "lucide-react";
import type { ContentUploadKind, LibraryAccessSource } from "@repo/constants";
import { BottomSheet, BottomSheetContent, Button, Chip } from "@repo/ui";
import { LIBRARY_COPY } from "./copy";

const F = LIBRARY_COPY.filterSheet;

export const FILTER_TYPES = ["video", "audio", "document", "image", "file"] as const;
export const FILTER_SOURCES = ["member", "purchased", "pool", "public"] as const;
export type FilterType = (typeof FILTER_TYPES)[number] & ContentUploadKind;
export type FilterSource = (typeof FILTER_SOURCES)[number] & LibraryAccessSource;

export interface LibraryFilter {
  type: FilterType | null;
  source: FilterSource | null;
  /** FL-5: only the items downloaded to this device */
  where: "device" | null;
}

export function readFilter(params: URLSearchParams): LibraryFilter {
  const type = params.get("type");
  const source = params.get("source");
  return {
    type: (FILTER_TYPES as readonly string[]).includes(type ?? "") ? (type as FilterType) : null,
    source: (FILTER_SOURCES as readonly string[]).includes(source ?? "")
      ? (source as FilterSource)
      : null,
    where: params.get("where") === "device" ? "device" : null,
  };
}

export function writeFilter(params: URLSearchParams, filter: LibraryFilter) {
  const next = new URLSearchParams(params);
  if (filter.type) next.set("type", filter.type);
  else next.delete("type");
  if (filter.source) next.set("source", filter.source);
  else next.delete("source");
  if (filter.where) next.set("where", filter.where);
  else next.delete("where");
  return next;
}

export function filterLabel(filter: LibraryFilter) {
  return [
    filter.type && F.types[filter.type],
    filter.source && F.sources[filter.source],
    filter.where && F.wheres[filter.where],
  ]
    .filter(Boolean)
    .join(", ");
}

/** The active filter as one removable chip (spec 2.2 item 2). */
export function ActiveFilterChip({
  filter,
  onClear,
}: {
  filter: LibraryFilter;
  onClear: () => void;
}) {
  const label = filterLabel(filter);
  if (!label) return null;
  return (
    <Chip onClick={onClear} aria-label={F.remove(label)} aria-pressed={undefined}>
      {label}
      <X aria-hidden className="h-4 w-4" />
    </Chip>
  );
}

export function FilterSheet({
  open,
  onOpenChange,
  value,
  onApply,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  value: LibraryFilter;
  onApply: (filter: LibraryFilter) => void;
}) {
  const [draft, setDraft] = useState(value);
  useEffect(() => {
    if (open) setDraft(value);
  }, [open, value]);

  return (
    <BottomSheet open={open} onOpenChange={onOpenChange}>
      <BottomSheetContent title={F.title}>
        <div className="space-y-[21px] px-[21px] pb-[21px]">
          <fieldset>
            <legend className="mb-2 text-[13px] font-semibold uppercase tracking-[0.08em] text-prism-ink-2">
              {F.type}
            </legend>
            <div className="flex flex-wrap gap-2">
              {FILTER_TYPES.map(type => (
                <Chip
                  key={type}
                  selected={draft.type === type}
                  onClick={() => setDraft(d => ({ ...d, type: d.type === type ? null : type }))}
                >
                  {F.types[type]}
                </Chip>
              ))}
            </div>
          </fieldset>
          <fieldset>
            <legend className="mb-2 text-[13px] font-semibold uppercase tracking-[0.08em] text-prism-ink-2">
              {F.how}
            </legend>
            <div className="flex flex-wrap gap-2">
              {FILTER_SOURCES.map(source => (
                <Chip
                  key={source}
                  selected={draft.source === source}
                  onClick={() =>
                    setDraft(d => ({ ...d, source: d.source === source ? null : source }))
                  }
                >
                  {F.sources[source]}
                </Chip>
              ))}
            </div>
          </fieldset>
          <fieldset>
            <legend className="mb-2 text-[13px] font-semibold uppercase tracking-[0.08em] text-prism-ink-2">
              {F.where}
            </legend>
            <div className="flex flex-wrap gap-2">
              <Chip
                selected={draft.where === "device"}
                onClick={() =>
                  setDraft(d => ({ ...d, where: d.where === "device" ? null : "device" }))
                }
              >
                {F.wheres.device}
              </Chip>
            </div>
          </fieldset>
          <div className="flex flex-col gap-2 sm:flex-row-reverse">
            <Button
              size="lg"
              className="w-full sm:w-auto"
              onClick={() => {
                onApply(draft);
                onOpenChange(false);
              }}
            >
              {F.apply}
            </Button>
            <Button
              variant="ghost"
              className="w-full sm:w-auto"
              disabled={!draft.type && !draft.source && !draft.where}
              onClick={() => setDraft({ type: null, source: null, where: null })}
            >
              {F.clear}
            </Button>
          </div>
        </div>
      </BottomSheetContent>
    </BottomSheet>
  );
}
