/**
 * Fan Library addresses (Build Board #26, spec 3.5 Destinations and 3.2 Route).
 * The editor owns /:panel; the Library also keeps the sub paths below, so the
 * Editor asks `isLibraryPath` before it normalizes the URL to /library.
 */
import { CONTENT_PUBLIC_ID_REGEX, HANDLE_REGEX } from "@repo/constants";

export const LIBRARY_PATHS = {
  home: "/library",
  search: "/library/search",
  creators: "/library/creators",
  saved: "/library/saved",
  /** FL-7: Memberships; `?m={id}` opens one membership's Manage sheet */
  memberships: "/library/memberships",
  creator: (handle: string) => `/library/@${handle}`,
  item: (handle: string, publicId: string) => `/library/@${handle}/c/${publicId}`,
} as const;

export type LibraryRoute =
  | { view: "home" }
  | { view: "search" }
  | { view: "creators" }
  | { view: "saved" }
  | { view: "memberships" }
  | { view: "creator"; handle: string }
  | { view: "item"; handle: string; publicId: string };

/** The Library view for a pathname, or null when the path is not one of ours. */
export function parseLibraryPath(pathname: string): LibraryRoute | null {
  const parts = pathname.replace(/\/+$/, "").split("/").filter(Boolean);
  if (parts[0] !== "library") return null;
  if (parts.length === 1) return { view: "home" };
  const [, second, third, fourth] = parts;
  if (parts.length === 2 && second === "search") return { view: "search" };
  if (parts.length === 2 && second === "creators") return { view: "creators" };
  if (parts.length === 2 && second === "saved") return { view: "saved" };
  if (parts.length === 2 && second === "memberships") return { view: "memberships" };
  if (!second?.startsWith("@")) return null;
  const handle = decodeURIComponent(second.slice(1)).toLowerCase();
  if (!HANDLE_REGEX.test(handle) || handle.length > 64) return null;
  if (parts.length === 2) return { view: "creator", handle };
  if (parts.length === 4 && third === "c" && fourth && CONTENT_PUBLIC_ID_REGEX.test(fourth)) {
    return { view: "item", handle, publicId: fourth };
  }
  return null;
}

/** True for /library and every Library sub path the panel serves. */
export function isLibraryPath(pathname: string) {
  return parseLibraryPath(pathname) !== null;
}
