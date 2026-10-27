import { useMemo } from "react";
import type { LinkBlock } from "@repo/constants";
import { useEditor } from "@/contexts/EditorContext";
import { publicPageUrl } from "@/components/shell/pageLink";
import { RNS_RECORD_KEYS, type RnsRecordKey, type RnsRecords } from "./useRnsName";

/** A banner the owner changed on the name page and has not published yet (102 I11). */
export type PendingBanner = {
  /** blob URL while a new file waits for upload, else the published URL, else null to remove */
  url: string | null;
  file: File | null;
  meta: string;
};

export type PublishRow = {
  key: RnsRecordKey;
  label: string;
  from: string;
  to: string;
  /** Photo and banner rows show thumbnails instead of the URLs */
  image?: boolean;
};

const LABELS: Record<RnsRecordKey, string> = {
  avatar: "Photo",
  banner: "Banner",
  bannerMeta: "Banner position",
  bio: "Bio",
  url: "Amped.Bio page link",
  links: "Links",
};

/** The Amped.Bio bio is rich text; RNS readers get plain text (102 D1). */
export function bioToPlainText(html: string): string {
  if (!html) return "";
  const doc = new DOMParser().parseFromString(
    html.replace(/<br\s*\/?>/gi, "\n").replace(/<\/p>/gi, "</p>\n"),
    "text/html"
  );
  return (doc.body.textContent ?? "")
    .split("\n")
    .map(line => line.replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .join("\n");
}

/**
 * Screen Review 102 D1, 111 I08: what Publish changes writes. The Amped.Bio
 * profile is the source: photo to avatar, bio as plain text to description,
 * the page link to url, the first three visible link blocks to links. The
 * banner joins only when the owner changed it on the name page.
 */
export function usePublishDiff(records: RnsRecords, banner: PendingBanner | null) {
  const { profile, blocks } = useEditor();

  return useMemo(() => {
    const links = (blocks ?? [])
      .filter((block): block is LinkBlock => block.type === "link")
      .filter(block => !block.config.hidden && !!block.config.url)
      .sort((a, b) => a.order - b.order)
      .slice(0, 3)
      .map(block => block.config.url.trim());

    const source: RnsRecords = {
      avatar: profile.photoUrl ?? "",
      bio: bioToPlainText(profile.bio ?? ""),
      url: profile.handle ? publicPageUrl(profile.handle) : "",
      links: links.join(","),
    };
    if (banner) {
      source.banner = banner.url ?? "";
      source.bannerMeta = banner.url ? banner.meta : "";
    }

    const rows: PublishRow[] = [];
    (Object.keys(source) as RnsRecordKey[]).forEach(key => {
      const to = source[key] ?? "";
      const from = records[key] ?? "";
      // A pending banner file always counts, even when its blob URL is new
      const changed = key === "banner" && banner?.file ? true : from !== to;
      if (!changed) return;
      rows.push({
        key,
        label: LABELS[key],
        from,
        to,
        image: key === "avatar" || key === "banner",
      });
    });

    return { rows, source, recordKey: (key: RnsRecordKey) => RNS_RECORD_KEYS[key] };
  }, [banner, blocks, profile.bio, profile.handle, profile.photoUrl, records]);
}
