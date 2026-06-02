import { useState, useMemo } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/Button";
import { AlertTriangle, Loader2 } from "lucide-react";
import { trpc } from "../../utils/trpc/trpc";
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";

const TXID_REGEX = /^0x[0-9a-fA-F]{64}$/;

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

  const validationError = useMemo(() => {
    const trimmed = txid.trim();
    if (!trimmed) return null;
    if (!TXID_REGEX.test(trimmed)) {
      return "Invalid format — must be 0x followed by 64 hex characters";
    }
    return null;
  }, [txid]);

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

  const isValid = txid.trim().length > 0 && validationError === null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!isValid) return;
    setTxidMutation.mutate({ poolId, creationTxid: txid.trim() });
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
            />
            {validationError && (
              <div className="flex items-center gap-1 mt-1 text-amber-600 dark:text-amber-400 text-xs">
                <AlertTriangle className="h-3 w-3 flex-shrink-0" />
                <span>{validationError}</span>
              </div>
            )}
            {!validationError && (
              <p className="text-xs text-gray-500 mt-1">
                The transaction hash of the pool creation transaction on-chain.
              </p>
            )}
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
              disabled={setTxidMutation.isPending || !isValid}
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
