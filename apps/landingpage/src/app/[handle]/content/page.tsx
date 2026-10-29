import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CONTENT_UPLOAD_KINDS, type ContentUploadKind } from "@repo/constants";
import { ContentShell } from "@/components/content/ContentShell";
import { FeedPageView } from "@/components/content/FeedPageView";
import { JsonLd } from "@/components/seo/JsonLd";
import { normalizeHandle } from "@/lib/handle";
import { fetchProfilePageResult } from "@/lib/getProfileData";
import { fetchFeed } from "@/lib/getContentData";
import { buildContentFeedJsonLd, contentFeedUrl } from "@/lib/contentSeo";

// Signed cover URLs expire, so the page renders per request
export const dynamic = "force-dynamic";

interface FeedPageProps {
  params: Promise<{ handle: string }>;
  searchParams: Promise<{ kind?: string }>;
}

function kindFrom(value: string | undefined): ContentUploadKind | null {
  return value && (CONTENT_UPLOAD_KINDS as readonly string[]).includes(value)
    ? (value as ContentUploadKind)
    : null;
}

async function resolveFeed(props: FeedPageProps) {
  const handle = normalizeHandle((await props.params).handle);
  const kind = kindFrom((await props.searchParams).kind);
  const result = await fetchFeed(handle, kind ?? undefined);
  if (result.status === "not_found") notFound();
  if (result.status === "error") throw new Error(`Content service unavailable for ${handle}`);
  return { handle, kind, feed: result.data };
}

export async function generateMetadata(props: FeedPageProps): Promise<Metadata> {
  const { handle, kind, feed } = await resolveFeed(props);
  const name = feed.creator.name?.trim() || `@${handle}`;
  const title = `${name} content | Amped.Bio`;
  const description = `Videos, audio, images and files from ${name} on Amped.Bio.`;
  // Indexed when the creator has a public item (spec 3.7); filtered views point at the full feed
  const indexable = feed.items.length > 0 && !kind;
  return {
    title,
    description,
    alternates: { canonical: contentFeedUrl(handle) },
    robots: indexable ? { index: true, follow: true } : { index: false, follow: true },
    openGraph: {
      type: "website",
      siteName: "Amped.Bio",
      url: contentFeedUrl(handle),
      title,
      description,
    },
  };
}

export default async function ContentFeedPage(props: FeedPageProps) {
  const { handle, kind, feed } = await resolveFeed(props);
  const profile = await fetchProfilePageResult(handle);
  const theme = profile.status === "found" ? profile.data.theme?.config : undefined;
  return (
    <>
      {feed.items.length > 0 && !kind && <JsonLd data={buildContentFeedJsonLd(feed)} />}
      <ContentShell theme={theme} width="wide">
        <FeedPageView key={kind ?? "all"} initial={feed} kind={kind} />
      </ContentShell>
    </>
  );
}
