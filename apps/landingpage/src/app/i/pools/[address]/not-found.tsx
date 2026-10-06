import type { Metadata } from "next";
import { PoolNotFound } from "@/components/pools/PoolDetailContent";
import PoolPageFrame from "@/components/pools/PoolPageFrame";

// Screen Review 071 I12, 097 I05: no pool for the address, or an invalid address.
// Served with HTTP 404 by notFound() in the page.

export const metadata: Metadata = {
  title: "Pool not found · Amped.Bio",
  robots: { index: false, follow: true },
};

export default function PoolNotFoundPage() {
  return (
    <PoolPageFrame>
      <PoolNotFound />
    </PoolPageFrame>
  );
}
