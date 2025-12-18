import React from "react";
import {
  Dialog,
  DialogContent,
} from "@/components/ui/dialog";
import { trpc } from "@/utils/trpc/trpc";
import { useQuery } from "@tanstack/react-query";
import { useAccount } from "wagmi";
import PoolDetailContent from "./PoolDetailContent";

interface ExplorePoolDetailsModalProps {
  isOpen: boolean;
  onClose: () => void;
  poolId?: number; // Optional - used when opening from list view
  poolAddress?: string; // Optional - used when opening from URL parameter
  onStakeSuccess?: () => void; // Callback for when stake/unstake succeeds to trigger refresh
}

export default function ExplorePoolDetailsModal({
  isOpen,
  onClose,
  poolId,
  poolAddress,
  onStakeSuccess,
}: ExplorePoolDetailsModalProps) {
  const { address: userAddress } = useAccount();

  // Query for the pool to get its address if only poolId is provided
  const { data: pool } = useQuery({
    ...trpc.pools.fan.getPoolDetailsForModal.queryOptions({
      poolId: poolId || undefined,
      poolAddress: poolAddress || undefined,
      walletAddress: userAddress || undefined
    }),
    enabled: isOpen && (!!poolId || !!poolAddress),
    staleTime: 1000 * 60, // Cache for 1 minute
  });

  // If we only have poolId but not poolAddress, wait for the query to resolve
  const finalPoolAddress = poolAddress || pool?.address;

  if (!isOpen || (!poolId && !poolAddress) || !finalPoolAddress) return null;

  return (
    <>
      <Dialog open={isOpen} onOpenChange={onClose}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto rounded-2xl shadow-2xl">
          <PoolDetailContent
            poolAddress={finalPoolAddress}
            onClose={onClose}
            onStakeSuccess={onStakeSuccess}
            shareUrl={`${window.location.origin}/i/pools/${finalPoolAddress}`}
          />
        </DialogContent>
      </Dialog>
    </>
  );
}
