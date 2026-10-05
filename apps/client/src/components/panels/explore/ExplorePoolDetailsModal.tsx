import PoolPanel from "./pool-panel/PoolPanel";

interface ExplorePoolDetailsModalProps {
  isOpen: boolean;
  onClose: () => void;
  poolId?: number;
  poolAddress?: string;
  // Runs after a stake, unstake or claim so the opener can refetch its list
  onStakeSuccess?: () => void;
}

// Kept so Wallet Stakes (row 059, D25) and My Pool (row 067) open the pool
// panel without changes on their side. New callers use PoolPanel directly.
export default function ExplorePoolDetailsModal({
  isOpen,
  onClose,
  poolId,
  poolAddress,
  onStakeSuccess,
}: ExplorePoolDetailsModalProps) {
  return (
    <PoolPanel
      open={isOpen}
      onOpenChange={open => {
        if (!open) onClose();
      }}
      poolId={poolId}
      poolAddress={poolAddress}
      onChanged={onStakeSuccess}
    />
  );
}
