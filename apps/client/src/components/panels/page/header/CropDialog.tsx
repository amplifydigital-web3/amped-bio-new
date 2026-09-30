import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import { ZoomIn, ZoomOut } from "lucide-react";
import {
  Button,
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Skeleton,
} from "@repo/ui";

// Screen Review 017 I04, I08 to I10. Crop photo: a square viewport with a
// circular mask, drag or arrow keys to frame, zoom 1x to 3x. The saved photo
// is exactly what the circle shows.

const VIEW = 377;
const OUTPUT = 512;
const MIN_ZOOM = 1;
const MAX_ZOOM = 3;

interface Frame {
  zoom: number;
  /** Image center offset from the viewport center, in viewport px */
  x: number;
  y: number;
}

export function CropDialog({
  file,
  onCancel,
  onUse,
}: {
  file: File;
  onCancel: () => void;
  onUse: (cropped: File, previewUrl: string) => void;
}) {
  const [url] = useState(() => URL.createObjectURL(file));
  const [image, setImage] = useState<HTMLImageElement | null>(null);
  const [frame, setFrame] = useState<Frame>({ zoom: 1, x: 0, y: 0 });
  const [showSkeleton, setShowSkeleton] = useState(false);
  const viewRef = useRef<HTMLDivElement>(null);
  const drag = useRef<{ x: number; y: number; frame: Frame } | null>(null);
  const [size, setSize] = useState(VIEW);

  useEffect(() => () => URL.revokeObjectURL(url), [url]);
  useEffect(() => {
    const timer = setTimeout(() => setShowSkeleton(true), 400);
    return () => clearTimeout(timer);
  }, []);
  useEffect(() => {
    const node = viewRef.current;
    if (!node) return;
    const observer = new ResizeObserver(() => setSize(node.clientWidth || VIEW));
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  // The image covers the viewport at zoom 1 (cover fit)
  const base = image ? Math.max(size / image.naturalWidth, size / image.naturalHeight) : 1;
  const scale = base * frame.zoom;
  const drawnW = image ? image.naturalWidth * scale : size;
  const drawnH = image ? image.naturalHeight * scale : size;

  const clamp = (next: Frame): Frame => {
    if (!image) return next;
    const s = base * next.zoom;
    const maxX = Math.max(0, (image.naturalWidth * s - size) / 2);
    const maxY = Math.max(0, (image.naturalHeight * s - size) / 2);
    return {
      zoom: next.zoom,
      x: Math.min(maxX, Math.max(-maxX, next.x)),
      y: Math.min(maxY, Math.max(-maxY, next.y)),
    };
  };

  const setZoom = (zoom: number) =>
    setFrame(f => clamp({ ...f, zoom: Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom)) }));

  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    event.currentTarget.setPointerCapture(event.pointerId);
    drag.current = { x: event.clientX, y: event.clientY, frame };
  };
  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    if (!drag.current) return;
    const start = drag.current;
    setFrame(
      clamp({
        ...start.frame,
        x: start.frame.x + (event.clientX - start.x),
        y: start.frame.y + (event.clientY - start.y),
      })
    );
  };
  const onPointerUp = () => {
    drag.current = null;
  };
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const step = 8;
    const moves: Record<string, [number, number]> = {
      ArrowLeft: [step, 0],
      ArrowRight: [-step, 0],
      ArrowUp: [0, step],
      ArrowDown: [0, -step],
    };
    const move = moves[event.key];
    if (!move) return;
    event.preventDefault();
    setFrame(f => clamp({ ...f, x: f.x + move[0], y: f.y + move[1] }));
  };

  const use = () => {
    if (!image) return;
    // Source rectangle: the viewport mapped back into image pixels (017 I04)
    const sourceSize = size / scale;
    const centerX = image.naturalWidth / 2 - frame.x / scale;
    const centerY = image.naturalHeight / 2 - frame.y / scale;
    const canvas = document.createElement("canvas");
    canvas.width = OUTPUT;
    canvas.height = OUTPUT;
    const context = canvas.getContext("2d");
    if (!context) return;
    context.imageSmoothingQuality = "high";
    context.drawImage(
      image,
      centerX - sourceSize / 2,
      centerY - sourceSize / 2,
      sourceSize,
      sourceSize,
      0,
      0,
      OUTPUT,
      OUTPUT
    );
    const keepAlpha = file.type === "image/png" || file.type === "image/svg+xml";
    const type = keepAlpha ? "image/png" : "image/jpeg";
    canvas.toBlob(
      blob => {
        if (!blob) return;
        const cropped = new File([blob], `profile-photo.${keepAlpha ? "png" : "jpg"}`, { type });
        onUse(cropped, canvas.toDataURL(type, 0.85));
      },
      type,
      0.85
    );
  };

  return (
    <Dialog open onOpenChange={open => !open && onCancel()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Crop photo</DialogTitle>
        </DialogHeader>
        <div className="space-y-[21px] font-prism">
          <div
            ref={viewRef}
            role="application"
            aria-label="Photo framing. Drag or use the arrow keys to move the photo."
            tabIndex={0}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
            onKeyDown={onKeyDown}
            className="prism-focus relative mx-auto aspect-square w-full max-w-[377px] cursor-grab touch-none select-none overflow-hidden rounded-prism-21 bg-prism-line active:cursor-grabbing"
          >
            {!image && showSkeleton && <Skeleton className="absolute inset-0 !rounded-prism-21" />}
            <img
              src={url}
              alt="Your photo"
              draggable={false}
              onLoad={event => setImage(event.currentTarget)}
              className="pointer-events-none absolute left-1/2 top-1/2 max-w-none"
              style={{
                width: drawnW,
                height: drawnH,
                transform: `translate(calc(-50% + ${frame.x}px), calc(-50% + ${frame.y}px))`,
                visibility: image ? "visible" : "hidden",
              }}
            />
            {/* Outside the circle at 55% white; the circle outlined in white */}
            <div
              aria-hidden
              className="pointer-events-none absolute inset-0 rounded-full shadow-[0_0_0_9999px_rgba(255,255,255,0.55)] ring-[1.5px] ring-white"
            />
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              aria-label="Zoom out"
              onClick={() => setZoom(frame.zoom - 0.2)}
              className="prism-icon-btn prism-focus shrink-0"
            >
              <ZoomOut aria-hidden className="h-[21px] w-[21px] text-prism-ink-2" />
            </button>
            <input
              type="range"
              aria-label="Zoom"
              min={MIN_ZOOM}
              max={MAX_ZOOM}
              step={0.05}
              value={frame.zoom}
              onChange={event => setZoom(Number(event.target.value))}
              className="h-touch min-w-0 flex-1 cursor-pointer accent-prism-nav"
            />
            <button
              type="button"
              aria-label="Zoom in"
              onClick={() => setZoom(frame.zoom + 0.2)}
              className="prism-icon-btn prism-focus shrink-0"
            >
              <ZoomIn aria-hidden className="h-[21px] w-[21px] text-prism-ink-2" />
            </button>
            <span className="w-[34px] text-right text-prism-meta tabular-nums text-prism-ink-2">
              {frame.zoom.toFixed(1)}x
            </span>
          </div>
        </div>
        <DialogFooter>
          <Button variant="secondary" onClick={onCancel}>
            Cancel
          </Button>
          <Button size="lg" disabled={!image} onClick={use}>
            Use photo
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
