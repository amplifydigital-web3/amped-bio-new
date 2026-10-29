import { useCallback, useId, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Captions, Loader2, Plus, X } from "lucide-react";
import {
  MediaPlayer,
  ChapterList,
  Notice,
  cn,
  queryClient,
  requirePlayerSource,
  trpc,
  trpcClient,
  type PlayerItem,
} from "@repo/ui";
import { CONTENT_CAPTIONS, captionLabel, type ContentPlayback } from "@repo/constants";
import { CONTENT_COPY } from "./copy";

const e = CONTENT_COPY.editor;

/** Common caption languages offered first; any BCP 47 code works on the API. */
export const CAPTION_LANGS = ["en", "es", "fr", "de", "pt-BR", "it", "ja", "ko", "zh", "ar", "hi"];

interface MediaItem {
  publicId: string;
  kind: string;
  title: string;
  status: string;
  moderationState: string;
  durationMs: number | null;
  chapters: unknown;
  assets?: Array<{ role: string; lang: string | null }>;
}

function chaptersOf(value: unknown): PlayerItem["chapters"] {
  return Array.isArray(value)
    ? value.filter(
        (chapter): chapter is { startMs: number; title: string } =>
          typeof chapter?.startMs === "number" && typeof chapter?.title === "string"
      )
    : null;
}

/** Fresh signed URLs, never from the cache: they expire. */
async function freshPlayback(publicId: string): Promise<ContentPlayback | null> {
  const result = await trpcClient.content.getReadUrl.query({ publicId });
  return result.playback;
}

/**
 * Preview (fan library row 128 in the editor): the creator plays, views or
 * pages through their own item before anyone else can. Video and audio use the
 * shared player, so what plays here plays the same on the public page.
 */
export function ItemPreview({ item }: { item: MediaItem }) {
  const headingId = useId();
  const ready = item.status === "ready" && item.moderationState !== "blocked";
  const timed = item.kind === "video" || item.kind === "audio";
  // The cover, poster or pages for display. Playback asks again for fresh URLs.
  const display = useQuery({
    ...trpc.content.getReadUrl.queryOptions({ publicId: item.publicId }),
    enabled: ready,
    staleTime: 4 * 60 * 1000,
    retry: 1,
  });
  const resolve = useCallback(
    async () => requirePlayerSource(await freshPlayback(item.publicId)),
    [item.publicId]
  );
  if (!ready || item.kind === "file") return null;

  const playback = display.data?.playback ?? null;
  const playerItem: PlayerItem = {
    id: item.publicId,
    kind: item.kind === "audio" ? "audio" : "video",
    title: item.title,
    subtitle: e.previewSubtitle,
    artwork: playback?.cover?.src ?? null,
    durationMs: item.durationMs,
    chapters: chaptersOf(item.chapters),
  };

  return (
    <section aria-labelledby={headingId} className="space-y-[13px]">
      <div>
        <h3 id={headingId} className="text-prism-label font-semibold text-prism-ink">
          {e.preview}
        </h3>
        <p className="text-prism-meta text-prism-ink-2">{e.previewHelp}</p>
      </div>
      {timed ? (
        <>
          <MediaPlayer
            item={playerItem}
            resolve={resolve}
            poster={playback?.video?.poster ?? playback?.cover?.src ?? null}
            showResume={false}
          />
          <ChapterList item={playerItem} resolve={resolve} className="text-prism-ink" />
        </>
      ) : display.isError ? (
        <p className="text-prism-meta text-prism-ink-2">{e.previewError}</p>
      ) : item.kind === "image" && playback?.image ? (
        // eslint-disable-next-line jsx-a11y/alt-text
        <img
          src={playback.image.src}
          srcSet={playback.image.srcSet || undefined}
          sizes="(min-width: 1024px) 600px, 100vw"
          alt={item.title}
          className="max-h-[480px] w-full rounded-prism-13 bg-white/60 object-contain"
        />
      ) : item.kind === "document" && playback?.document ? (
        <div className="flex gap-[8px] overflow-x-auto pb-1">
          {playback.document.pages.map((page, index) => (
            <img
              key={page}
              src={page}
              alt={e.pageAlt(index + 1)}
              className="h-[233px] w-auto shrink-0 rounded-prism-8 border border-prism-line bg-white"
            />
          ))}
        </div>
      ) : (
        <div className="h-[144px] animate-pulse rounded-prism-13 bg-white/60 motion-reduce:animate-none" />
      )}
    </section>
  );
}

/**
 * Captions (fan library spec 3.5): one WebVTT file per language, up to five.
 * Video captions go to Stream and play in every player; audio captions show
 * under the audio player.
 */
