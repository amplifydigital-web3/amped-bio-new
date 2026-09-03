import { trpcClient } from "./trpc";
import { mapGetHandleData, type ProfilePageData } from "./profilePageData";

/**
 * Fetch a public profile page (user, theme, blocks) from the API server.
 * Returns null when the handle does not exist or the API is unreachable,
 * so callers can decide how to render (fallback or 404).
 */
export async function fetchProfilePageData(handle: string): Promise<ProfilePageData | null> {
  try {
    const onlinkData = await trpcClient.handle.getHandle.query({ handle });
    if (!onlinkData) return null;
    return mapGetHandleData(onlinkData, handle);
  } catch {
    return null;
  }
}
