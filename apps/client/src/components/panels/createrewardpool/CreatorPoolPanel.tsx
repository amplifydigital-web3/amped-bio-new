import { useCallback, useEffect, useRef, useState } from "react";
import { useChainId } from "wagmi";
import { TRPCClientError } from "@trpc/client";
import { trpcClient, useAuth } from "@repo/ui";
import { useCreatorPool } from "@/hooks/useCreatorPool";
import { useDelayed } from "@/hooks/useDelayed";
import { useWalletContext } from "@/contexts/WalletContext";
import DashboardPage from "./PoolDashboardPage";
import { CreatePoolPage } from "./create/CreatePoolPage";

// 065 I13: Select step shaped skeleton in line color, shown only after 400ms
function CreatePoolSkeleton() {
  return (
    <div
      aria-hidden
      className="mx-auto w-full max-w-[759px] space-y-[21px] px-4 py-5 sm:mx-0 sm:px-[21px]"
    >
      <div className="h-4 w-32 rounded-full bg-prism-line" />
      <div className="h-[419px] max-w-[495px] rounded-prism-21 bg-prism-line" />
      <div className="space-y-3 rounded-prism-21 bg-prism-line/50 p-[21px]">
        <div className="h-3 w-24 rounded-full bg-prism-line" />
        <div className="h-3 w-full rounded-full bg-prism-line" />
        <div className="h-3 w-4/5 rounded-full bg-prism-line" />
      </div>
    </div>
  );
}

/**
 * My Pool. A creator with a pool sees the dashboard (rows 067 to 069); a
 * creator without one sees the create flow (065, 066). The pool is read with
 * the saved wallet address, so a failed reconnect (063 D1) never leaves an
 * endless skeleton.
 */
export function CreatorPoolPanel() {
  const chainId = useChainId();
  const wallet = useWalletContext();
  const { authUser } = useAuth();
  const { createPool, poolAddress, isLoading, refetch } = useCreatorPool();
  const [launching, setLaunching] = useState(false);
  const [staleNotice, setStaleNotice] = useState(false);
  const synced = useRef<Set<string>>(new Set());
  const syncing = useRef(false);

  // Sync an on chain pool the database does not know yet. Silent on success
  // and RPC errors; a stale record shows a notice in the flow (065 I14).
  useEffect(() => {
    const key = chainId.toString();
    if (!poolAddress || isLoading || synced.current.has(key) || syncing.current) return;
    if (authUser?.poolAddresses?.[key]) {
      synced.current.add(key);
      return;
    }
    syncing.current = true;
    trpcClient.pools.creator.syncPoolCreation
      .mutate({ chainId: key })
      .then(() => synced.current.add(key))
      .catch(error => {
        const isRpcError =
          error instanceof TRPCClientError && error.data?.code === "INTERNAL_SERVER_ERROR";
        if (!isRpcError) setStaleNotice(true);
      })
      .finally(() => {
        syncing.current = false;
      });
  }, [poolAddress, isLoading, chainId, authUser]);

  const reading = isLoading || (wallet.connecting && !wallet.address);
  const showSkeleton = useDelayed(reading, 400);
  const onLaunched = useCallback(() => refetch(), [refetch]);

  if (reading && !launching) return showSkeleton ? <CreatePoolSkeleton /> : null;

  // The flow stays on screen until the person leaves the result
  if (poolAddress && !launching) return <DashboardPage />;

  return (
    <CreatePoolPage
      createPool={createPool}
      onLaunchingChange={setLaunching}
      onLaunched={onLaunched}
      staleNotice={staleNotice}
      onDismissStale={() => setStaleNotice(false)}
    />
  );
}
