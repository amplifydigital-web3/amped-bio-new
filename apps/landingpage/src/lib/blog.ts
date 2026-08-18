// WordPress REST API client for the Amped Bio blog.
// Posts are fetched at build/request time and revalidated every 10 minutes.

export const WORDPRESS_URL =
  process.env.NEXT_PUBLIC_WORDPRESS_URL ?? "https://onboarding.ampedbio.com";

const WP_API = `${WORDPRESS_URL}/wp-json/wp/v2`;

/** How long (seconds) WordPress responses are kept in the Next.js cache. */
export const BLOG_REVALIDATE_SECONDS = 600;

export interface WordPressPost {
  id: number;
  slug: string;
  link: string;
  date: string;
  modified: string;
  title: { rendered: string };
  excerpt: { rendered: string; protected: boolean };
  content: { rendered: string; protected: boolean };
  featured_media: number;
  categories: number[];
  _embedded?: {
    "wp:featuredmedia"?: Array<{
      source_url?: string;
      media_details?: { sizes?: Record<string, { source_url: string }> };
    }>;
    "wp:term"?: Array<Array<{ id: number; name: string; slug: string }>>;
    author?: Array<{ name: string }>;
  };
}

/** Fetch the latest published posts. Returns [] when WordPress is unreachable. */
export async function getBlogPosts(perPage = 20): Promise<WordPressPost[]> {
  try {
    const res = await fetch(`${WP_API}/posts?per_page=${perPage}&_embed=1`, {
      next: { revalidate: BLOG_REVALIDATE_SECONDS },
      headers: { Accept: "application/json" },
    });
    if (!res.ok) return [];
    return (await res.json()) as WordPressPost[];
  } catch {
    return [];
  }
}

/** Fetch a single post by slug. Returns null when it does not exist or on error. */
export async function getBlogPostBySlug(slug: string): Promise<WordPressPost | null> {
  try {
    const res = await fetch(
      `${WP_API}/posts?slug=${encodeURIComponent(slug)}&_embed=1`,
      {
        next: { revalidate: BLOG_REVALIDATE_SECONDS },
        headers: { Accept: "application/json" },
      }
    );
    if (!res.ok) return null;
    const posts = (await res.json()) as WordPressPost[];
    return posts[0] ?? null;
  } catch {
    return null;
  }
}

/** Large preview version of the featured image, falling back to the original. */
export function getPostFeaturedImage(post: WordPressPost): string | undefined {
  const media = post._embedded?.["wp:featuredmedia"]?.[0];
  return media?.media_details?.sizes?.large?.source_url ?? media?.source_url ?? undefined;
}

/** First assigned category, if any. */
export function getPostCategory(post: WordPressPost):
  | { id: number; name: string; slug: string }
  | undefined {
  return post._embedded?.["wp:term"]?.[0]?.[0];
}

/** Plain-text version of a rendered HTML excerpt. */
export function stripHtml(html: string): string {
  return html
    .replace(/<[^>]*>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
}

/** Human-readable date, e.g. "March 22, 2023". */
export function formatPostDate(date: string): string {
  return new Intl.DateTimeFormat("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  }).format(new Date(date));
}
