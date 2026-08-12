import PoolsPageContent from "@/components/pools/PoolsPageContent";
import { fetchPoolsPageData } from "@/lib/getPoolsData";

// Cache the pools page for 5 minutes; revalidate on demand after that
export const revalidate = 300;

export default async function PoolsPage() {
  const initialData = await fetchPoolsPageData();

  return <PoolsPageContent initialData={initialData} />;
}
