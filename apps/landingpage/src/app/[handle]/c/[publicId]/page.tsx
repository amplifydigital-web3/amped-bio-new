import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CONTENT_PUBLIC_ID_REGEX } from "@repo/constants";
import { ContentShell } from "@/components/content/ContentShell";
import { ItemPageView } from "@/components/content/ItemPageView";
import { JsonLd } from "@/components/seo/JsonLd";
import { normalizeHandle } from "@/lib/handle";
import { fetchProfilePageResult } from "@/lib/getProfileData";
import { fetchPublicItem } from "@/lib/getContentData";
import {
  buildContentItemJsonLd,
  contentItemDescription,
  contentItemTitle,
  contentItemUrl,
} from "@/lib/contentSeo";

// Signed cover URLs expire, so the page renders per request
export const dynamic = "force-dynamic";

interface ItemPageProps {
  params: Promise<{ handle: string; publicId: string }>;
}

async function resolveItem(params: ItemPageProps["params"]) {
  const { handle: rawHandle, publicId } = await params;
  const handle = normalizeHandle(rawHandle);
  if (!CONTENT_PUBLIC_ID_REGEX.test(publicId)) notFound();
  const result = await fetchPublicItem(handle, publicId);
  if (result.status === "not_found") notFound();
  if (result.status === "error")
    throw new Error(`Content service unavailable for ${handle}/${publicId}`);
  return { handle, item: result.data };
}

export async function generateMetadata({ params }: ItemPageProps): Promise<Metadata> {
  const { handle, item } = await resolveItem(params);
  const title = contentItemTitle(item);
  const description = contentItemDescription(item);
  const url = contentItemUrl(handle, item.publicId);
  const image = item.cover?.src;
  return {
    title,
    description,
    alternates: { canonical: url },
    robots: { index: true, follow: true },
    openGraph: {
      type:
        item.kind === "video" ? "video.other" : item.kind === "audio" ? "music.song" : "article",
      siteName: "Amped.Bio",
      url,
      title,
      description,
      ...(image ? { images: [{ url: image }] } : {}),
    },
    twitter: { card: image ? "summary_large_image" : "summary", title, description },
  };
}

export default async function ContentItemPage({ params }: ItemPageProps) {
  const { handle, item } = await resolveItem(params);
  const profile = await fetchProfilePageResult(handle);
  const theme = profile.status === "found" ? profile.data.theme?.config : undefined;
  return (
    <>
      <JsonLd data={buildContentItemJsonLd(item)} />
      <ContentShell theme={theme}>
        <ItemPageView item={item} />
      </ContentShell>
    </>
  );
}
