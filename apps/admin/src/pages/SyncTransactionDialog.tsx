import { useEffect, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import {
  Button,
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Notice,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  trpc,
} from "@repo/ui";
import { AVAILABLE_CHAINS } from "@repo/web3";
import { FieldError } from "../kit/parts";
import { TX_HASH, TX_HASH_ERROR } from "../kit/format";

// Screen Review 089 I13. Sync transaction on the shared Dialog: Network
// select, Transaction hash checked on blur, Sync transaction, and the result
// inline above the footer.

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
  const [errors, setErrors] = useState<{ chain?: string; hash?: string }>({});
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    setChainId("");
    setHash("");
    setErrors({});
    setResult(null);
  }, [isOpen]);

  const sync = useMutation({
    mutationFn: trpc.admin.pools.syncTransaction.mutationOptions().mutationFn,
    onSuccess: data => {
      setResult({ ok: true, text: data.message || "Transaction synced." });
      onSyncComplete();
    },
    onError: () =>
      setResult({ ok: false, text: "The transaction did not sync. Check the network and hash." }),
  });

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    const next = {
      chain: chainId ? undefined : "Choose a network.",
      hash: TX_HASH.test(hash.trim()) ? undefined : TX_HASH_ERROR,
    };
    setErrors(next);
    setResult(null);
    if (!next.chain && !next.hash) sync.mutate({ chainId, hash: hash.trim() });
  };

  return (
    <Dialog open={isOpen} onOpenChange={open => !open && !sync.isPending && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Sync transaction</DialogTitle>
        </DialogHeader>
        <form noValidate onSubmit={submit} className="space-y-5">
          <div className="space-y-2">
            <p id="sync-network" className="text-prism-label font-semibold text-prism-ink">
              Network
            </p>
            <Select value={chainId || undefined} onValueChange={value => setChainId(value)}>
              <SelectTrigger
                aria-labelledby="sync-network"
                aria-invalid={errors.chain ? true : undefined}
              >
                <SelectValue placeholder="Choose a network" />
              </SelectTrigger>
              <SelectContent>
                {AVAILABLE_CHAINS.map(chain => (
                  <SelectItem key={chain.id} value={chain.id.toString()}>
                    {chain.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <FieldError>{errors.chain}</FieldError>
          </div>
          <Input
            label="Transaction hash"
            value={hash}
            spellCheck={false}
            autoComplete="off"
            onChange={event => setHash(event.target.value)}
            onBlur={() =>
              hash &&
              setErrors(e => ({
                ...e,
                hash: TX_HASH.test(hash.trim()) ? undefined : TX_HASH_ERROR,
              }))
            }
            error={errors.hash}
            className="font-prism-mono text-prism-code-sm"
          />
          {result && (
            <Notice variant={result.ok ? "success" : "error"} role={result.ok ? "status" : "alert"}>
              {result.text}
            </Notice>
          )}
          <DialogFooter>
            <Button type="button" variant="secondary" onClick={onClose} disabled={sync.isPending}>
              {result?.ok ? "Close" : "Cancel"}
            </Button>
            <Button type="submit" disabled={sync.isPending} aria-busy={sync.isPending || undefined}>
              Sync transaction
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
