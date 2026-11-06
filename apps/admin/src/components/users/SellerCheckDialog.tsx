import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Info } from "lucide-react";
import { toast } from "sonner";
import { SELLER_OVERRIDE_MAX_DAYS } from "@repo/constants";
import {
  Button,
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  trpc,
} from "@repo/ui";
import { WordBadge } from "../../kit/WordBadge";

// Admin, Users, Seller check (Build Board #66, AB-6, board a2; spec 3.2b, decision M10).
// Creators need Enhanced to sell. A payments admin can allow a named creator to sell with
// Standard until a date, with a reason and a fresh two factor code. Logged in the change log.

function day(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export function SellerCheckDialog({
  user,
  onClose,
}: {
  user: { id: number; handle: string | null; name: string } | null;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const open = !!user;
  const view = useQuery({
    ...trpc.admin.sellerChecks.get.queryOptions({ userId: user?.id ?? 1 }),
    enabled: open,
  });
  const [endsOn, setEndsOn] = useState("");
  const [reason, setReason] = useState("");
  const [code, setCode] = useState("");

  const done = (message: string) => {
    toast.success(message);
    setCode("");
    setReason("");
    void queryClient.invalidateQueries({ queryKey: trpc.admin.sellerChecks.pathKey() });
  };
  const failed = (error: { message: string }) => toast.error(error.message);
  const set = useMutation({
    ...trpc.admin.sellerChecks.set.mutationOptions(),
    onSuccess: () => done("Override saved. The creator gets an email."),
    onError: failed,
  });
  const end = useMutation({
    ...trpc.admin.sellerChecks.end.mutationOptions(),
    onSuccess: () => done("Override ended. The creator gets an email."),
    onError: failed,
  });

  const data = view.data;
  const ready = code.length === 6 && reason.trim().length >= 3;
  const max = new Date(Date.now() + SELLER_OVERRIDE_MAX_DAYS * 86_400_000)
    .toISOString()
    .slice(0, 10);

  return (
    <Dialog open={open} onOpenChange={next => !next && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Seller check for @{user?.handle ?? user?.name}</DialogTitle>
        </DialogHeader>
        {!data ? (
          <p className="text-prism-body text-prism-ink-2">Loading.</p>
        ) : (
          <div className="space-y-3 font-prism">
            <div className="flex flex-wrap items-center gap-2">
              {data.seller.pass ? (
                <WordBadge tone="success">
                  {data.seller.tier === "ENHANCED" ? "Enhanced, passing" : "Standard, passing"}
                </WordBadge>
              ) : (
                <WordBadge tone="warning">
                  {data.seller.reason === "needs_enhanced" ? "Needs Enhanced" : "Not passing"}
                </WordBadge>
              )}
              {!data.ruleOn && <WordBadge tone="neutral">Enhanced rule is off</WordBadge>}
            </div>
            {data.active ? (
              <p className="text-prism-body">
                Allowed by Amped.Bio to sell with Standard until {day(data.active.endsAt)}. Reason:{" "}
                {data.active.reason}
              </p>
            ) : (
              <p className="text-prism-body text-prism-ink-2">No override.</p>
            )}
            <label className="flex flex-col gap-1 text-prism-label font-semibold">
              Allow selling with Standard until
              <Input
                type="date"
                min={new Date().toISOString().slice(0, 10)}
                max={max}
                value={endsOn}
                onChange={e => setEndsOn(e.target.value)}
                className="h-touch"
              />
            </label>
            <label className="flex flex-col gap-1 text-prism-label font-semibold">
              Reason (Required)
              <Input value={reason} onChange={e => setReason(e.target.value)} className="h-touch" />
            </label>
            <label className="flex flex-col gap-1 text-prism-label font-semibold">
              Two factor code
              <Input
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={6}
                value={code}
                onChange={e => setCode(e.target.value.replace(/\D/g, ""))}
                className="h-touch max-w-[160px]"
              />
            </label>
            <p className="flex items-start gap-2 text-prism-label text-prism-ink-2">
              <Info aria-hidden className="mt-0.5 h-4 w-4 shrink-0" />
              The override ends at this date or when the Authbase check ends, whichever is first.
            </p>
          </div>
        )}
        <DialogFooter>
          {data?.active && (
            <Button
              variant="secondary"
              disabled={!ready || end.isPending || !user}
              onClick={() => user && end.mutate({ userId: user.id, reason, code })}
            >
              End override
            </Button>
          )}
          <Button
            disabled={!ready || !endsOn || set.isPending || !user}
            onClick={() =>
              user &&
              set.mutate({
                userId: user.id,
                endsAt: new Date(`${endsOn}T23:59:59Z`).toISOString(),
                reason,
                code,
              })
            }
          >
            Save override
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
