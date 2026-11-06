import { cache } from "react";
import { TRPCClientError } from "@trpc/client";
import type { StorePolicyPublic, StoreProductPublic, StorePublic } from "@repo/constants";
import { trpcClient } from "./trpc";
import type { ContentResult } from "./getContentData";

function classify(error: unknown): { status: "not_found" } | { status: "error" } {
  if (error instanceof TRPCClientError) {
    const code = (error.data as { code?: string } | undefined)?.code;
    if (code === "NOT_FOUND" || code === "BAD_REQUEST") return { status: "not_found" };
  }
  return { status: "error" };
}

/**
 * Store reads for the server render (C9). The server request carries no viewer cookies, so a
 * store that is not live, or with store sales off, is not found here; its owner previews it
 * through the client (StoreOwnerPreview).
 */
export const fetchStore = cache(async (handle: string): Promise<ContentResult<StorePublic>> => {
  try {
    return { status: "found", data: await trpcClient.store.public.query({ handle }) };
  } catch (error) {
    return classify(error);
  }
});

export const fetchStoreProduct = cache(
  async (handle: string, slug: string): Promise<ContentResult<StoreProductPublic>> => {
    try {
      return { status: "found", data: await trpcClient.store.product.query({ handle, slug }) };
    } catch (error) {
      return classify(error);
    }
  }
);

export const fetchStorePolicy = cache(
  async (handle: string, v?: number): Promise<ContentResult<StorePolicyPublic>> => {
    try {
      return { status: "found", data: await trpcClient.store.publicPolicy.query({ handle, v }) };
    } catch (error) {
      return classify(error);
    }
  }
);
