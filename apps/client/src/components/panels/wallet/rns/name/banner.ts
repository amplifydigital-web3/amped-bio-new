import { z } from "zod";

// banner and banner.meta records on an RNS name (102 I11).

export type BannerFit = "cover" | "contain";
export type BannerDraft = {
  url: string | null;
  file: File | null;
  fit: BannerFit;
  x: number;
  y: number;
  scale: number;
};

const MetaSchema = z.object({
  fit: z.enum(["cover", "contain"]).default("cover"),
  focusX: z.number().min(0).max(100).default(50),
  focusY: z.number().min(0).max(100).default(50),
  scale: z.number().min(1).max(2).default(1),
});

/** banner.meta: fit, focus and zoom, the format the name page has always written. */
export function parseBannerMeta(raw: string | undefined) {
  try {
    if (raw) {
      const meta = MetaSchema.parse(JSON.parse(raw));
      return { fit: meta.fit as BannerFit, x: meta.focusX, y: meta.focusY, scale: meta.scale };
    }
  } catch {
    // malformed meta falls back to the defaults
  }
  return { fit: "cover" as BannerFit, x: 50, y: 50, scale: 1 };
}

export const toBannerMeta = (draft: BannerDraft) =>
  JSON.stringify({ fit: draft.fit, focusX: draft.x, focusY: draft.y, scale: draft.scale });

export function bannerStyle(url: string | null | undefined, meta: string | undefined) {
  if (!url) return undefined;
  const { fit, x, y, scale } = parseBannerMeta(meta);
  return {
    backgroundImage: `url(${url})`,
    backgroundSize: fit === "contain" ? "contain" : scale === 1 ? "cover" : `${scale * 100}%`,
    backgroundPosition: `${x}% ${y}%`,
    backgroundRepeat: "no-repeat",
  } as React.CSSProperties;
}
