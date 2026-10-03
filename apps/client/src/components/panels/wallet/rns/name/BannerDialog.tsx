import { useCallback, useEffect, useRef, useState } from "react";
import { Camera, Move, Trash2, ZoomIn, ZoomOut } from "lucide-react";
import {
  Button,
  ChipGroup,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  cn,
} from "@repo/ui";
import type { PendingBanner } from "./usePublishDiff";
import {
  bannerStyle,
  parseBannerMeta,
  toBannerMeta,
  type BannerDraft,
  type BannerFit,
} from "./banner";

/**
 * Screen Review 102 I11: Change banner in the shared Dialog. The banner is the
 * one record the name page edits itself; Done keeps it as a pending change
 * that Publish changes writes (111). Drag or the arrow keys move the focus.
 */
export function BannerDialog({
  open,
  onOpenChange,
  current,
  onDone,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  current: { url: string | null; meta: string | undefined };
  onDone: (banner: PendingBanner) => void;
}) {
  const initial = useCallback(
    (): BannerDraft => ({ url: current.url, file: null, ...parseBannerMeta(current.meta) }),
    [current.url, current.meta]
  );
  const [draft, setDraft] = useState<BannerDraft>(initial);
  const [dragging, setDragging] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const areaRef = useRef<HTMLDivElement>(null);
  const drag = useRef({ x: 0, y: 0, fx: 50, fy: 50 });

  useEffect(() => {
    if (open) setDraft(initial());
  }, [open, initial]);

  const clamp = (value: number) => Math.max(0, Math.min(100, value));
  const nudge = (dx: number, dy: number) =>
    setDraft(prev => ({ ...prev, x: clamp(prev.x + dx), y: clamp(prev.y + dy) }));

  const onPointerDown = (event: React.PointerEvent) => {
    if (!draft.url) return;
    drag.current = { x: event.clientX, y: event.clientY, fx: draft.x, fy: draft.y };
    setDragging(true);
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
  };
  const onPointerMove = (event: React.PointerEvent) => {
    if (!dragging || !areaRef.current) return;
    const { width, height } = areaRef.current.getBoundingClientRect();
    const overflow = Math.max(draft.scale - 1, 0.1);
    setDraft(prev => ({
      ...prev,
      x: clamp(drag.current.fx + (((drag.current.x - event.clientX) / width) * 100) / overflow),
      y: clamp(drag.current.fy + (((drag.current.y - event.clientY) / height) * 100) / overflow),
    }));
  };

  const pickFile = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setDraft(prev => {
      if (prev.file && prev.url?.startsWith("blob:")) URL.revokeObjectURL(prev.url);
      return { ...prev, url: URL.createObjectURL(file), file, x: 50, y: 50, scale: 1 };
    });
  };

  const meta = toBannerMeta(draft);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Change banner</DialogTitle>
          <DialogDescription>
            The banner shows on your RNS name. Publish changes writes it.
          </DialogDescription>
        </DialogHeader>
        <div
          ref={areaRef}
          role={draft.url ? "img" : undefined}
          aria-label={
            draft.url ? "Banner preview. Use the arrow keys to move the focus." : undefined
          }
          tabIndex={draft.url ? 0 : -1}
          onKeyDown={event => {
            const step = 5;
            if (event.key === "ArrowLeft") nudge(-step, 0);
            else if (event.key === "ArrowRight") nudge(step, 0);
            else if (event.key === "ArrowUp") nudge(0, -step);
            else if (event.key === "ArrowDown") nudge(0, step);
            else return;
            event.preventDefault();
          }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={() => setDragging(false)}
          onPointerLeave={() => setDragging(false)}
          className={cn(
            "prism-focus relative h-[144px] select-none overflow-hidden rounded-prism-13 bg-prism-value-panel-1",
            draft.url && (dragging ? "cursor-grabbing" : "cursor-grab")
          )}
          style={bannerStyle(draft.url, meta)}
        >
          {draft.url && !dragging && (
            <span className="pointer-events-none absolute inset-0 flex items-center justify-center">
              <span className="flex items-center gap-1.5 rounded-full bg-black/50 px-3 py-1.5 text-prism-meta font-semibold text-white">
                <Move aria-hidden className="h-4 w-4" />
                Drag to adjust
              </span>
            </span>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="secondary" onClick={() => fileRef.current?.click()}>
            <Camera aria-hidden />
            {draft.url ? "Choose another photo" : "Choose a photo"}
          </Button>
          {draft.url && (
            <Button
              type="button"
              variant="ghost"
              onClick={() => setDraft(prev => ({ ...prev, url: null, file: null }))}
            >
              <Trash2 aria-hidden />
              Remove banner
            </Button>
          )}
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            className="sr-only"
            tabIndex={-1}
            aria-hidden
            onChange={pickFile}
          />
        </div>
        {draft.url && (
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <span className="w-14 text-prism-label font-semibold text-prism-ink">Zoom</span>
              <button
                type="button"
                aria-label="Zoom out"
                disabled={draft.scale <= 1}
                onClick={() =>
                  setDraft(prev => ({
                    ...prev,
                    scale: Math.max(1, +(prev.scale - 0.1).toFixed(2)),
                  }))
                }
                className="prism-icon-btn prism-focus prism-btn-disabled shrink-0"
              >
                <ZoomOut aria-hidden className="h-5 w-5" />
              </button>
              <input
                type="range"
                min={1}
                max={2}
                step={0.01}
                value={draft.scale}
                aria-label="Zoom"
                onChange={event =>
                  setDraft(prev => ({ ...prev, scale: Number(event.target.value) }))
                }
                className="h-touch min-w-0 flex-1 accent-prism-nav"
              />
              <button
                type="button"
                aria-label="Zoom in"
                disabled={draft.scale >= 2}
                onClick={() =>
                  setDraft(prev => ({
                    ...prev,
                    scale: Math.min(2, +(prev.scale + 0.1).toFixed(2)),
                  }))
                }
                className="prism-icon-btn prism-focus prism-btn-disabled shrink-0"
              >
                <ZoomIn aria-hidden className="h-5 w-5" />
              </button>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-14 text-prism-label font-semibold text-prism-ink">Fit</span>
              <ChipGroup<BannerFit>
                label="Banner fit"
                value={draft.fit}
                onChange={fit => setDraft(prev => ({ ...prev, fit }))}
                options={[
                  { value: "cover", label: "Fill" },
                  { value: "contain", label: "Fit whole photo" },
                ]}
              />
            </div>
          </div>
        )}
        <div className="flex flex-wrap justify-end gap-2">
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            type="button"
            onClick={() => {
              onDone({ url: draft.url, file: draft.file, meta });
              onOpenChange(false);
            }}
          >
            Done
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
