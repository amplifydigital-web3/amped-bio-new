import { fetchProfileSitemapCount } from "@/lib/getSitemapData";
import { fetchContentSitemapCount } from "@/lib/getContentData";
import { PROFILE_SITEMAP_PAGE_SIZE, SITE_URL } from "@/lib/seo";

export const revalidate = 3600;

/**
 * Sitemap index. Next.js does not generate one for generateSitemaps, so it is
 * built here from the same profile count the profile sitemaps use.
 */
export async function GET() {
  const [total, contentTotal] = await Promise.all([
    fetchProfileSitemapCount(),
    fetchContentSitemapCount(),
  ]);
  const profileFiles = Math.max(1, Math.ceil(total / PROFILE_SITEMAP_PAGE_SIZE));
  // Public content items and feed pages (content system decision 23)
  const contentFiles = Math.ceil(contentTotal / PROFILE_SITEMAP_PAGE_SIZE);

  const locations = [
    `${SITE_URL}/sitemap.xml`,
    ...Array.from(
      { length: profileFiles },
      (_, id) => `${SITE_URL}/i/sitemaps/profiles/sitemap/${id}.xml`
    ),
    ...Array.from(
      { length: contentFiles },
      (_, id) => `${SITE_URL}/i/sitemaps/content/sitemap/${id}.xml`
    ),
  ];

  const body = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    ...locations.map(loc => `  <sitemap><loc>${loc}</loc></sitemap>`),
    "</sitemapindex>",
  ].join("\n");

  return new Response(body, {
    headers: { "Content-Type": "application/xml; charset=utf-8" },
  });
}
