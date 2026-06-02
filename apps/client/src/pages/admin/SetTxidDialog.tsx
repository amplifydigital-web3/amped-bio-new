import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/Button";
import { Loader2 } from "lucide-react";
import { trpc } from "../../utils/trpc/trpc";
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";

interface SetTxidDialogProps {
  isOpen: boolean;
  onClose: () => void;
  poolId: number;
  currentTxid: string | null | undefined;
  onSuccess: () => void;
}

export default function SetTxidDialog({
  isOpen,
  onClose,
  poolId,
  currentTxid,
  onSuccess,
}: SetTxidDialogProps) {
  const [txid, setTxid] = useState(currentTxid || "");

  const setTxidMutation = useMutation({
    mutationFn: trpc.admin.pools.setCreationTxid.mutationOptions().mutationFn,
    onSuccess: data => {
      toast.success(data.message);
      onSuccess();
      onClose();
    },
    onError: err => {
      toast.error(`Failed to set txid: ${err.message}`);
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!txid.trim()) return;
    setTxidMutation.mutate({ poolId, creationTxid: txid });
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Set Pool Creation Txid</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="txid" className="block text-sm font-medium mb-1">
              Transaction Hash (Txid)
            </label>
            <input
              id="txid"
              type="text"
              value={txid}
              onChange={e => setTxid(e.target.value)}
              placeholder="0x..."
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-800 dark:text-white"
              required
              pattern="^0x[0-9a-fA-F]{64}$"
              title="Please enter a valid transaction hash (0x followed by 64 hex characters)"
            />
            <p className="text-xs text-gray-500 mt-1">
              The transaction hash of the pool creation transaction on-chain.
            </p>
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              disabled={setTxidMutation.isPending}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={setTxidMutation.isPending || !txid.trim()}
            >
              {setTxidMutation.isPending && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              Save
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
