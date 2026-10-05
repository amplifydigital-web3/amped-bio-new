"use client";

import PoolDetailContent, { type PoolDetailInitial } from "@/components/pools/PoolDetailContent";
import PoolPageFrame from "@/components/pools/PoolPageFrame";

export default function PoolDetailPageClient({
  poolAddress,
  initial,
}: {
  poolAddress: string;
  initial?: PoolDetailInitial;
}) {
  return (
    <PoolPageFrame>
      <PoolDetailContent poolAddress={poolAddress} initial={initial} />
    </PoolPageFrame>
  );
}
