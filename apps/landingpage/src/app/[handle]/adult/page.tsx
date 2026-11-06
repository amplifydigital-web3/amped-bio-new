import type { Metadata } from "next";
import { ContentShell } from "@/components/content/ContentShell";
import { AdultShelf } from "@/components/content/adult";
import { normalizeHandle } from "@/lib/handle";
import { fetchProfilePageResult } from "@/lib/getProfileData";

/**
 * The 18+ shelf (adult content review 9, R6; identity checks 4.4). An empty shell:
 * the items load in the browser from the signed in content.listAdultForBio after
 * an Over 18 pass, so this HTML never holds an 18+ title, cover or count. Never
 * indexed, no share image.
 */
export const dynamic = "force-dynamic";

interface ShelfPageProps {
  params: Promise<{ handle: string }>;
}

export const metadata: Metadata = {
  title: "Adult items | Amped.Bio",
  robots: { index: false, follow: false },
};

export default async function AdultShelfPage({ params }: ShelfPageProps) {
  const handle = normalizeHandle((await params).handle);
  const profile = await fetchProfilePageResult(handle);
  const theme = profile.status === "found" ? profile.data.theme?.config : undefined;
  return (
    <ContentShell theme={theme} width="wide">
      <AdultShelf handle={handle} />
    </ContentShell>
  );
}
