import { FC, useState } from "react";
import { trpc } from "../../utils/trpc/trpc";
import { Switch } from "../../components/ui/Switch";
import { Button } from "../../components/ui/Button";
import { toast } from "sonner";
import { useQuery, useMutation } from "@tanstack/react-query";
import { formatHandle } from "../../utils/handle";
import { Loader2, RefreshCw } from "lucide-react";
import SyncTransactionDialog from "./SyncTransactionDialog";
import SetTxidDialog from "./SetTxidDialog";

export const AdminPools: FC = () => {
  const {
    data: pools,
    isLoading,
    isError,
    error,
    refetch,
  } = useQuery(trpc.admin.pools.getAllPools.queryOptions());

  const [isSyncDialogOpen, setIsSyncDialogOpen] = useState(false);
  const [syncingPoolId, setSyncingPoolId] = useState<number | null>(null);
  const [isSetTxidDialogOpen, setIsSetTxidDialogOpen] = useState(false);
  const [editingTxidPool, setEditingTxidPool] = useState<{
    id: number;
    currentTxid: string | null | undefined;
  } | null>(null);

  const handleSyncComplete = () => {
    refetch();
  };

  const setHiddenMutation = useMutation({
    mutationFn: trpc.admin.pools.setHidden.mutationOptions().mutationFn,
    onSuccess: () => {
      toast.success("Pool visibility updated successfully.");
      refetch();
    },
    onError: err => {
      toast.error(`Failed to update pool visibility: ${err.message}`);
    },
  });

  const syncPoolMutation = useMutation({
    mutationFn: trpc.admin.pools.syncPool.mutationOptions().mutationFn,
    onSuccess: data => {
      const s = data.summary;
      toast.success(
        `Pool synced: ${s.stakes.processed} stakes, ${s.unstakes.processed} unstakes, ${s.claims.processed} claims`
      );
      refetch();
    },
    onError: err => {
      toast.error(`Failed to sync pool: ${err.message}`);
    },
    onSettled: () => {
      setSyncingPoolId(null);
    },
  });

  const handleSyncPool = (poolId: number) => {
    setSyncingPoolId(poolId);
    syncPoolMutation.mutate({ poolId });
  };

  const handleToggleHidden = (poolId: number, currentHiddenStatus: boolean) => {
    setHiddenMutation.mutate({ poolId, hidden: !currentHiddenStatus });
  };

  const handleOpenSetTxid = (poolId: number, currentTxid: string | null | undefined) => {
    setEditingTxidPool({ id: poolId, currentTxid });
    setIsSetTxidDialogOpen(true);
  };

  const handleSetTxidSuccess = () => {
    refetch();
  };

  const formatTxid = (txid: string | null | undefined) => {
    if (!txid) return null;
    return `${txid.slice(0, 10)}...${txid.slice(-8)}`;
  };

  if (isLoading) {
    return (
      <div>
        <h1 className="text-2xl font-bold mb-4">Manage Creator Pools</h1>
        <p>Loading pools...</p>
      </div>
    );
  }

  if (isError) {
    return (
      <div>
        <h1 className="text-2xl font-bold mb-4">Manage Creator Pools</h1>
        <p className="text-red-500">Error loading pools: {error.message}</p>
      </div>
    );
  }

  return (
    <div>
      <div className="flex justify-between items-center mb-4">
        <h1 className="text-2xl font-bold">Manage Creator Pools</h1>
        <Button onClick={() => setIsSyncDialogOpen(true)}>Sync Transaction</Button>
      </div>

      {pools && pools.length > 0 ? (
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
            <thead className="bg-gray-50 dark:bg-gray-800">
              <tr>
                <th
                  scope="col"
                  className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider dark:text-gray-400"
                >
                  ID
                </th>
                <th
                  scope="col"
                  className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider dark:text-gray-400"
                >
                  Pool Address
                </th>
                <th
                  scope="col"
                  className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider dark:text-gray-400"
                >
                  Creator
                </th>
                <th
                  scope="col"
                  className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider dark:text-gray-400"
                >
                  Chain ID
                </th>
                <th
                  scope="col"
                  className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider dark:text-gray-400"
                >
                  Creation Txid
                </th>
                <th
                  scope="col"
                  className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider dark:text-gray-400"
                >
                  Hidden
                </th>
                <th
                  scope="col"
                  className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider dark:text-gray-400"
                >
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200 dark:bg-gray-900 dark:divide-gray-700">
              {pools.map(pool => (
                <tr key={pool.id}>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900 dark:text-white">
                    {pool.id}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                    {pool.poolAddress || "N/A"}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-500 dark:text-gray-400">
                    {pool.wallet?.user?.handle ? (
                      <a
                        href={`/${formatHandle(pool.wallet.user.handle)}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-blue-600 hover:underline"
                      >
                        {formatHandle(pool.wallet.user.handle)}
                      </a>
                    ) : (
                      pool.wallet?.user?.email || "N/A"
                    )}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                    {pool.chainId}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                    <div className="flex items-center gap-2">
                      <span
                        className={pool.creationTxid ? "font-mono text-xs" : "text-gray-400 italic"}
                      >
                        {formatTxid(pool.creationTxid) || "N/A"}
                      </span>
                      <button
                        onClick={() => handleOpenSetTxid(pool.id, pool.creationTxid)}
                        className="text-blue-600 hover:text-blue-800 text-xs underline"
                        title="Set or edit creation transaction txid"
                      >
                        {pool.creationTxid ? "Edit" : "Set"}
                      </button>
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                    <Switch
                      checked={pool.hidden || false}
                      onChange={() => handleToggleHidden(pool.id, pool.hidden || false)}
                      disabled={setHiddenMutation.isPending}
                    />
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleSyncPool(pool.id)}
                      disabled={syncingPoolId === pool.id || !pool.poolAddress}
                      title={
                        !pool.poolAddress
                          ? "Pool has no address — sync creation first"
                          : "Sync all on-chain events for this pool"
                      }
                    >
                      {syncingPoolId === pool.id ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <RefreshCw className="h-4 w-4" />
                      )}
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p>No pools found.</p>
      )}

      <SyncTransactionDialog
        isOpen={isSyncDialogOpen}
        onClose={() => setIsSyncDialogOpen(false)}
        onSyncComplete={handleSyncComplete}
      />

      {editingTxidPool && (
        <SetTxidDialog
          isOpen={isSetTxidDialogOpen}
          onClose={() => {
            setIsSetTxidDialogOpen(false);
            setEditingTxidPool(null);
          }}
          poolId={editingTxidPool.id}
          currentTxid={editingTxidPool.currentTxid}
          onSuccess={handleSetTxidSuccess}
        />
      )}
    </div>
  );
};
