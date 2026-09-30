import { useCallback, useMemo, useRef, useState, type DragEvent } from "react";
import { useQuery } from "@tanstack/react-query";
import { AlertCircle, AlertTriangle, Play, Upload } from "lucide-react";
import { ALLOWED_BACKGROUND_FILE_EXTENSIONS, ALLOWED_BACKGROUND_FILE_TYPES } from "@repo/constants";
import {
  Button,
  ChipGroup,
  Input,
  Skeleton,
  cn,
  trpc,
  trpcClient,
  usePrefersReducedMotion,
} from "@repo/ui";
import type { Background } from "@/types/editor";
import { backgroundColors, gradients, photos, videos } from "@/utils/backgrounds";
import { DisclosureRow, ValueSwatch } from "../kit/DisclosureRow";
import { OptionGrid, OptionTile } from "../kit/OptionTile";
import { ColorControl } from "../kit/ColorControl";
import { CreatorBackdrop } from "../kit/CreatorArt";
import { backgroundThumb, useDesign } from "../kit/useDesign";

// Screen Review 023. The Background row in Design Style.

type Category = "colors" | "gradients" | "photos" | "videos" | "upload";

const CATEGORIES: { value: Category; label: string }[] = [
  { value: "colors", label: "Colors" },
  { value: "gradients", label: "Gradients" },
  { value: "photos", label: "Photos" },
  { value: "videos", label: "Videos" },
  { value: "upload", label: "Upload" },
];

const GRADIENTS: Background[] = [...gradients, ...backgroundColors];
const FIRST_VIDEOS = 12;
const VIDEO_EXTENSIONS = ["mp4", "mov", "webm", "avi"];

function sameBackground(a?: Background, b?: Background) {
  return !!a && !!b && a.value === b.value;
}

/** The category a background belongs to (I01). */
function categoryOf(background?: Background): Category {
  if (!background) return "gradients";
  if (background.fileId) return "upload";
  if (GRADIENTS.some(g => g.value === background.value)) return "gradients";
  if (photos.some(p => p.value === background.value)) return "photos";
  if (videos.some(v => v.value === background.value)) return "videos";
  if (background.type === "color")
    return background.value?.includes("gradient") ? "gradients" : "colors";
  return "upload";
}

/** Type line on the current card and the row value (I03, I14). */
function backgroundTypeLine(background?: Background) {
  if (!background) return "None";
  if (background.fileId) return "Your upload";
  if (background.type === "video") return "Video";
  if (background.type === "color")
    return background.value?.includes("gradient") ? "Gradient" : "Color";
  return GRADIENTS.some(g => g.value === background.value) ? "Gradient" : "Photo";
}

function backgroundName(background?: Background) {
  if (!background) return "None";
  if (background.fileId) return "Your upload";
  return background.label || backgroundTypeLine(background);
}

export function BackgroundRowSwatch({ background }: { background?: Background }) {
  const thumb = backgroundThumb(background);
  return (
    <ValueSwatch
      style={
        background?.type === "color"
          ? { background: background.value || undefined }
          : thumb
            ? { backgroundImage: `url(${thumb})` }
            : { backgroundColor: "#14161C" }
      }
    />
  );
}

export function BackgroundRow() {
  const design = useDesign();
  const { config, locked, setBackground, preview, endPreview } = design;
  const current = config.background;
  const [category, setCategory] = useState<Category>(() => categoryOf(current));
  const [allVideos, setAllVideos] = useState(false);

  const apply = useCallback(
    (background: Background) => {
      if (locked) return;
      setBackground(background);
      endPreview();
    },
    [endPreview, locked, setBackground]
  );

  const tiles = useMemo(() => {
    if (category === "gradients") return GRADIENTS;
    if (category === "photos") return photos;
    if (category === "videos") return allVideos ? videos : videos.slice(0, FIRST_VIDEOS);
    return [];
  }, [allVideos, category]);

  const selectedIndex = tiles.findIndex(t => sameBackground(t, current));

  return (
    <DisclosureRow
      id="background"
      label="Background"
      value={backgroundName(current)}
      swatch={<BackgroundRowSwatch background={current} />}
    >
      <div className="space-y-[21px]">
        {/* I03: the current background */}
        <div className="prism-glass-clear flex items-center gap-3 p-[13px]">
          <div className="h-[55px] w-[55px] shrink-0 overflow-hidden rounded-prism-13">
            <CreatorBackdrop background={current} />
          </div>
          <div className="min-w-0">
            <p className="truncate text-prism-label font-semibold text-prism-ink">
              {backgroundName(current)}
            </p>
            <p className="text-prism-meta text-prism-ink-2">{backgroundTypeLine(current)}</p>
          </div>
        </div>

        <ChipGroup
          label="Background type"
          value={category}
          onChange={setCategory}
          options={CATEGORIES}
          className="-mx-1 flex-nowrap overflow-x-auto px-1 py-1"
        />

        {category === "colors" && (
          <ColorControl
            label="Background color"
            disabled={locked}
            value={
              current?.type === "color" && !current.value?.includes("gradient")
                ? current.value || "#14161C"
                : "#14161C"
            }
            onChange={hex => apply({ type: "color", value: hex, label: hex })}
            yourColors={design.yourColors}
          />
        )}

        {(category === "gradients" || category === "photos" || category === "videos") && (
          <>
            <OptionGrid label={`${CATEGORIES.find(c => c.value === category)?.label} backgrounds`}>
              {tiles.map((tile, index) => (
                <BackgroundTile
                  key={tile.value}
                  background={tile}
                  selected={index === selectedIndex}
                  focusable={selectedIndex === -1 ? index === 0 : index === selectedIndex}
                  disabled={locked}
                  onSelect={() => apply(tile)}
                  onPreview={() => preview({ background: tile })}
                  onPreviewEnd={endPreview}
                />
              ))}
            </OptionGrid>
            {category === "videos" && !allVideos && videos.length > FIRST_VIDEOS && (
              <Button variant="secondary" onClick={() => setAllVideos(true)}>
                Show all <span className="tabular-nums">{videos.length}</span> videos
              </Button>
            )}
          </>
        )}

        {category === "upload" && <UploadBackground current={current} onLink={apply} />}
      </div>
    </DisclosureRow>
  );
}

