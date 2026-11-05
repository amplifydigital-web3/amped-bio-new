import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CONTENT_PUBLIC_ID_REGEX } from "@repo/constants";
import { ContentShell } from "@/components/content/ContentShell";
import { AdultItem } from "@/components/content/adult";
import { normalizeHandle } from "@/lib/handle";
import { fetchProfilePageResult } from "@/lib/getProfileData";

/**
 * One 18+ item page (adult content review 9, R6). An empty shell, filled from the
 * signed in content.getAdult after an Over 18 pass. No title, cover, JSON-LD or
 * share image in this HTML; never indexed.
 */
export const dynamic = "force-dynamic";

interface AdultItemPageProps {
  params: Promise<{ handle: string; publicId: string }>;
}

export const metadata: Metadata = {
  title: "Adult item | Amped.Bio",
  robots: { index: false, follow: false },
};

export default async function AdultItemPage({ params }: AdultItemPageProps) {
  const { handle: rawHandle, publicId } = await params;
  if (!CONTENT_PUBLIC_ID_REGEX.test(publicId)) notFound();
  const handle = normalizeHandle(rawHandle);
  const profile = await fetchProfilePageResult(handle);
  const theme = profile.status === "found" ? profile.data.theme?.config : undefined;
  return (
    <ContentShell theme={theme}>
      <AdultItem handle={handle} publicId={publicId} />
    </ContentShell>
  );
}
