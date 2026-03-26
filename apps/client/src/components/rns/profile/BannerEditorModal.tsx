import { useRef, useState, useCallback, useEffect } from "react";
import { Camera, X, ZoomIn, ZoomOut, Move, Save } from "lucide-react";
import { Button } from "@/components/ui/Button";

export type BannerFit = "cover" | "contain";

export interface BannerState {
  bannerUrl: string | null; // blob URL while pending upload, CDN URL otherwise
  bannerFile: File | null; // pending file to upload on save
  bannerFit: BannerFit;
  bannerFocusX: number;
  bannerFocusY: number;
  bannerScale: number;
}

interface BannerEditorModalProps {
  isOpen: boolean;
  initial: BannerState;
  onClose: () => void;
  onSave: (state: BannerState) => void;
}

export default function BannerEditorModal({
  isOpen,
  initial,
  onClose,
  onSave,
}: BannerEditorModalProps) {
  const [draft, setDraft] = useState<BannerState>(initial);
  const [isDragging, setIsDragging] = useState(false);

  const bannerRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const drag = useRef({ active: false, startX: 0, startY: 0, startFX: 50, startFY: 50 });

  useEffect(() => {
    if (isOpen) setDraft(initial);
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isOpen, onClose]);

  const bannerBgStyle = (data: BannerState): React.CSSProperties => {
    if (!data.bannerUrl) return {};
    return {
      backgroundImage: `url(${data.bannerUrl})`,
      backgroundSize:
        data.bannerFit === "contain"
          ? "contain"
          : data.bannerScale === 1
            ? "cover"
            : `${data.bannerScale * 100}%`,
      backgroundPosition: `${data.bannerFocusX}% ${data.bannerFocusY}%`,
      backgroundRepeat: "no-repeat",
    };
  };

  const onPointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (!draft.bannerUrl) return;
      e.preventDefault();
      drag.current = {
        active: true,
        startX: e.clientX,
        startY: e.clientY,
        startFX: draft.bannerFocusX,
        startFY: draft.bannerFocusY,
      };
      setIsDragging(true);
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    },
    [draft.bannerUrl, draft.bannerFocusX, draft.bannerFocusY]
  );

  const onPointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!drag.current.active || !bannerRef.current) return;
      const { width, height } = bannerRef.current.getBoundingClientRect();
      const overflow = Math.max(draft.bannerScale - 1, 0.1);
      const dxPct = (((drag.current.startX - e.clientX) / width) * 100) / overflow;
      const dyPct = (((drag.current.startY - e.clientY) / height) * 100) / overflow;
      setDraft(p => ({
        ...p,
        bannerFocusX: Math.max(0, Math.min(100, drag.current.startFX + dxPct)),
        bannerFocusY: Math.max(0, Math.min(100, drag.current.startFY + dyPct)),
      }));
    },
    [draft.bannerScale]
  );

  const onPointerUp = useCallback(() => {
    drag.current.active = false;
    setIsDragging(false);
  }, []);

  const onWheel = useCallback(
    (e: React.WheelEvent) => {
      if (!draft.bannerUrl) return;
      e.preventDefault();
      setDraft(p => ({
        ...p,
        bannerScale: Math.max(1, Math.min(2, p.bannerScale + (e.deltaY > 0 ? -0.05 : 0.05))),
      }));
    },
    [draft.bannerUrl]
  );

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = "";
    if (draft.bannerUrl?.startsWith("blob:")) URL.revokeObjectURL(draft.bannerUrl);
    const blobUrl = URL.createObjectURL(file);
    setDraft(p => ({
      ...p,
      bannerUrl: blobUrl,
      bannerFile: file,
      bannerFocusX: 50,
      bannerFocusY: 50,
      bannerScale: 1,
    }));
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
      onClick={e => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-xl flex flex-col overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <h2 className="text-base font-semibold text-gray-900">Edit banner photo</h2>
          <button
            onClick={onClose}
            className="h-8 w-8 rounded-full hover:bg-gray-100 transition-colors flex items-center justify-center text-gray-500"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
        <div
          ref={bannerRef}
          className={[
            "h-52 relative overflow-hidden select-none",
            draft.bannerUrl ? (isDragging ? "cursor-grabbing" : "cursor-grab") : "",
          ].join(" ")}
          style={bannerBgStyle(draft)}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerLeave={onPointerUp}
          onWheel={onWheel}
        >
          {!draft.bannerUrl && (
            <div className="w-full h-full bg-gradient-to-r from-indigo-400 via-indigo-400 to-blue-400" />
          )}
          <div
            className="absolute inset-0 pointer-events-none transition-colors duration-150"
            style={{ background: isDragging ? "rgba(0,0,0,0.12)" : "rgba(0,0,0,0.05)" }}
          />
          {draft.bannerUrl && !isDragging && (
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <span className="flex items-center gap-1.5 bg-black/40 backdrop-blur-sm text-white text-xs font-medium px-3 py-1.5 rounded-full">
                <Move className="w-3.5 h-3.5" />
                Drag to adjust
              </span>
            </div>
          )}
          <div
            className="absolute top-3 right-3 z-20 flex items-center gap-1.5"
            onPointerDown={e => e.stopPropagation()}
          >
            {draft.bannerUrl && (
              <button
                onClick={() => setDraft(p => ({ ...p, bannerUrl: null }))}
                className="h-7 w-7 rounded-full bg-black/50 backdrop-blur-sm text-white hover:bg-black/70 transition-colors flex items-center justify-center"
                title="Remove banner"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
            <button
              onClick={() => fileInputRef.current?.click()}
              className="flex items-center gap-1.5 h-7 px-3 rounded-full bg-black/50 backdrop-blur-sm text-white text-xs font-medium hover:bg-black/70 transition-colors"
            >
              <Camera className="w-3.5 h-3.5" />
              {draft.bannerUrl ? "Change photo" : "Add photo"}
            </button>
          </div>

          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={handleFile}
          />
        </div>

        {draft.bannerUrl && (
          <div className="px-5 py-4 border-t border-gray-100 space-y-4">
            <div className="flex items-center gap-3">
              <span className="text-xs font-medium text-gray-500 w-8">Zoom</span>
              <button
                onClick={() =>
                  setDraft(p => ({ ...p, bannerScale: Math.max(1, p.bannerScale - 0.1) }))
                }
                disabled={draft.bannerScale <= 1}
                className="text-gray-400 disabled:opacity-30 hover:text-gray-700 transition-colors"
              >
                <ZoomOut className="w-4 h-4" />
              </button>
              <input
                type="range"
                min={1}
                max={2}
                step={0.01}
                value={draft.bannerScale}
                onChange={e => setDraft(p => ({ ...p, bannerScale: Number(e.target.value) }))}
                className="flex-1 accent-blue-500"
              />
              <button
                onClick={() =>
                  setDraft(p => ({ ...p, bannerScale: Math.min(2, p.bannerScale + 0.1) }))
                }
                disabled={draft.bannerScale >= 2}
                className="text-gray-400 disabled:opacity-30 hover:text-gray-700 transition-colors"
              >
                <ZoomIn className="w-4 h-4" />
              </button>
              <span className="text-xs text-gray-400 w-8 text-right">
                {Math.round((draft.bannerScale - 1) * 100)}%
              </span>
            </div>

            {/* Fit */}
            <div className="flex items-center gap-3">
              <span className="text-xs font-medium text-gray-500 w-8">Fit</span>
              <div className="flex gap-2">
                {(["cover", "contain"] as BannerFit[]).map(f => (
                  <button
                    key={f}
                    onClick={() => setDraft(p => ({ ...p, bannerFit: f }))}
                    className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${
                      draft.bannerFit === f
                        ? "bg-blue-500 border-blue-500 text-white"
                        : "border-gray-200 text-gray-600 hover:border-gray-400"
                    }`}
                  >
                    {f.charAt(0).toUpperCase() + f.slice(1)}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        <div className="px-5 py-4 border-t border-gray-100">
          <p className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-3">
            Profile preview
          </p>
          <div className="rounded-xl border border-gray-200 shadow-sm bg-white overflow-visible">
            <div
              className="relative w-full rounded-t-xl overflow-hidden"
              style={{ paddingBottom: "16.07%" }}
            >
              <div className="absolute inset-0" style={bannerBgStyle(draft)}>
                {!draft.bannerUrl && (
                  <div className="w-full h-full bg-gradient-to-r from-indigo-400 via-indigo-400 to-blue-400" />
                )}
              </div>
            </div>
            <div className="px-4 pb-3 relative">
              <div className="w-10 h-10 rounded-full bg-gradient-to-br from-green-300 to-green-100 ring-[3px] ring-white -mt-5 mb-2" />
              <div className="h-2 w-24 bg-gray-200 rounded-full mb-1.5" />
              <div className="h-1.5 w-16 bg-gray-100 rounded-full" />
            </div>
          </div>
        </div>
        <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-gray-100">
          <Button variant="default" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={() => onSave(draft)} className="flex items-center gap-1.5">
            <Save className="w-4 h-4" /> Apply
          </Button>
        </div>
      </div>
    </div>
  );
}
