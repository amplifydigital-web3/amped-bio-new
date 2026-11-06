// Theme Engine v2 TE-4b, Share this look (spec 3.10, boards 12, 12m, 13).

export interface ShareState {
  slug: string | null;
  credit: boolean;
  download: boolean;
  uses: number;
}

/** The public link for a slug: amped.bio/t/<slug> on production. */
export function shareUrl(
  slug: string,
  base: string = import.meta.env.VITE_LANDINGPAGE_URL ?? ""
): string {
  return `${base.replace(/\/+$/, "")}/t/${slug}`;
}

/** The usage line under the switches. */
export function shareUsesLine(uses: number): string {
  if (uses <= 0) return "No one has used this look yet.";
  return uses === 1 ? "Used once." : `Used ${uses.toLocaleString("en-US")} times.`;
}

/** Stop sharing asks once in place: the button reads Confirm stop sharing for 5 s. */
export const CONFIRM_STOP_MS = 5000;
/** Copied shows for 2 s. */
export const COPIED_MS = 2000;

export const SHARE_COPY = {
  title: "Share this look",
  intro:
    "Anyone with the link can see this look and use it on their page. Your photo, name, bio and links are never shared.",
  credit: "Show my handle",
  creditHelp: "Your handle shows on the link page as Made by.",
  download: "Let people download the file",
  downloadHelp: "Adds Download .ampedtheme to the link page.",
  create: "Create link",
  copy: "Copy link",
  copied: "Copied",
  copiedStatus: "Link copied.",
  stop: "Stop sharing",
  confirmStop: "Confirm stop sharing",
  stopped: "Sharing stopped. The link no longer opens.",
  done: "Done",
  cancel: "Cancel",
  failed: "That didn't work. Try again.",
} as const;
