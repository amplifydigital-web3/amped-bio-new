import { cache } from "react";
import type { ThemeConfig } from "@repo/constants";

/**
 * Theme Engine v2 TE-4b: the share link page's data (board 06), from the
 * public theme.bySlug. Read on the server for every request: a revoked link
 * must 404 at once, so nothing is cached across visitors.
 *
 * bySlug is limited to 60 a minute per visitor IP. The server forwards the
 * visitor's address so the limit counts the visitor, not this server
 * (services/analytics/visitorIp.ts trusts the hop when this server sits on a
 * private or Cloudflare address).
 */

export interface SharedLookCostPart {
  layer: string;
  label: string;
  cost: "light" | "heavy";
}

export interface SharedLook {
  slug: string;
  name: string;
  author: string | null;
  config: ThemeConfig;
  cost: { level: "still" | "light" | "heavy"; count: number; parts: SharedLookCostPart[] };
  uses: number;
  createdAt: string;
  download: boolean;
}

export type SharedLookResult =
  | { status: "found"; data: SharedLook }
  | { status: "not_found" }
  | { status: "error" };

/** The slug format theme.share makes: 8 base32 characters. */
export const SLUG_PATTERN = /^[a-z2-7]{8}$/;

export const fetchSharedLook = cache(
  async (slug: string, forwardedFor?: string | null): Promise<SharedLookResult> => {
    const normalized = slug.trim().toLowerCase();
    if (!SLUG_PATTERN.test(normalized)) return { status: "not_found" };
    const input = encodeURIComponent(JSON.stringify({ slug: normalized }));
    try {
      const response = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL ?? ""}/trpc/theme.bySlug?input=${input}`,
        {
          cache: "no-store",
          headers: forwardedFor ? { "x-forwarded-for": forwardedFor } : undefined,
          signal: AbortSignal.timeout(5_000),
        }
      );
      const body = (await response.json().catch(() => null)) as {
        result?: { data?: SharedLook };
        error?: { data?: { code?: string } };
      } | null;
      if (response.ok && body?.result?.data) return { status: "found", data: body.result.data };
      if (body?.error?.data?.code === "NOT_FOUND" || body?.error?.data?.code === "BAD_REQUEST") {
        return { status: "not_found" };
      }
      return { status: "error" };
    } catch {
      return { status: "error" };
    }
  }
);

/** "Northern Lights" or "Northern Lights by @alice", for the title and the page. */
export function sharedLookTitle(look: Pick<SharedLook, "name" | "author">): string {
  return look.author ? `${look.name} by @${look.author}` : look.name;
}
