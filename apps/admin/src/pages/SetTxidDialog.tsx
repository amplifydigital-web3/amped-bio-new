import { useEffect, useState } from "react";
import { Search } from "lucide-react";
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  trpc,
  trpcClient,
} from "@repo/ui";
import { Spinner } from "../kit/parts";
import { TX_HASH, TX_HASH_ERROR } from "../kit/format";

// Screen Review 089 I13. Set creation tx on the shared Dialog: the hash well
// checked on blur, Find on chain (fills the well from the pool address and
// network) and Save transaction. Results show inline above the footer.

interface SetTxidDialogProps {
  isOpen: boolean;
  onClose: () => void;
  poolId: number;
  poolName: string;
  poolAddress: string | null;
  chainId: string;
  currentTxid: string | null;
  onSuccess: () => void;
}

export default function SetTxidDialog({
  isOpen,
  onClose,
  poolId,
  poolName,
  poolAddress,
  chainId,
  currentTxid,
  onSuccess,
}: SetTxidDialogProps) {
  const [hash, setHash] = useState(currentTxid ?? "");
  const [error, setError] = useState<string | undefined>();
  const [finding, setFinding] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setHash(currentTxid ?? "");
      setError(undefined);
    }
  }, [isOpen, currentTxid]);

  const save = useMutation({
    mutationFn: trpc.admin.pools.setCreationTxid.mutationOptions().mutationFn,
    onSuccess: () => {
      toast.success(`Creation transaction saved for ${poolName}`);
      onSuccess();
      onClose();
    },
    onError: () => setError("The transaction was not saved. Check the hash and try again."),
  });

  const check = (value: string) => (TX_HASH.test(value.trim()) ? undefined : TX_HASH_ERROR);

  const find = async () => {
    if (!poolAddress) return;
    setFinding(true);
    setError(undefined);
    try {
      const result = await trpcClient.admin.pools.fetchCreationTxid.query({
        poolAddress,
        chainId: parseInt(chainId),
      });
      setHash(result.creationTxid);
    } catch {
      setError("The creation transaction was not found on chain. Paste it instead.");
    } finally {
      setFinding(false);
    }
  };

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    const problem = check(hash);
    setError(problem);
    if (!problem) save.mutate({ poolId, creationTxid: hash.trim() });
  };

  const busy = save.isPending || finding;

  return (
    <Dialog open={isOpen} onOpenChange={open => !open && !busy && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Set creation tx</DialogTitle>
          <DialogDescription>
            {poolName} needs its creation transaction before it can sync.
          </DialogDescription>
        </DialogHeader>
        <form noValidate onSubmit={submit} className="space-y-5">
          <Input
            label="Transaction hash"
            value={hash}
            spellCheck={false}
            autoComplete="off"
            onChange={event => setHash(event.target.value)}
            onBlur={() => hash && setError(check(hash))}
            error={error}
            className="font-prism-mono text-prism-code-sm"
          />
          {poolAddress && (
            <Button
              type="button"
              variant="secondary"
              onClick={() => void find()}
              disabled={busy}
              aria-busy={finding || undefined}
            >
              {finding ? <Spinner /> : <Search aria-hidden />}
              Find on chain
            </Button>
          )}
          <DialogFooter>
            <Button type="button" variant="secondary" onClick={onClose} disabled={busy}>
              Cancel
            </Button>
            <Button type="submit" disabled={busy} aria-busy={save.isPending || undefined}>
              Save transaction
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
