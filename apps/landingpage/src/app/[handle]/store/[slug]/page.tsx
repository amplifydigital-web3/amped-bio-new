import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ContentShell } from "@/components/content/ContentShell";
import { JsonLd } from "@/components/seo/JsonLd";
import { ProductPageView, StoreOwnerPreview } from "@/components/store/StoreViews";
import { normalizeHandle } from "@/lib/handle";
import { fetchProfilePageResult } from "@/lib/getProfileData";
import { fetchStoreProduct } from "@/lib/getStoreData";

export const dynamic = "force-dynamic";

interface ProductPageProps {
  params: Promise<{ handle: string; slug: string }>;
  searchParams: Promise<{ preview?: string }>;
}

async function resolve(props: ProductPageProps) {
  const { handle: rawHandle, slug } = await props.params;
  const handle = normalizeHandle(rawHandle);
  const preview = (await props.searchParams).preview === "1";
  if (!/^[a-z0-9-]{1,60}$/.test(slug)) notFound();
  const result = await fetchStoreProduct(handle, slug);
  if (result.status === "error") throw new Error(`Store service unavailable for ${handle}/${slug}`);
  if (result.status === "not_found" && !preview) notFound();
  return { handle, slug, product: result.status === "found" ? result.data : null };
}

export async function generateMetadata(props: ProductPageProps): Promise<Metadata> {
  const { handle, slug, product } = await resolve(props);
  if (!product) return { title: "Store | Amped.Bio", robots: { index: false, follow: false } };
  const url = `/${handle}/store/${slug}`;
  const description =
    product.description?.slice(0, 160) ?? `${product.title} from ${product.sellerName}.`;
  // Share tags use the cover rendition only (content spec 3.8)
  const image = product.cover?.src;
  return {
    title: `${product.title} | Amped.Bio`,
    description,
    alternates: { canonical: url },
    openGraph: {
      type: "website",
      siteName: "Amped.Bio",
      url,
      title: product.title,
      description,
      ...(image ? { images: [{ url: image }] } : {}),
    },
    twitter: { card: image ? "summary_large_image" : "summary", title: product.title, description },
  };
}

/** A product page (C9; content spec 3.8, boards s3 and st8). JSON-LD Product with no media URL. */
export default async function StoreProductPage(props: ProductPageProps) {
  const { handle, slug, product } = await resolve(props);
  const profile = await fetchProfilePageResult(handle);
  const theme = profile.status === "found" ? profile.data.theme?.config : undefined;
  return (
    <>
      {product ? (
        <JsonLd
          data={{
            "@context": "https://schema.org",
            "@type": "Product",
            name: product.title,
            description: product.description ?? undefined,
            brand: { "@type": "Person", name: product.sellerName },
            offers: {
              "@type": "Offer",
              priceCurrency: "USD",
              price: (Number(product.amountUnits) / 1_000_000).toFixed(2),
              availability: "https://schema.org/InStock",
            },
          }}
        />
      ) : null}
      <ContentShell theme={theme}>
        {product ? (
          <ProductPageView product={product} />
        ) : (
          <StoreOwnerPreview handle={handle} slug={slug} />
        )}
      </ContentShell>
    </>
  );
}