function BackgroundTile({
  background,
  selected,
  focusable,
  disabled,
  onSelect,
  onPreview,
  onPreviewEnd,
}: {
  background: Background;
  selected: boolean;
  focusable: boolean;
  disabled: boolean;
  onSelect: () => void;
  onPreview: () => void;
  onPreviewEnd: () => void;
}) {
  const reducedMotion = usePrefersReducedMotion();
  const [playing, setPlaying] = useState(false);
  const isVideo = background.type === "video";

  return (
    <OptionTile
      label={background.label ?? "Background"}
      selected={selected}
      focusable={focusable}
      disabled={disabled}
      onSelect={onSelect}
      onPreview={() => {
        onPreview();
        if (isVideo && !reducedMotion) setPlaying(true);
      }}
      onPreviewEnd={() => {
        onPreviewEnd();
        setPlaying(false);
      }}
      art={
        <>
          <CreatorBackdrop background={background} />
          {isVideo && playing && background.value && (
            <video
              src={background.value}
              autoPlay
              muted
              loop
              playsInline
              className="absolute inset-0 h-full w-full object-cover"
            />
          )}
          {isVideo && (
            <span className="absolute bottom-2 left-2 inline-flex h-[26px] items-center gap-1 rounded-prism-8 bg-white/90 px-2 text-prism-meta text-prism-ink">
              <Play aria-hidden className="h-[13px] w-[13px]" />
              Video
            </span>
          )}
        </>
      }
    />
  );
}

/** Upload with progress, as a promise (I08). */
function putWithProgress(url: string, file: File, onProgress: (percent: number) => void) {
  return new Promise<void>((resolve, reject) => {
    const request = new XMLHttpRequest();
    request.open("PUT", url);
    request.setRequestHeader("Content-Type", file.type);
    request.upload.onprogress = event => {
      if (event.lengthComputable) onProgress(Math.round((event.loaded / event.total) * 100));
    };
    request.onload = () =>
      request.status >= 200 && request.status < 300
        ? resolve()
        : reject(new Error(request.status === 413 ? "too-large" : "upload-failed"));
    request.onerror = () => reject(new Error("network"));
    request.send(file);
  });
}

