import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/Button";
import { AVAILABLE_CHAINS } from "@ampedbio/web3";
import { Loader2 } from "lucide-react";
import { trpc } from "../../utils/trpc/trpc";
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";

interface SyncTransactionDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onSyncComplete: () => void;
}

export default function SyncTransactionDialog({
  isOpen,
  onClose,
  onSyncComplete,
}: SyncTransactionDialogProps) {
  const [chainId, setChainId] = useState("");
  const [hash, setHash] = useState("");

  const syncTransactionMutation = useMutation({
    mutationFn: trpc.admin.pools.syncTransaction.mutationOptions().mutationFn,
    onSuccess: data => {
      toast.success(data.message);
      setChainId("");
      setHash("");
      onSyncComplete();
      onClose();
    },
    onError: err => {
      toast.error(`Failed to sync transaction: ${err.message}`);
    },
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!chainId.trim() || !hash.trim()) return;

    syncTransactionMutation.mutate({ chainId, hash });
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Sync Transaction</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="chainId" className="block text-sm font-medium mb-1">
              Blockchain
            </label>
            <select
              id="chainId"
              value={chainId}
              onChange={e => setChainId(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-800 dark:text-white"
              required
            >
              <option value="">Select a blockchain</option>
              {AVAILABLE_CHAINS.map(chain => (
                <option key={chain.id} value={chain.id.toString()}>
                  {chain.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="hash" className="block text-sm font-medium mb-1">
              Transaction Hash
            </label>
            <input
              id="hash"
              type="text"
              value={hash}
              onChange={e => setHash(e.target.value)}
              placeholder="0x..."
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-800 dark:text-white"
              required
              pattern="^0x[0-9a-fA-F]{64}$"
              title="Please enter a valid transaction hash"
            />
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              disabled={syncTransactionMutation.isPending}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={syncTransactionMutation.isPending || !chainId.trim() || !hash.trim()}
            >
              {syncTransactionMutation.isPending && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              Sync
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
