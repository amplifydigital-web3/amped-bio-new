import { useMemo, useState } from "react";
import { useNavigate } from "react-router";
import { useQuery } from "@tanstack/react-query";
import { ArrowDown, ArrowUp, Check, Plus, X } from "lucide-react";
import {
  CONTENT_BLOCK_ITEMS_MAX,
  CONTENT_BLOCK_LABEL_MAX,
  DEFAULT_CONTENT_BLOCK_CONFIG,
  type ContentBlock,
  type ContentBlockLayout,
} from "@repo/constants";
import { Button, ChipGroup, Notice, cn, trpc } from "@repo/ui";
import { wellClass } from "./linkValue";
import type { ConfigChange } from "./BlockFields";

// Content block fields (Build Board #20, spec 3.7, board cs4). Label, layout
// and up to 12 items from the library, in order. Drafts can be chosen; they
// show on the page once published. Every change goes to the editor state at
// once (the preview updates) and autosaves (D11).

const LAYOUTS: { value: ContentBlockLayout; label: string }[] = [
  { value: "featured", label: "Featured" },
  { value: "grid", label: "Grid" },
  { value: "list", label: "List" },
];

type LibraryRow = {
  publicId: string;
  title: string;
  kind: string;
  status: string;
  publishState: string;
  moderationState: string;
  adult: boolean;
};

const KIND_LABEL: Record<string, string> = {
  video: "Video",
  audio: "Audio",
  image: "Image",
  document: "Document",
  file: "ZIP",
};

/** Why an item will not show yet, or null when it shows. */
export function hiddenReason(row: LibraryRow): string | null {
  if (row.status !== "ready") return "Processing";
  if (row.moderationState !== "clear") return "In review";
  if (row.adult) return "18+, shows later";
  if (row.publishState !== "published") return "Draft, publish to show";
  return null;
}

function Eyebrow({ children }: { children: React.ReactNode }) {
  return (
    <p className="flex items-center gap-2 text-prism-eyebrow uppercase text-prism-ink-2">
      <span aria-hidden className="h-[3px] w-[13px] rounded-full bg-prism-nav" />
      {children}
    </p>
  );
}