export function CaptionsSection({ item }: { item: MediaItem }) {
  const headingId = useId();
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [lang, setLang] = useState("en");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  if (item.kind !== "video" && item.kind !== "audio") return null;

  const tracks = (item.assets ?? [])
    .filter(asset => asset.role === "caption" && asset.lang)
    .map(asset => asset.lang!)
    .sort();
  const ready = item.status === "ready";
  const full = tracks.length >= CONTENT_CAPTIONS.maxTracks;
  const refresh = () =>
    queryClient.invalidateQueries({
      queryKey: trpc.content.get.queryKey({ publicId: item.publicId }),
    });

  const upload = async (file: File) => {
    setError(null);
    if (file.size > CONTENT_CAPTIONS.maxBytes) return setError(e.captionsTooLarge);
    setBusy(lang);
    try {
      const vtt = await file.text();
      await trpcClient.content.setCaptions.mutate({ publicId: item.publicId, lang, vtt });
      await refresh();
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : CONTENT_COPY.errors.generic);
    } finally {
      setBusy(null);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const remove = async (code: string) => {
    setError(null);
    setBusy(code);
    try {
      await trpcClient.content.removeCaptions.mutate({ publicId: item.publicId, lang: code });
      await refresh();
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : CONTENT_COPY.errors.generic);
    } finally {
      setBusy(null);
    }
  };

  return (
    <section aria-labelledby={headingId} className="space-y-2">
      <div className="flex items-baseline justify-between">
        <h3 id={headingId} className="text-prism-label font-semibold text-prism-ink">
          {e.captions}
        </h3>
        <span className="text-prism-meta text-prism-ink-2">{e.captionsCount(tracks.length)}</span>
      </div>
      {tracks.length > 0 && (
        <ul className="overflow-hidden rounded-prism-13 border border-prism-line bg-white/60">
          {tracks.map(code => (
            <li
              key={code}
              className="flex min-h-touch items-center gap-3 border-t border-prism-line px-[13px] first:border-t-0"
            >
              <Captions className="h-5 w-5 shrink-0 text-prism-ink-2" aria-hidden />
              <span className="min-w-0 flex-1 text-prism-label text-prism-ink">
                {captionLabel(code)}
              </span>
              <button
                type="button"
                aria-label={e.removeCaptions(captionLabel(code))}
                disabled={busy !== null}
                onClick={() => void remove(code)}
                className="prism-icon-btn prism-focus shrink-0"
              >
                {busy === code ? (
                  <Loader2
                    className="h-5 w-5 animate-spin motion-reduce:animate-none"
                    aria-hidden
                  />
                ) : (
                  <X className="h-5 w-5" aria-hidden />
                )}
              </button>
            </li>
          ))}
        </ul>
      )}
      <p className="text-prism-meta text-prism-ink-2">{ready ? e.captionsHelp : e.captionsLater}</p>
      {ready && !full && (
        <div className="flex flex-wrap items-center gap-2">
          <label className="sr-only" htmlFor={`${headingId}-lang`}>
            {e.captionsLanguage}
          </label>
          <select
            id={`${headingId}-lang`}
            value={lang}
            onChange={event => setLang(event.target.value)}
            className="prism-well prism-focus h-touch rounded-prism-8 px-2 text-prism-label text-prism-ink"
          >
            {CAPTION_LANGS.map(code => (
              <option key={code} value={code}>
                {captionLabel(code)}
              </option>
            ))}
          </select>
          <input
            ref={fileRef}
            type="file"
            accept=".vtt,text/vtt"
            className="sr-only"
            id={`${headingId}-file`}
            onChange={event => {
              const file = event.target.files?.[0];
              if (file) void upload(file);
            }}
          />
          <label
            htmlFor={`${headingId}-file`}
            className={cn(
              "prism-focus -ml-2 inline-flex h-touch cursor-pointer items-center gap-1 rounded-prism-8 px-2 text-prism-label font-semibold text-prism-nav hover:underline",
              busy !== null && "pointer-events-none opacity-60"
            )}
          >
            {busy === lang ? (
              <Loader2 className="h-5 w-5 animate-spin motion-reduce:animate-none" aria-hidden />
            ) : (
              <Plus className="h-5 w-5" aria-hidden />
            )}
            {tracks.includes(lang) ? e.replaceCaptions : e.addCaptions}
          </label>
        </div>
      )}
      {error && (
        <Notice variant="error" title={e.captionsFailed}>
          {error}
        </Notice>
      )}
    </section>
  );
}
