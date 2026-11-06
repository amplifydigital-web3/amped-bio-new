"use client";

import { useId, useState } from "react";
import { CheckCircle2, Flag, Loader2 } from "lucide-react";
import {
  STORE_REPORT_LABELS,
  STORE_REPORT_REASONS,
  STORE_SALES_COPY,
  type StoreReportReason,
} from "@repo/constants";
import { Dialog, DialogContent, DialogHeader, DialogTitle, cn } from "@repo/ui";
import { trpcClient } from "@/lib/trpc";
import { CREATOR_FOCUS_RING } from "../content/theme";

const R = STORE_SALES_COPY.report;

/**
 * Report store (store policy 3.4, SP-Q48, C10). Goes to the Amped.Bio Safety queue, never to
 * the creator. A platform surface, so it is neutral, not in the creator's theme.
 */
export function ReportStoreButton({ handle, className }: { handle: string; className?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={cn(
          "inline-flex min-h-[44px] items-center gap-[8px] underline underline-offset-2",
          CREATOR_FOCUS_RING,
          className
        )}
      >
        <Flag className="h-5 w-5" aria-hidden />
        {R.link}
      </button>
      {open && <ReportStoreDialog handle={handle} onClose={() => setOpen(false)} />}
    </>
  );
}

function ReportStoreDialog({ handle, onClose }: { handle: string; onClose: () => void }) {
  const formId = useId();
  const [reason, setReason] = useState<StoreReportReason | null>(null);
  const [details, setDetails] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "sent" | "error">("idle");

  const send = async () => {
    if (!reason) return;
    setState("sending");
    try {
      await trpcClient.store.report.mutate({
        handle,
        reason,
        details: details.trim() || undefined,
      });
      setState("sent");
    } catch {
      setState("error");
    }
  };

  return (
    <Dialog open onOpenChange={next => !next && onClose()}>
      <DialogContent className="max-h-[90dvh] max-w-[440px] overflow-y-auto bg-white text-[#16152B]">
        <DialogHeader>
          <DialogTitle>{R.title}</DialogTitle>
        </DialogHeader>
        {state === "sent" ? (
          <div
            className="flex flex-col items-center gap-[13px] py-[21px] text-center"
            role="status"
          >
            <CheckCircle2 className="h-9 w-9 text-[#17693F]" aria-hidden />
            <p className="text-[16px] font-semibold">{R.sent}</p>
            <button
              type="button"
              onClick={onClose}
              className="min-h-[44px] rounded-full bg-[#16152B] px-[21px] font-semibold text-white"
            >
              Close
            </button>
          </div>
        ) : (
          <form
            className="flex flex-col gap-[13px]"
            onSubmit={event => {
              event.preventDefault();
              void send();
            }}
          >
            <fieldset className="flex flex-col gap-1">
              <legend className="mb-1 text-[14px] font-semibold">{R.reason}</legend>
              {STORE_REPORT_REASONS.map(value => (
                <label
                  key={value}
                  className="flex min-h-[44px] cursor-pointer items-center gap-[13px] rounded-[8px] px-[8px] hover:bg-black/5"
                >
                  <input
                    type="radio"
                    name={`${formId}-reason`}
                    value={value}
                    checked={reason === value}
                    onChange={() => setReason(value)}
                    className="h-5 w-5 accent-[#16152B]"
                  />
                  <span className="text-[15px]">{STORE_REPORT_LABELS[value]}</span>
                </label>
              ))}
            </fieldset>
            <label className="flex flex-col gap-1 text-[14px] font-semibold">
              {R.details}
              <textarea
                value={details}
                maxLength={2000}
                rows={3}
                onChange={event => setDetails(event.target.value)}
                className="rounded-[8px] border border-black/20 p-2 font-normal"
              />
            </label>
            {state === "error" && (
              <p role="alert" className="text-[14px] font-semibold text-[#A3261D]">
                {R.failed}
              </p>
            )}
            <div className="flex justify-end gap-[8px]">
              <button
                type="button"
                onClick={onClose}
                className="min-h-[44px] rounded-full px-[21px] font-semibold"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={!reason || state === "sending"}
                className="inline-flex min-h-[44px] items-center gap-2 rounded-full bg-[#16152B] px-[21px] font-semibold text-white disabled:opacity-50"
              >
                {state === "sending" && (
                  <Loader2
                    className="h-4 w-4 animate-spin motion-reduce:animate-none"
                    aria-hidden
                  />
                )}
                {R.submit}
              </button>
            </div>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
