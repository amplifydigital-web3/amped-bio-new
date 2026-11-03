import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ContentShell } from "@/components/content/ContentShell";
import { StoreOwnerPreview, StorefrontView } from "@/components/store/StoreViews";
import { normalizeHandle } from "@/lib/handle";
import { fetchProfilePageResult } from "@/lib/getProfileData";
import { fetchStore } from "@/lib/getStoreData";

// Signed cover URLs expire, so the page renders per request
export const dynamic = "force-dynamic";

interface StorePageProps {
  params: Promise<{ handle: string }>;
  searchParams: Promise<{ preview?: string }>;
}

async function resolve(props: StorePageProps) {
  const handle = normalizeHandle((await props.params).handle);
  const preview = (await props.searchParams).preview === "1";
  const result = await fetchStore(handle);
  if (result.status === "error") throw new Error(`Store service unavailable for ${handle}`);
  if (result.status === "not_found" && !preview) notFound();
  return { handle, store: result.status === "found" ? result.data : null };
}

export async function generateMetadata(props: StorePageProps): Promise<Metadata> {
  const { handle, store } = await resolve(props);
  if (!store) return { title: "Store | Amped.Bio", robots: { index: false, follow: false } };
  const title = `${store.name} store | Amped.Bio`;
  const description = store.tagline ?? `Products from ${store.name} on Amped.Bio.`;
  return {
    title,
    description,
    alternates: { canonical: `/${handle}/store` },
    openGraph: {
      type: "website",
      siteName: "Amped.Bio",
      url: `/${handle}/store`,
      title,
      description,
    },
  };
}

/** The creator's store (C9; content spec 3.8, boards s2 and st7). */
export default async function StorePage(props: StorePageProps) {
  const { handle, store } = await resolve(props);
  const profile = await fetchProfilePageResult(handle);
  const theme = profile.status === "found" ? profile.data.theme?.config : undefined;
  return (
    <ContentShell theme={theme} width="wide">
      {store ? <StorefrontView store={store} /> : <StoreOwnerPreview handle={handle} />}
    </ContentShell>
  );
}
