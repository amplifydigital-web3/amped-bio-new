import { toast } from "@/components/ui/toast";

// Creator URLs read amped.bio/handle, with no @ (Rob, 30 Sep).
export function publicPageUrl(handle: string) {
  return `${import.meta.env.VITE_LANDINGPAGE_URL}/${handle}`;
}

/** The page address without the scheme: amped.bio/handle on production,
 *  the environment's host elsewhere (QA-015). */
export function publicPageAddress(handle: string) {
  return publicPageUrl(handle).replace(/^https?:\/\//, "");
}

/** Copies the public page URL and confirms with a toast (002 I04). */
export async function copyPageLink(handle: string) {
  try {
    await navigator.clipboard.writeText(publicPageUrl(handle));
    toast.add({ type: "success", title: "Link copied" });
  } catch {
    toast.add({ type: "error", title: "Could not copy the link" });
  }
}
