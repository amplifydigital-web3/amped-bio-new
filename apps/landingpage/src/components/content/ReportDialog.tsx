"use client";

import { useId, useState } from "react";
import { CheckCircle2, Flag, Loader2 } from "lucide-react";
import {
  CONTENT_REPORT_LABELS,
  CONTENT_REPORT_REASONS,
  type ContentReportReason,
} from "@repo/constants";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, cn } from "@repo/ui";
import { trpcClient } from "@/lib/trpc";
import { SITE_CONTENT_COPY as copy } from "./copy";
import { CREATOR_FOCUS_RING } from "./theme";

/**
 * Report content (spec 3.11). Goes to the Amped.Bio team (admin queue, PR 7),
 * never to the creator. The dialog is a platform surface, so it is neutral, not
 * in the creator's theme.
 */
export function ReportContentButton({
  items,
  label = copy.reportContent,
  className,
}: {
  items: Array<{ publicId: string; title: string }>;
  label?: string;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  if (!items.length) return null;
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={cn(
          "inline-flex min-h-[44px] items-center gap-[8px] text-[15px] underline underline-offset-2",
          CREATOR_FOCUS_RING,
          className
        )}
      >
        <Flag className="h-5 w-5" aria-hidden />
        {label}
      </button>
      {open && <ReportDialog items={items} onClose={() => setOpen(false)} />}
    </>
  );
}

function ReportDialog({
  items,
  onClose,
}: {
  items: Array<{ publicId: string; title: string }>;
  onClose: () => void;
}) {
  const formId = useId();
  const [publicId, setPublicId] = useState(items[0]!.publicId);
  const [reason, setReason] = useState<ContentReportReason | null>(null);
  const [details, setDetails] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [error, setError] = useState<string | null>(null);

  const send = async () => {
    if (!reason) return;
    setState("sending");
    setError(null);
    try {
      await trpcClient.content.report.mutate({
        publicId,
        reason,
        details: details.trim() || undefined,
      });
      setState("sent");
    } catch (failure) {
      setState("error");
      setError(failure instanceof Error && failure.message ? failure.message : copy.reportFailed);
    }
  };

  return (
    <Dialog open onOpenChange={next => !next && onClose()}>
      <DialogContent className="max-h-[90dvh] max-w-[440px] overflow-y-auto bg-white text-[#16152B]">
        <DialogHeader>
          <DialogTitle>{copy.reportTitle}</DialogTitle>
          <DialogDescription>{copy.reportIntro}</DialogDescription>
        </DialogHeader>
        {state === "sent" ? (
          <div
            className="flex flex-col items-center gap-[13px] py-[21px] text-center"
            role="status"
          >
            <CheckCircle2 className="h-9 w-9 text-[#17693F]" aria-hidden />
            <p className="text-[16px] font-semibold">{copy.reportThanks}</p>
            <button
              type="button"
              onClick={onClose}
              className="min-h-[44px] rounded-full bg-[#16152B] px-[21px] font-semibold text-white"
            >
              {copy.close}
            </button>
          </div>
        ) : (
          <form
            id={formId}
            className="flex flex-col gap-[13px]"
            onSubmit={event => {
              event.preventDefault();
              void send();
            }}
          >
            {items.length > 1 && (
              <label className="flex flex-col gap-1 text-[14px] font-semibold">
                {copy.reportWhich}
                <select
                  value={publicId}
                  onChange={event => setPublicId(event.target.value)}
                  className="min-h-[44px] rounded-[8px] border border-black/20 px-2 font-normal"
                >
                  {items.map(item => (
                    <option key={item.publicId} value={item.publicId}>
                      {item.title}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <fieldset className="flex flex-col gap-1">
              <legend className="mb-1 text-[14px] font-semibold">{copy.reportWhy}</legend>
              {CONTENT_REPORT_REASONS.map(value => (
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
                  <span className="text-[15px]">{CONTENT_REPORT_LABELS[value]}</span>
                </label>
              ))}
            </fieldset>
            <label className="flex flex-col gap-1 text-[14px] font-semibold">
              {copy.reportDetails}
              <textarea
                value={details}
                maxLength={2000}
                rows={3}
                onChange={event => setDetails(event.target.value)}
                className="rounded-[8px] border border-black/20 p-2 font-normal"
              />
              <span className="font-normal text-black/60">{copy.reportDetailsHelp}</span>
            </label>
            <p className="text-[13px] text-black/70">{copy.reportSafety}</p>
            {error && (
              <p role="alert" className="text-[14px] font-semibold text-[#A3261D]">
                {error}
              </p>
            )}
            <div className="flex justify-end gap-[8px]">
              <button
                type="button"
                onClick={onClose}
                className="min-h-[44px] rounded-full px-[21px] font-semibold"
              >
                {copy.cancel}
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
                {state === "sending" ? copy.reportSending : copy.reportSend}
              </button>
            </div>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
