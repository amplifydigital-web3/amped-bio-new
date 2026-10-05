import type { Metadata } from "next";
import PoolsPageContent from "@/components/pools/PoolsPageContent";
import { fetchPoolsPageData } from "@/lib/getPoolsData";

export const metadata: Metadata = {
  title: "Pools | Amped.Bio",
  description: "Explore reward pools on Amped.Bio.",
  openGraph: {
    title: "Pools | Amped.Bio",
    description: "Explore reward pools on Amped.Bio.",
    images: [{ url: "/og?title=Explore%20reward%20pools", width: 1200, height: 630, alt: "Amped.Bio Pools" }],
  },
  twitter: {
    title: "Pools | Amped.Bio",
    description: "Explore reward pools on Amped.Bio.",
    images: ["/og?title=Explore%20reward%20pools"],
  },
};

// Cache the pools page for 5 minutes; revalidate on demand after that
export const revalidate = 300;

export default async function PoolsPage() {
  const initialData = await fetchPoolsPageData();

  return <PoolsPageContent initialData={initialData} />;
}
