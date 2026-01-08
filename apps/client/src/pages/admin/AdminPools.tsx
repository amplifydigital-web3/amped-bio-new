import { FC, useState } from "react";
import { trpc } from "../../utils/trpc/trpc";
import { Switch } from "../../components/ui/Switch";
import { Button } from "../../components/ui/Button";
import { toast } from "sonner";
import { RouterOutputs } from "../../utils/trpc/types";
import { useQuery, useMutation } from "@tanstack/react-query";
import { formatOnelink } from "../../utils/onelink";
import SyncTransactionDialog from "./SyncTransactionDialog";

// Define the Pool type using RouterOutputs
type Pool = RouterOutputs["admin"]["pools"]["getAllPools"][number];

export const AdminPools: FC = () => {
  const {
    data: pools,
    isLoading,
    isError,
    error,
    refetch,
  } = useQuery(trpc.admin.pools.getAllPools.queryOptions());

  const [isSyncDialogOpen, setIsSyncDialogOpen] = useState(false);

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

  const handleToggleHidden = (poolId: number, currentHiddenStatus: boolean) => {
    setHiddenMutation.mutate({ poolId, hidden: !currentHiddenStatus });
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
                  Hidden
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
                    {pool.wallet?.user?.onelink ? (
                      <a
                        href={`/${formatOnelink(pool.wallet.user.onelink)}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-blue-600 hover:underline"
                      >
                        {formatOnelink(pool.wallet.user.onelink)}
                      </a>
                    ) : (
                      pool.wallet?.user?.email || "N/A"
                    )}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                    {pool.chainId}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                    <Switch
                      checked={pool.hidden || false}
                      onChange={() => handleToggleHidden(pool.id, pool.hidden || false)}
                      disabled={setHiddenMutation.isPending}
                    />
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
    </div>
  );
};
