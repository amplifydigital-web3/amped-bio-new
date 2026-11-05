"use client";

/**
 * The photo viewer (Fan Library #26, FL-1, board m8): one photo at a time,
 * swipe for the next, a thumbnail strip, double tap to zoom. Every gesture has
 * a button too: Previous, Next, the thumbnails, and Zoom in or out. Arrow keys
 * move between photos when the viewer has focus.
 *
 * Photo sets arrive with bundles (content system C9, C10). Today an image item
 * is a set of one: no strip and no arrows, zoom only.
 */
import * as React from "react";
import { ChevronLeft, ChevronRight, ZoomIn, ZoomOut } from "lucide-react";
import { cn } from "../utils";
import { PLAYER_COPY as copy } from "./copy";
import { DOUBLE_TAP_MS, classifySwipe } from "./queue";

export interface PhotoViewerImage {
  src: string;
  srcSet?: string | null;
  alt: string;
  /** Small rendition for the strip; falls back to src */
  thumb?: string | null;
}

const ICON_BTN =
  "inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-black/45 text-white outline-none hover:bg-black/60 focus-visible:ring-2 focus-visible:ring-white disabled:opacity-40";

export function PhotoViewer({
  images,
  initialIndex = 0,
  className,
}: {
  images: PhotoViewerImage[];
  initialIndex?: number;
  className?: string;
}) {
  const [index, setIndex] = React.useState(() =>
    Math.min(Math.max(0, initialIndex), Math.max(0, images.length - 1))
  );
  const [zoom, setZoom] = React.useState<{ x: number; y: number } | null>(null);
  const pointer = React.useRef<{ x: number; y: number; t: number; id: number } | null>(null);
  const lastTap = React.useRef(0);
  const stageRef = React.useRef<HTMLDivElement | null>(null);
  const many = images.length > 1;
  const image = images[index];

  const go = React.useCallback(
    (next: number) => {
      if (next < 0 || next >= images.length) return;
      setZoom(null);
      setIndex(next);
    },
    [images.length]
  );

  const toggleZoom = (x = 50, y = 50) => setZoom(current => (current ? null : { x, y }));

  if (!image) return null;

  const onPointerDown = (event: React.PointerEvent) => {
    if ((event.target as HTMLElement).closest("button")) return;
    pointer.current = {
      x: event.clientX,
      y: event.clientY,
      t: performance.now(),
      id: event.pointerId,
    };
  };
  const onPointerUp = (event: React.PointerEvent) => {
    const began = pointer.current;
    pointer.current = null;
    if (!began || began.id !== event.pointerId) return;
    const swipe = classifySwipe(
      event.clientX - began.x,
      event.clientY - began.y,
      performance.now() - began.t
    );
    if (swipe === "left" && !zoom) go(index + 1);
    else if (swipe === "right" && !zoom) go(index - 1);
    else if (swipe === "tap") {
      const now = performance.now();
      if (now - lastTap.current < DOUBLE_TAP_MS) {
        lastTap.current = 0;
        const rect = stageRef.current?.getBoundingClientRect();
        const x = rect ? ((event.clientX - rect.left) / rect.width) * 100 : 50;
        const y = rect ? ((event.clientY - rect.top) / rect.height) * 100 : 50;
        toggleZoom(x, y);
      } else {
        lastTap.current = now;
      }
    }
  };

  return (
    <div
      role="group"
      aria-roledescription="carousel"
      aria-label={image.alt}
      tabIndex={0}
      onKeyDown={event => {
        if (event.key === "ArrowRight") {
          event.preventDefault();
          go(index + 1);
        } else if (event.key === "ArrowLeft") {
          event.preventDefault();
          go(index - 1);
        }
      }}
      className={cn(
        "rounded-[13px] bg-[#0E1015] text-white outline-none focus-visible:ring-2 focus-visible:ring-white",
        className
      )}
    >
      <div
        ref={stageRef}
        onPointerDown={onPointerDown}
        onPointerUp={onPointerUp}
        onPointerCancel={() => (pointer.current = null)}
        className={cn(
          "relative flex aspect-[4/5] w-full items-center justify-center overflow-hidden rounded-t-[13px] sm:aspect-[4/3]",
          zoom ? "touch-pinch-zoom" : "touch-pan-y"
        )}
      >
        <img
          src={image.src}
          srcSet={image.srcSet || undefined}
          sizes="(min-width: 640px) 610px, 100vw"
          alt={image.alt}
          draggable={false}
          className="h-full w-full select-none object-contain transition-transform duration-200 motion-reduce:transition-none"
          style={
            zoom ? { transform: "scale(2)", transformOrigin: `${zoom.x}% ${zoom.y}%` } : undefined
          }
        />
        <div className="absolute right-[8px] top-[8px] flex gap-[8px]">
          <button
            type="button"
            aria-label={zoom ? copy.zoomOut : copy.zoomIn}
            aria-pressed={!!zoom}
            onClick={() => toggleZoom()}
            className={ICON_BTN}
          >
            {zoom ? (
              <ZoomOut className="h-5 w-5" aria-hidden />
            ) : (
              <ZoomIn className="h-5 w-5" aria-hidden />
            )}
          </button>
        </div>
        {many && (
          <>
            <button
              type="button"
              aria-label={copy.photoPrevious}
              onClick={() => go(index - 1)}
              disabled={index === 0}
              className={cn(ICON_BTN, "absolute left-[8px] top-1/2 -translate-y-1/2")}
            >
              <ChevronLeft className="h-6 w-6" aria-hidden />
            </button>
            <button
              type="button"
              aria-label={copy.photoNext}
              onClick={() => go(index + 1)}
              disabled={index === images.length - 1}
              className={cn(ICON_BTN, "absolute right-[8px] top-1/2 -translate-y-1/2")}
            >
              <ChevronRight className="h-6 w-6" aria-hidden />
            </button>
          </>
        )}
      </div>

      <div className="px-[13px] pb-[13px] pt-[8px]">
        {many && (
          <>
            <p className="text-[15px] tabular-nums text-white/80" aria-live="polite">
              {copy.photoOf(index + 1, images.length)}
            </p>
            <ol className="mt-[8px] flex gap-[8px] overflow-x-auto pb-[4px]">
              {images.map((thumb, i) => (
                <li key={`${thumb.src}-${i}`} className="shrink-0">
                  <button
                    type="button"
                    aria-label={copy.photoThumb(i + 1)}
                    aria-current={i === index ? "true" : undefined}
                    onClick={() => go(i)}
                    className={cn(
                      "block h-[55px] w-[55px] overflow-hidden rounded-[8px] outline-none focus-visible:ring-2 focus-visible:ring-white",
                      i === index ? "ring-2 ring-white" : "opacity-75"
                    )}
                  >
                    <img
                      src={thumb.thumb || thumb.src}
                      alt=""
                      className="h-full w-full object-cover"
                    />
                  </button>
                </li>
              ))}
            </ol>
          </>
        )}
        <p className="mt-[8px] text-[15px] text-white/80">
          {many ? copy.photoHint : copy.photoHintSingle}
        </p>
      </div>
    </div>
  );
}