function UploadBackground({
  current,
  onLink,
}: {
  current?: Background;
  onLink: (background: Background) => void;
}) {
  const { theme, profile, setUser, locked } = useDesign();
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState<{ message: string; retry?: File } | null>(null);
  const [link, setLink] = useState("");
  const [linkType, setLinkType] = useState<"image" | "video">("image");
  const [linkError, setLinkError] = useState<string | undefined>();

  const { data: limits, isLoading } = useQuery(trpc.upload.getLimits.queryOptions());
  const limitMb = limits?.maxBackgroundFileSize
    ? Math.round(limits.maxBackgroundFileSize / (1024 * 1024))
    : null;

  const upload = async (file: File) => {
    setError(null);
    if (!ALLOWED_BACKGROUND_FILE_TYPES.includes(file.type)) {
      setError({
        message: "This file type isn't supported. Use JPG, PNG, SVG, MP4, MOV, AVI or WEBM.",
      });
      return;
    }
    if (limits?.maxBackgroundFileSize && file.size > limits.maxBackgroundFileSize) {
      setError({
        message: `This file is ${Math.ceil(file.size / (1024 * 1024))} MB. The limit is ${limitMb} MB.`,
      });
      return;
    }
    if (theme.id === undefined) {
      setError({ message: "Your theme was not found. Refresh the page, then upload again." });
      return;
    }
    try {
      setProgress(0);
      const presigned = await trpcClient.upload.requestThemeBackgroundUrl.mutate({
        contentType: file.type,
        fileExtension: file.name.split(".").pop()?.toLowerCase() || "",
        fileSize: file.size,
      });
      await putWithProgress(presigned.presignedUrl, file, setProgress);
      await trpcClient.upload.confirmThemeBackgroundUpload.mutate({
        fileId: presigned.fileId,
        fileName: file.name,
        mediaType: presigned.mediaType as "image" | "video",
      });
      // The server stored the background on the theme; refetch shows Your upload
      if (profile.handle) await setUser(profile.handle);
    } catch (e) {
      const text = e instanceof Error ? e.message : "";
      if (text === "too-large" || text.includes("413")) {
        setError({
          message: limitMb
            ? `This file is ${Math.ceil(file.size / (1024 * 1024))} MB. The limit is ${limitMb} MB.`
            : "This file is too large.",
        });
      } else if (text.includes("NOT_FOUND") || text.includes("Theme not found")) {
        setError({ message: "Your theme was not found. Refresh the page, then upload again." });
      } else {
        setError({
          message: "Upload stopped. Check your connection, then upload again.",
          retry: file,
        });
      }
    } finally {
      setProgress(null);
    }
  };

  const onDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setDragging(false);
    if (locked) return;
    const file = event.dataTransfer.files?.[0];
    if (file) void upload(file);
  };

  const onLinkChange = (value: string) => {
    setLink(value);
    setLinkError(undefined);
    const extension = value.split("?")[0].split(".").pop()?.toLowerCase() ?? "";
    setLinkType(VIDEO_EXTENSIONS.includes(extension) ? "video" : "image");
  };

  const validLink = /^https:\/\/\S+$/i.test(link.trim());

  return (
    <div className="space-y-[21px]">
      {/* I10: only when the current background is an upload */}
      {current?.fileId && (
        <div role="note" className="prism-notice flex items-start gap-3">
          <AlertTriangle
            aria-hidden
            className="mt-0.5 h-[21px] w-[21px] shrink-0 text-prism-warning-ink"
          />
          <div className="text-[16px] leading-6">
            <p className="font-bold text-prism-warning-ink">Uploading replaces your current file</p>
            <p className="text-prism-ink">
              Your current upload is deleted when the new file finishes.
            </p>
          </div>
        </div>
      )}

      {isLoading ? (
        <Skeleton delayMs={400} className="h-[89px] rounded-prism-13" />
      ) : (
        <div
          aria-busy={progress !== null}
          aria-describedby={error ? "background-upload-error" : "background-upload-help"}
          onDragOver={event => {
            event.preventDefault();
            if (!locked) setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
          className={cn(
            "prism-well flex min-h-[89px] flex-col items-center justify-center gap-2 px-4 py-3 text-center",
            dragging && "!shadow-[0_0_0_1.5px_#5650A2]"
          )}
        >
          <Button
            variant="secondary"
            disabled={locked || progress !== null}
            onClick={() => inputRef.current?.click()}
          >
            <Upload aria-hidden />
            <span aria-live="polite" className="tabular-nums">
              {progress !== null ? `Uploading ${progress}%` : "Upload image or video"}
            </span>
          </Button>
          <input
            ref={inputRef}
            type="file"
            className="hidden"
            accept={ALLOWED_BACKGROUND_FILE_EXTENSIONS.map(e => `.${e}`).join(",")}
            onChange={event => {
              const file = event.target.files?.[0];
              event.target.value = "";
              if (file) void upload(file);
            }}
          />
          <p id="background-upload-help" className="text-prism-meta text-prism-ink-2 tabular-nums">
            JPG, PNG, SVG, MP4, MOV, AVI or WEBM{limitMb ? `, up to ${limitMb} MB` : ""}
          </p>
          {error && (
            <div
              id="background-upload-error"
              role="alert"
              className="flex flex-col items-center gap-1 text-prism-meta text-prism-danger"
            >
              <span className="flex items-center gap-1.5">
                <AlertCircle aria-hidden className="h-[21px] w-[21px] shrink-0" />
                {error.message}
              </span>
              {error.retry && (
                <Button variant="ghost" size="sm" onClick={() => void upload(error.retry!)}>
                  Retry
                </Button>
              )}
            </div>
          )}
        </div>
      )}

      {/* I11: use a link */}
      <div className="space-y-3">
        <Input
          label="Or use a link"
          type="url"
          inputMode="url"
          value={link}
          disabled={locked}
          onChange={event => onLinkChange(event.target.value)}
          onBlur={() =>
            setLinkError(
              link && !validLink ? "Enter a full link that starts with https://." : undefined
            )
          }
          error={linkError}
        />
        <div className="flex flex-wrap items-center gap-2">
          <ChipGroup
            label="Link type"
            value={linkType}
            onChange={setLinkType}
            options={[
              { value: "image", label: "Image" },
              { value: "video", label: "Video" },
            ]}
          />
          <Button
            variant="secondary"
            disabled={locked || !validLink}
            onClick={() => {
              onLink({ type: linkType, value: link.trim(), label: "Your link" });
              setLink("");
            }}
          >
            Use link
          </Button>
        </div>
      </div>
    </div>
  );
}
