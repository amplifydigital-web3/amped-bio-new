/**
 * Attaching a signed source to a media element (Fan Library #26, spec 3.5).
 *
 * Video plays the Cloudflare Stream HLS manifest: natively on Safari and iOS,
 * through hls.js elsewhere. hls.js is imported only when it is needed, so pages
 * that play nothing, and Safari, never load it.
 *
 * Every Stream segment URL carries the signed token, so when the token nears
 * expiry the player swaps in a fresh manifest URL and keeps its place.
 */
import type { PlayerCaption, PlayerSource } from "./types";

type HlsInstance = {
  loadSource(url: string): void;
  attachMedia(media: HTMLMediaElement): void;
  destroy(): void;
  on(event: string, handler: (...args: unknown[]) => void): void;
};

export interface Attachment {
  /** Point the element at fresh URLs for the same item without losing its place. */
  swap(source: PlayerSource): Promise<void>;
  detach(): void;
}

export function canPlayHlsNatively(media: HTMLMediaElement): boolean {
  return media.canPlayType("application/vnd.apple.mpegurl") !== "";
}

/** Replaces the element's caption tracks (audio; video captions come from the manifest). */
export function setTrackElements(media: HTMLMediaElement, captions: PlayerCaption[] | undefined) {
  media.querySelectorAll("track[data-amped]").forEach(track => track.remove());
  for (const caption of captions ?? []) {
    if (!caption.src) continue;
    const track = document.createElement("track");
    track.kind = "subtitles";
    track.srclang = caption.lang;
    track.label = caption.label;
    track.src = caption.src;
    track.dataset.amped = "1";
    media.appendChild(track);
  }
}

async function loadHls(): Promise<{
  new (config: Record<string, unknown>): HlsInstance;
  isSupported(): boolean;
  Events: Record<string, string>;
} | null> {
  try {
    const module = await import("hls.js");
    return (module.default ?? module) as never;
  } catch {
    return null;
  }
}

/** Restores the position and play state after a src change. */
function keepPlace(media: HTMLMediaElement, atSeconds: number, resume: boolean) {
  const restore = () => {
    if (Number.isFinite(atSeconds) && atSeconds > 0) media.currentTime = atSeconds;
    if (resume) void media.play().catch(() => {});
  };
  if (media.readyState >= 1) restore();
  else media.addEventListener("loadedmetadata", restore, { once: true });
}

export async function attachSource(
  media: HTMLMediaElement,
  source: PlayerSource,
  onFatal: () => void
): Promise<Attachment> {
  if (source.kind === "audio") {
    media.crossOrigin = "anonymous";
    setTrackElements(media, source.captions);
    media.src = source.src;
    return {
      async swap(next) {
        if (next.kind !== "audio") return;
        const at = media.currentTime;
        const resume = !media.paused;
        setTrackElements(media, next.captions);
        media.src = next.src;
        keepPlace(media, at, resume);
      },
      detach() {
        media.removeAttribute("src");
        setTrackElements(media, []);
        media.load();
      },
    };
  }

  if (canPlayHlsNatively(media)) {
    media.src = source.hls;
    return {
      async swap(next) {
        if (next.kind !== "video") return;
        const at = media.currentTime;
        const resume = !media.paused;
        media.src = next.hls;
        keepPlace(media, at, resume);
      },
      detach() {
        media.removeAttribute("src");
        media.load();
      },
    };
  }

  const Hls = await loadHls();
  if (!Hls || !Hls.isSupported()) {
    onFatal();
    return { async swap() {}, detach() {} };
  }
  let hls = new Hls({ enableWorker: true, lowLatencyMode: false, capLevelToPlayerSize: true });
  const watch = (instance: HlsInstance) =>
    instance.on(Hls.Events.ERROR ?? "hlsError", (_event: unknown, data: unknown) => {
      if ((data as { fatal?: boolean } | undefined)?.fatal) onFatal();
    });
  watch(hls);
  hls.loadSource(source.hls);
  hls.attachMedia(media);
  return {
    async swap(next) {
      if (next.kind !== "video") return;
      const at = media.currentTime;
      const resume = !media.paused;
      hls.destroy();
      hls = new Hls({
        enableWorker: true,
        lowLatencyMode: false,
        capLevelToPlayerSize: true,
        startPosition: at,
      });
      watch(hls);
      hls.loadSource(next.hls);
      hls.attachMedia(media);
      if (resume) void media.play().catch(() => {});
    },
    detach() {
      hls.destroy();
      media.removeAttribute("src");
      media.load();
    },
  };
}
