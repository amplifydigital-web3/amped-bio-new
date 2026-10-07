// WordPress REST API client for the Amped.Bio blog.
// Posts are fetched at build/request time and revalidated every 10 minutes.

import { decodeHtmlEntities, htmlToText } from "@/lib/htmlEntities";

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
      alt_text?: string;
      media_details?: { sizes?: Record<string, { source_url: string }> };
    }>;
    "wp:term"?: Array<Array<{ id: number; name: string; slug: string }>>;
    author?: Array<{ name: string }>;
  };
}

/** Posts the index shows per page (Screen Review 072 I09). */
export const BLOG_PAGE_SIZE = 12;

export interface BlogPostsResult {
  posts: WordPressPost[];
  // Total pages from the X-WP-TotalPages header (1 when absent)
  totalPages: number;
  // True when WordPress did not answer, so the page can tell failed from empty (072 I08)
  failed: boolean;
}

/** Fetch one page of the latest published posts. */
export async function getBlogPosts(perPage = BLOG_PAGE_SIZE, page = 1): Promise<BlogPostsResult> {
  try {
    const res = await fetch(`${WP_API}/posts?per_page=${perPage}&page=${page}&_embed=1`, {
      next: { revalidate: BLOG_REVALIDATE_SECONDS },
      headers: { Accept: "application/json" },
    });
    // WordPress answers 400 for a page past the last one: an empty page, not a failure
    if (res.status === 400 && page > 1) return { posts: [], totalPages: page - 1, failed: false };
    if (!res.ok) return { posts: [], totalPages: 0, failed: true };
    const totalPages = Number(res.headers.get("X-WP-TotalPages") ?? "1") || 1;
    return { posts: (await res.json()) as WordPressPost[], totalPages, failed: false };
  } catch {
    return { posts: [], totalPages: 0, failed: true };
  }
}

/** Fetch a single post by slug. Returns null when it does not exist or on error. */
export async function getBlogPostBySlug(slug: string): Promise<WordPressPost | null> {
  try {
    const res = await fetch(`${WP_API}/posts?slug=${encodeURIComponent(slug)}&_embed=1`, {
      next: { revalidate: BLOG_REVALIDATE_SECONDS },
      headers: { Accept: "application/json" },
    });
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

/** Alt text of the featured image; empty when the media has none (072 I13). */
export function getPostFeaturedAlt(post: WordPressPost): string {
  return post._embedded?.["wp:featuredmedia"]?.[0]?.alt_text ?? "";
}

/** The post title as plain text with entities decoded (072 I10). */
export function getPostTitle(post: WordPressPost): string {
  return decodeHtmlEntities(post.title.rendered).trim();
}

/**
 * Cover image for a post: the WordPress featured image when set, otherwise a
 * generated branded image served by the /og route (same design as the OG).
 */
export function getPostCoverImage(post: WordPressPost): string {
  return getPostFeaturedImage(post) ?? `/og?title=${encodeURIComponent(getPostTitle(post))}`;
}

/** First assigned category, hidden when it is the WordPress default (072 I06). */
export function getPostCategory(
  post: WordPressPost
): { id: number; name: string; slug: string } | undefined {
  const category = post._embedded?.["wp:term"]?.[0]?.[0];
  if (!category || category.slug === "uncategorized") return undefined;
  return { ...category, name: decodeHtmlEntities(category.name) };
}

/** Plain-text version of rendered HTML, entities decoded (072 I10). */
export function stripHtml(html: string): string {
  return htmlToText(html);
}

/** Meta date, for example "Sep 26, 2026" (072 I06). */
export function formatPostDate(date: string): string {
  return new Intl.DateTimeFormat("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  }).format(new Date(date));
}

/** What a post card needs; also the JSON the Load more route returns. */
export interface BlogPostCard {
  id: number;
  slug: string;
  title: string;
  excerpt: string;
  date: string;
  dateLabel: string;
  category: string | null;
  cover: string;
}

export function toPostCard(post: WordPressPost): BlogPostCard {
  return {
    id: post.id,
    slug: post.slug,
    title: getPostTitle(post),
    excerpt: stripHtml(post.excerpt.rendered),
    date: post.date,
    dateLabel: formatPostDate(post.date),
    category: getPostCategory(post)?.name ?? null,
    cover: getPostCoverImage(post),
  };
}
