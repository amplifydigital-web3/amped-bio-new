import type { Metadata } from "next";
import { cache } from "react";
import { notFound } from "next/navigation";
import { TRPCClientError } from "@trpc/client";
import PoolDetailPageClient from "@/components/pools/PoolDetailPageClient";
import { trpcClient } from "@/lib/trpc";
import { SITE_NAME, SITE_URL, truncateText } from "@/lib/seo";
import type { PoolDetailInitial } from "@/components/pools/PoolDetailContent";

// Screen Review 071 I12, I13. The server fetches the pool, so the page has its
// own metadata and an invalid or unknown address answers HTTP 404.

const POOL_ADDRESS = /^0x[a-fA-F0-9]{40}$/;

interface PoolDetailsPageProps {
  params: Promise<{ address: string }>;
}

function isNotFound(error: unknown) {
  return error instanceof TRPCClientError && error.data?.code === "NOT_FOUND";
}

type PoolLoad = { status: "ok"; data: PoolDetailInitial } | { status: "missing" | "failed" };

// cache: metadata and the page share one fetch per request
const loadPool = cache(async (address: string): Promise<PoolLoad> => {
  if (!POOL_ADDRESS.test(address)) return { status: "missing" };
  // getPoolByAddress returns NOT_FOUND for an unknown pool and carries the
  // creator share; getPoolDetailsForModal carries the creator name and handle
  const [byAddress, details] = await Promise.allSettled([
    trpcClient.pools.fan.getPoolByAddress.query({ poolAddress: address }),
    trpcClient.pools.fan.getPoolDetailsForModal.query({ poolAddress: address }),
  ]);
  if (byAddress.status === "rejected") {
    return isNotFound(byAddress.reason) ? { status: "missing" } : { status: "failed" };
  }
  return {
    status: "ok",
    data: {
      pool: byAddress.value,
      creator: details.status === "fulfilled" ? details.value.creator : null,
    },
  };
});

export async function generateMetadata({ params }: PoolDetailsPageProps): Promise<Metadata> {
  const { address } = await params;
  const canonical = `${SITE_URL}/i/pools/${encodeURIComponent(address)}`;
  const result = await loadPool(address);

  if (result.status !== "ok") {
    return {
      title: `Creator pool | ${SITE_NAME}`,
      alternates: { canonical },
      robots: { index: false, follow: true },
    };
  }

  const { pool } = result.data;
  const title = `${pool.name} | ${SITE_NAME}`;
  const description =
    (pool.description && truncateText(pool.description, 155)) || `A creator pool on ${SITE_NAME}.`;
  const image = pool.image?.url
    ? { url: pool.image.url, alt: pool.name }
    : {
        url: `/og?title=${encodeURIComponent(pool.name)}`,
        width: 1200,
        height: 630,
        alt: pool.name,
      };

  return {
    title,
    description,
    alternates: { canonical },
    openGraph: { type: "website", url: canonical, title, description, images: [image] },
    twitter: { card: "summary_large_image", title, description, images: [image.url] },
  };
}

export default async function PoolDetailsPage({ params }: PoolDetailsPageProps) {
  const { address } = await params;
  const result = await loadPool(address);
  if (result.status === "missing") notFound();
  // A failed server fetch still renders: the client retries and shows the error state
  return (
    <PoolDetailPageClient
      poolAddress={address}
      initial={result.status === "ok" ? result.data : undefined}
    />
  );
}
