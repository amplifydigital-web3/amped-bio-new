import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ContentShell } from "@/components/content/ContentShell";
import { StorePolicyView } from "@/components/store/StoreViews";
import { normalizeHandle } from "@/lib/handle";
import { fetchProfilePageResult } from "@/lib/getProfileData";
import { fetchStorePolicy } from "@/lib/getStoreData";

export const dynamic = "force-dynamic";

interface PolicyPageProps {
  params: Promise<{ handle: string }>;
  searchParams: Promise<{ v?: string }>;
}

async function resolve(props: PolicyPageProps) {
  const handle = normalizeHandle((await props.params).handle);
  const raw = (await props.searchParams).v;
  const v = raw && /^\d{1,6}$/.test(raw) ? Number(raw) : undefined;
  const result = await fetchStorePolicy(handle, v);
  if (result.status === "not_found") notFound();
  if (result.status === "error") throw new Error(`Store service unavailable for ${handle}`);
  return { handle, policy: result.data };
}

export async function generateMetadata(props: PolicyPageProps): Promise<Metadata> {
  const { handle, policy } = await resolve(props);
  return {
    title: `Store policy, ${policy.sellerName} | Amped.Bio`,
    alternates: { canonical: `/${handle}/store/policy` },
    // Indexed when the store is live; past versions are not (store policy 3.4)
    robots: policy.current ? { index: true, follow: true } : { index: false, follow: true },
  };
}

/** The public store policy (store policy 3.2 to 3.4, board sp4). */
export default async function StorePolicyPage(props: PolicyPageProps) {
  const { handle, policy } = await resolve(props);
  const profile = await fetchProfilePageResult(handle);
  const theme = profile.status === "found" ? profile.data.theme?.config : undefined;
  return (
    <ContentShell theme={theme}>
      <StorePolicyView policy={policy} />
    </ContentShell>
  );
}
