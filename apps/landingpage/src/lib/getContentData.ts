import { cache } from "react";
import { TRPCClientError } from "@trpc/client";
import type { ContentFeedPage, ContentPublicItem, ContentUploadKind } from "@repo/constants";
import { trpcClient } from "./trpc";

export type ContentResult<T> =
  | { status: "found"; data: T }
  | { status: "not_found" }
  | { status: "error" };

function classify(error: unknown): { status: "not_found" } | { status: "error" } {
  if (error instanceof TRPCClientError) {
    const code = (error.data as { code?: string } | undefined)?.code;
    if (code === "NOT_FOUND" || code === "BAD_REQUEST") return { status: "not_found" };
  }
  return { status: "error" };
}

/**
 * The item page's data (spec 3.7). Public items only: the server request carries
 * no viewer cookies, so a draft or an 18+ item is never rendered on the server.
 */
export const fetchPublicItem = cache(
  async (handle: string, publicId: string): Promise<ContentResult<ContentPublicItem>> => {
    try {
      return {
        status: "found",
        data: await trpcClient.content.getPublic.query({ handle, publicId }),
      };
    } catch (error) {
      return classify(error);
    }
  }
);

export const fetchFeed = cache(
  async (handle: string, kind?: ContentUploadKind): Promise<ContentResult<ContentFeedPage>> => {
    try {
      return {
        status: "found",
        data: await trpcClient.content.feed.query({ handle, kind, limit: 24 }),
      };
    } catch (error) {
      return classify(error);
    }
  }
);

export async function fetchContentSitemapCount(): Promise<number> {
  try {
    return (await trpcClient.content.getSitemapCount.query()).total;
  } catch (error) {
    console.error("[sitemap] Failed to load content count:", error);
    return 0;
  }
}

export async function fetchContentSitemapEntries(page: number, pageSize: number) {
  try {
    return await trpcClient.content.getSitemapEntries.query({ page, pageSize });
  } catch (error) {
    console.error(`[sitemap] Failed to load content page ${page}:`, error);
    return [];
  }
}
