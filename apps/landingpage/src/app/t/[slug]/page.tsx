import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { PublicPage } from "@/components/layout/PublicPage";
import { SharedLookView } from "@/components/look/SharedLookView";
import { getFeatureFlagOverrides, resolveLandingFlag } from "@/lib/featureFlags";
import { fetchSharedLook, sharedLookTitle, type SharedLook } from "@/lib/sharedLook";

// Theme Engine v2 TE-4b (spec 3.9, board 06): amped.bio/t/<slug>. Rendered per
// request so a stopped link returns 404 at once.
export const dynamic = "force-dynamic";

interface SharedLookPageProps {
  params: Promise<{ slug: string }>;
}

/** The look, or 404 (unknown, stopped, or sharing off). An unreachable API throws. */
async function resolveLook(slug: string): Promise<SharedLook> {
  const sharing = resolveLandingFlag("themeSharing", await getFeatureFlagOverrides());
  if (!sharing) notFound();
  const forwardedFor = (await headers()).get("x-forwarded-for");
  const result = await fetchSharedLook(slug, forwardedFor);
  if (result.status === "found") return result.data;
  if (result.status === "not_found") notFound();
  throw new Error("Theme service unavailable");
}

export async function generateMetadata({ params }: SharedLookPageProps): Promise<Metadata> {
  const look = await resolveLook((await params).slug);
  const title = `${sharedLookTitle(look)} · a look on Amped.Bio`;
  const description =
    "Use this look on your Amped.Bio page. It carries effects, fonts and colors, never code.";
  return {
    title,
    description,
    // Spec 3.9: indexable with the author credited; noindex when credit is off
    robots: look.author ? { index: true, follow: true } : { index: false, follow: true },
    openGraph: { type: "website", siteName: "Amped.Bio", title, description },
  };
}

export default async function SharedLookPage({ params }: SharedLookPageProps) {
  const look = await resolveLook((await params).slug);
  return (
    <PublicPage mainClassName="pb-[34px] pt-[21px] sm:pt-[34px]">
      <SharedLookView look={look} />
    </PublicPage>
  );
}
