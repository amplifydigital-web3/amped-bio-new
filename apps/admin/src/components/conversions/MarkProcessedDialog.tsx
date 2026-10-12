import { useEffect, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Button,
  Checkbox,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  ReviewSlab,
  trpc,
} from "@repo/ui";
import { TX_HASH, TX_HASH_ERROR, shortHex } from "../../kit/format";
import { SEND_NETWORK, SEND_SYMBOL, clearUnrecordedTx, type Conversion } from "./shared";

// Screen Review 089 I05. Mark as processed on the shared Dialog: the request's
// amount, symbol and recipient, a Transaction hash well checked on blur, a
// required checkbox naming the amount and recipient, and Mark as processed.
// The server validates the transaction on chain before it records it.
export function MarkProcessedDialog({
  conversion,
  prefill,
  onClose,
  onDone,
}: {
  conversion: Conversion | null;
  prefill?: string;
  onClose: () => void;
  onDone: () => void;
}) {
  const [hash, setHash] = useState("");
  const [error, setError] = useState<string | undefined>();
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    if (!conversion) return;
    setHash(prefill ?? conversion.txid ?? "");
    setError(undefined);
    setChecked(false);
  }, [conversion, prefill]);

  const mark = useMutation({
    mutationFn: trpc.ndauConversion.markConversionCompleted.mutationOptions().mutationFn,
    onSuccess: (_data, variables) => {
      clearUnrecordedTx(variables.id);
      toast.success(`Conversion #${variables.id} marked as processed`);
      onDone();
      onClose();
    },
    onError: () =>
      setError(
        "This transaction did not match the request on chain. Check the hash and try again."
      ),
  });

  if (!conversion) return null;
  const recipient = shortHex(conversion.revoAddress);

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    const problem = TX_HASH.test(hash.trim()) ? undefined : TX_HASH_ERROR;
    setError(problem);
    if (problem || !checked) return;
    mark.mutate({ id: conversion.id, txid: hash.trim() });
  };

  return (
    <Dialog open onOpenChange={open => !open && !mark.isPending && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Mark #{conversion.id} as processed</DialogTitle>
          <DialogDescription>Record a transfer that was sent outside this page.</DialogDescription>
        </DialogHeader>
        <form noValidate onSubmit={submit} className="space-y-5">
          <ReviewSlab
            rows={[
              { label: "Amount", value: `${conversion.revoAmount} ${SEND_SYMBOL}` },
              {
                label: "Recipient",
                value: <span className="font-prism-mono text-prism-code-sm">{recipient}</span>,
              },
              { label: "Network", value: SEND_NETWORK },
            ]}
          />
          <Input
            label="Transaction hash"
            value={hash}
            spellCheck={false}
            autoComplete="off"
            onChange={event => setHash(event.target.value)}
            onBlur={() => hash && setError(TX_HASH.test(hash.trim()) ? undefined : TX_HASH_ERROR)}
            error={error}
            className="font-prism-mono text-prism-code-sm"
          />
          <Checkbox checked={checked} onCheckedChange={setChecked} required>
            This transaction sent {conversion.revoAmount} {SEND_SYMBOL} to {recipient}.{" "}
            <span className="text-prism-ink-2">(Required)</span>
          </Checkbox>
          <DialogFooter>
            <Button type="button" variant="secondary" onClick={onClose} disabled={mark.isPending}>
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={!checked || mark.isPending}
              aria-busy={mark.isPending || undefined}
            >
              Mark as processed
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