export function ContentBlockFields({
  config: raw,
  onValid,
}: {
  config: ContentBlock["config"];
  onValid: ConfigChange;
}) {
  const config = { ...DEFAULT_CONTENT_BLOCK_CONFIG, ...raw };
  const navigate = useNavigate();
  const [label, setLabel] = useState(config.label ?? "");
  const [picking, setPicking] = useState(config.publicIds.length === 0);
  const library = useQuery(trpc.content.list.queryOptions({ limit: 100 }));
  const rows = useMemo(
    () =>
      ((library.data?.items ?? []) as unknown as LibraryRow[]).filter(
        row => row.status === "ready" || row.status === "processing"
      ),
    [library.data]
  );
  const byId = useMemo(() => new Map(rows.map(row => [row.publicId, row])), [rows]);
  const chosen = config.publicIds;
  const full = chosen.length >= CONTENT_BLOCK_ITEMS_MAX;

  const save = (next: Partial<ContentBlock["config"]>) =>
    onValid({ ...config, label: label.trim(), ...next } as ContentBlock["config"]);
  const move = (index: number, delta: number) => {
    const next = [...chosen];
    const [id] = next.splice(index, 1);
    next.splice(index + delta, 0, id!);
    save({ publicIds: next });
  };
  const toggle = (id: string) =>
    save({
      publicIds: chosen.includes(id) ? chosen.filter(x => x !== id) : [...chosen, id],
    });

  return (
    <div className="space-y-[21px]">
      <div className="space-y-2">
        <label
          htmlFor="content-label"
          className="block text-prism-label font-semibold text-prism-ink"
        >
          Heading
        </label>
        <div className={wellClass(false)}>
          <input
            id="content-label"
            maxLength={CONTENT_BLOCK_LABEL_MAX}
            value={label}
            placeholder="Latest"
            onChange={event => {
              setLabel(event.target.value);
              onValid({ ...config, label: event.target.value.trim() } as ContentBlock["config"]);
            }}
            aria-describedby="content-label-help"
            className="min-w-0 flex-1 bg-transparent text-prism-label text-prism-ink outline-none"
          />
        </div>
        <p
          id="content-label-help"
          className="flex justify-between text-prism-meta text-prism-ink-2"
        >
          <span>Leave it empty for no heading</span>
          <span className="tabular-nums">
            {label.length} / {CONTENT_BLOCK_LABEL_MAX}
          </span>
        </p>
      </div>

      <div className="space-y-2">
        <Eyebrow>Layout</Eyebrow>
        <ChipGroup<ContentBlockLayout>
          label="Layout"
          value={config.layout}
          onChange={layout => save({ layout })}
          options={LAYOUTS}
        />
        <p className="text-prism-meta text-prism-ink-2">
          {config.layout === "featured"
            ? "The first video or track plays right on your page. The rest show as cards."
            : config.layout === "grid"
              ? "Two cards per row. Each opens the item's page."
              : "One row per item with a small cover."}
        </p>
      </div>

      <div className="space-y-2">
        <div className="flex items-baseline justify-between">
          <Eyebrow>Items</Eyebrow>
          <span className="text-prism-meta text-prism-ink-2">
            {chosen.length} / {CONTENT_BLOCK_ITEMS_MAX}
          </span>
        </div>
        {chosen.length > 0 && (
          <ol className="overflow-hidden rounded-prism-13 border border-prism-line bg-white/60">
            {chosen.map((id, index) => {
              const row = byId.get(id);
              const reason = row ? hiddenReason(row) : "No longer in your library";
              return (
                <li
                  key={id}
                  className="flex min-h-touch items-center gap-2 border-t border-prism-line px-[8px] first:border-t-0"
                >
                  <span className="w-5 text-center text-prism-meta tabular-nums text-prism-ink-2">
                    {index + 1}
                  </span>
                  <span className="min-w-0 flex-1 py-[6px]">
                    <span className="block truncate text-prism-label font-semibold text-prism-ink">
                      {row?.title ?? "Unavailable item"}
                    </span>
                    <span
                      className={cn(
                        "block text-prism-meta",
                        reason ? "text-prism-warning-ink" : "text-prism-ink-2"
                      )}
                    >
                      {reason ?? (row ? (KIND_LABEL[row.kind] ?? row.kind) : "")}
                    </span>
                  </span>
                  <button
                    type="button"
                    aria-label={`Move ${row?.title ?? "item"} up`}
                    disabled={index === 0}
                    onClick={() => move(index, -1)}
                    className="prism-icon-btn prism-focus shrink-0 disabled:opacity-40"
                  >
                    <ArrowUp className="h-5 w-5" aria-hidden />
                  </button>
                  <button
                    type="button"
                    aria-label={`Move ${row?.title ?? "item"} down`}
                    disabled={index === chosen.length - 1}
                    onClick={() => move(index, 1)}
                    className="prism-icon-btn prism-focus shrink-0 disabled:opacity-40"
                  >
                    <ArrowDown className="h-5 w-5" aria-hidden />
                  </button>
                  <button
                    type="button"
                    aria-label={`Remove ${row?.title ?? "item"} from this block`}
                    onClick={() => toggle(id)}
                    className="prism-icon-btn prism-focus shrink-0"
                  >
                    <X className="h-5 w-5" aria-hidden />
                  </button>
                </li>
              );
            })}
          </ol>
        )}

        {picking ? (
          <div className="space-y-2">
            {library.isLoading ? (
              <p className="text-prism-meta text-prism-ink-2">Loading your library</p>
            ) : rows.length === 0 ? (
              <Notice variant="info" title="Your library is empty">
                Upload in Content first, then choose items here.
                <div className="mt-2">
                  <Button variant="secondary" onClick={() => navigate("/content?tab=library")}>
                    Open Content
                  </Button>
                </div>
              </Notice>
            ) : (
              <ul className="max-h-[320px] overflow-y-auto rounded-prism-13 border border-prism-line bg-white/60">
                {rows.map(row => {
                  const selected = chosen.includes(row.publicId);
                  const reason = hiddenReason(row);
                  return (
                    <li key={row.publicId} className="border-t border-prism-line first:border-t-0">
                      <button
                        type="button"
                        role="checkbox"
                        aria-checked={selected}
                        disabled={!selected && full}
                        onClick={() => toggle(row.publicId)}
                        className="prism-focus flex min-h-touch w-full items-center gap-3 px-[13px] py-[6px] text-left disabled:opacity-50"
                      >
                        <span
                          aria-hidden
                          className={cn(
                            "flex h-6 w-6 shrink-0 items-center justify-center rounded-prism-5 border-[1.5px]",
                            selected
                              ? "border-prism-nav bg-prism-nav text-white"
                              : "border-[rgba(22,21,43,0.56)]"
                          )}
                        >
                          {selected && <Check className="h-4 w-4" />}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-prism-label font-semibold text-prism-ink">
                            {row.title}
                          </span>
                          <span className="block text-prism-meta text-prism-ink-2">
                            {KIND_LABEL[row.kind] ?? row.kind}
                            {reason ? `, ${reason}` : ""}
                          </span>
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
            {chosen.length > 0 && (
              <Button variant="secondary" onClick={() => setPicking(false)}>
                Done
              </Button>
            )}
          </div>
        ) : (
          !full && (
            <button
              type="button"
              onClick={() => setPicking(true)}
              className="prism-focus -ml-2 inline-flex h-touch items-center gap-1 rounded-prism-8 px-2 text-prism-label font-semibold text-prism-nav hover:underline"
            >
              <Plus className="h-5 w-5" aria-hidden />
              Add items
            </button>
          )
        )}
        <p className="text-prism-meta text-prism-ink-2">
          Only published items show on your page. Drafts and items in review stay hidden until they
          are ready.
        </p>
      </div>
    </div>
  );
}
