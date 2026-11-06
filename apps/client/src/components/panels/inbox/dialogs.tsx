import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { MESSAGE_REPORT_REASONS, MESSAGE_UI } from "@repo/constants";
import {
  Button,
  Checkbox,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  trpcClient,
} from "@repo/ui";
import { toast } from "@/components/ui/toast";
import { errorMessage } from "./util";

const S = MESSAGE_UI;

/** Confirm before an action that changes the conversation (board m8 dialogs). */
export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  body,
  confirm,
  destructive = false,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  body: string;
  confirm: string;
  destructive?: boolean;
  onConfirm: () => Promise<unknown>;
}) {
  const run = useMutation({
    mutationFn: onConfirm,
    onSuccess: () => onOpenChange(false),
    onError: error => toast.add({ type: "error", title: errorMessage(error, S.saveFailed) }),
  });
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{body}</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="secondary" onClick={() => onOpenChange(false)}>
            {S.cancel}
          </Button>
          <Button
            variant={destructive ? "destructive" : "default"}
            onClick={() => run.mutate()}
            disabled={run.isPending}
          >
            {confirm}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

type Reason = (typeof MESSAGE_REPORT_REASONS)[number]["value"];

/** Report with a reason, an optional note, and Also block (spec 7.6). */
export function ReportDialog({
  open,
  onOpenChange,
  conversationId,
  messageId,
  onReported,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  conversationId: string;
  messageId?: string;
  onReported?: (alsoBlock: boolean) => void;
}) {
  const [reason, setReason] = useState<Reason | null>(null);
  const [note, setNote] = useState("");
  const [alsoBlock, setAlsoBlock] = useState(true);
  const send = useMutation({
    mutationFn: () =>
      trpcClient.messages.report.mutate({
        conversationId,
        messageId,
        reason: reason!,
        note: note.trim() || undefined,
        alsoBlock,
      }),
    onSuccess: () => {
      onOpenChange(false);
      toast.add({ type: "success", title: S.reportSent });
      onReported?.(alsoBlock);
      setReason(null);
      setNote("");
    },
    onError: error => toast.add({ type: "error", title: errorMessage(error, S.saveFailed) }),
  });
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{S.reportTitle}</DialogTitle>
          <DialogDescription>{S.reportBody}</DialogDescription>
        </DialogHeader>
        <fieldset className="space-y-1">
          <legend className="sr-only">Reason</legend>
          {MESSAGE_REPORT_REASONS.map(r => (
            <label
              key={r.value}
              className="flex min-h-touch cursor-pointer items-center gap-3 font-prism text-prism-label text-prism-ink"
            >
              <input
                type="radio"
                name="message-report-reason"
                value={r.value}
                checked={reason === r.value}
                onChange={() => setReason(r.value)}
                className="h-5 w-5 accent-prism-nav"
              />
              {r.label}
            </label>
          ))}
        </fieldset>
        <label className="block space-y-2">
          <span className="block text-prism-label font-semibold text-prism-ink">
            {S.reportNote}
          </span>
          <textarea
            value={note}
            onChange={e => setNote(e.target.value)}
            maxLength={500}
            rows={3}
            className="prism-well prism-focus block w-full rounded-prism-13 px-4 py-3 font-prism text-prism-body text-prism-ink"
          />
        </label>
        <Checkbox checked={alsoBlock} onCheckedChange={setAlsoBlock}>
          {S.reportAlsoBlock}
        </Checkbox>
        <DialogFooter>
          <Button variant="secondary" onClick={() => onOpenChange(false)}>
            {S.cancel}
          </Button>
          <Button onClick={() => send.mutate()} disabled={!reason || send.isPending}>
            {S.reportSend}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
