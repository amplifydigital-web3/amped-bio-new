import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { TRPCClientError } from "@trpc/client";
import { Loader2, Send } from "lucide-react";
import { TELEGRAM_APP_STRINGS as S } from "@repo/constants";
import {
  Button,
  Checkbox,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Notice,
  Skeleton,
  trpc,
  trpcClient,
} from "@repo/ui";
import { toast } from "@/components/ui/toast";
import { TelegramBotStartNotice } from "../messages/TelegramBotStartNotice";

// Messaging on Telegram (Build Board #2), Screen Review row 112, board tg1.
// The Telegram link sits at the top of Account, Connected apps. Not linked: one
// line and Link Telegram. Linked: the username, three 24 checkboxes (never
// switches, 087 D1) and Unlink. Log In with Telegram returns to this row with
// ?telegram=<result>, which becomes a toast or a local error.

export const TELEGRAM_ON = import.meta.env.VITE_SHOW_TELEGRAM === "true";

const RESULT_ERRORS: Record<string, string> = {
  conflict: S.errors.alreadyLinked,
  declined: S.errors.declined,
  expired: S.errors.declined,
  error: S.errors.declined,
};

function TelegramArt() {
  return (
    <span
      aria-hidden
      className="prism-well flex h-[34px] w-[34px] shrink-0 items-center justify-center !rounded-prism-8 text-prism-ink-2"
    >
      <Send className="h-[18px] w-[18px]" strokeWidth={1.75} />
    </span>
  );
}

function useLinkResult(onError: (message: string) => void) {
  const [params, setParams] = useSearchParams();
  const queryClient = useQueryClient();
  const handled = useRef(false);
  const result = params.get("telegram");
  useEffect(() => {
    if (!result || handled.current) return;
    handled.current = true;
    if (result === "linked") {
      toast.add({ type: "success", title: S.linkedToast });
      void queryClient.invalidateQueries({ queryKey: trpc.telegram.link.status.queryKey() });
    } else if (RESULT_ERRORS[result]) {
      onError(RESULT_ERRORS[result]!);
    }
    const next = new URLSearchParams(params);
    next.delete("telegram");
    setParams(next, { replace: true });
  }, [result, params, setParams, queryClient, onError]);
}

export function TelegramConnection() {
  const queryClient = useQueryClient();
  const status = useQuery(trpc.telegram.link.status.queryOptions());
  const [error, setError] = useState<string | null>(null);
  const [confirmUnlink, setConfirmUnlink] = useState(false);
  useLinkResult(setError);

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: trpc.telegram.link.status.queryKey() });

  const start = useMutation({
    mutationFn: () => trpcClient.telegram.link.start.mutate(),
    onSuccess: ({ url }) => window.location.assign(url),
    onError: e => setError(e instanceof TRPCClientError ? e.message : S.errors.declined),
  });

  const setPreference = useMutation({
    mutationFn: (input: {
      shareUsername?: boolean;
      showTelegramOnBio?: boolean;
      telegramBroadcasts?: boolean;
    }) => trpcClient.telegram.link.setPreferences.mutate(input),
    onSettled: () => void invalidate(),
    onError: () =>
      toast.add({ type: "error", title: "Not saved. Check your connection and try again." }),
  });

  const unlink = useMutation({
    mutationFn: () => trpcClient.telegram.link.unlink.mutate(),
    onSuccess: () => {
      setConfirmUnlink(false);
      toast.add({ type: "success", title: S.unlinkUndo });
      void invalidate();
    },
    onError: () => toast.add({ type: "error", title: "Telegram was not unlinked. Try again." }),
  });

  if (status.isLoading) {
    return (
      <div aria-busy className="flex h-commit items-center gap-3">
        <Skeleton className="h-[34px] w-[34px] rounded-prism-8" />
        <Skeleton className="h-4 flex-1 rounded-full" />
      </div>
    );
  }
  // Hidden until the bot is set up on this environment
  if (!status.data || !status.data.available) return null;
  const data = status.data;

  if (!data.linked) {
    return (
      <section
        aria-label={S.accountRowTitle}
        className="space-y-[13px] border-b border-prism-line pb-[21px]"
      >
        <div className="flex flex-col gap-[13px] sm:flex-row sm:items-center">
          <div className="flex min-w-0 flex-1 items-start gap-3">
            <TelegramArt />
            <p className="text-prism-body text-prism-ink">{S.accountNotLinked.body}</p>
          </div>
          <Button
            type="button"
            onClick={() => {
              setError(null);
              start.mutate();
            }}
            disabled={start.isPending}
            aria-busy={start.isPending}
            className="max-sm:w-full"
          >
            {start.isPending && (
              <Loader2 aria-hidden className="animate-spin motion-reduce:animate-none" />
            )}
            {S.linkButton}
          </Button>
        </div>
        {error && (
          <Notice variant="error" role="alert">
            {error}
          </Notice>
        )}
      </section>
    );
  }

  const busy = setPreference.isPending;
  return (
    <section
      aria-label={S.accountRowTitle}
      className="space-y-[13px] border-b border-prism-line pb-[21px]"
    >
      <div className="flex flex-col gap-[13px] sm:flex-row sm:items-center">
        <div className="flex min-w-0 flex-1 items-start gap-3">
          <TelegramArt />
          <div className="min-w-0">
            <p className="text-prism-label font-semibold text-prism-ink">{S.accountRowTitle}</p>
            <p className="text-prism-meta text-prism-ink-2 [overflow-wrap:anywhere]">
              {data.username ? S.accountLinkedAs(data.username) : S.accountLinkedNoUsername}
            </p>
          </div>
        </div>
        <Button
          type="button"
          variant="secondary"
          onClick={() => setConfirmUnlink(true)}
          className="max-sm:w-full"
        >
          {S.unlinkButton}
        </Button>
      </div>

      {(data.blocked || !data.botAccess) && (
        <TelegramBotStartNotice botUsername={data.botUsername} blocked={data.blocked} />
      )}
      {error && (
        <Notice variant="error" role="alert">
          {error}
        </Notice>
      )}

      <div>
        <Checkbox
          checked={data.telegramBroadcasts}
          disabled={busy}
          onCheckedChange={checked => setPreference.mutate({ telegramBroadcasts: checked })}
          helper={S.accountUpdatesCheckbox.helper}
        >
          {S.accountUpdatesCheckbox.label}
        </Checkbox>
        <Checkbox
          checked={data.shareUsername}
          disabled={busy}
          onCheckedChange={checked => setPreference.mutate({ shareUsername: checked })}
          helper={S.accountShareUsernameCheckbox.helper}
        >
          {S.accountShareUsernameCheckbox.label}
        </Checkbox>
        <Checkbox
          checked={data.showTelegramOnBio}
          disabled={busy}
          onCheckedChange={checked => setPreference.mutate({ showTelegramOnBio: checked })}
          helper={S.accountMarkCheckbox.helper}
        >
          {S.accountMarkCheckbox.label}
        </Checkbox>
      </div>

      <Dialog open={confirmUnlink} onOpenChange={setConfirmUnlink}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{S.unlinkConfirmTitle}</DialogTitle>
            <DialogDescription>{S.unlinkConfirmBody}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="secondary" onClick={() => setConfirmUnlink(false)}>
              Keep linked
            </Button>
            <Button onClick={() => unlink.mutate()} disabled={unlink.isPending}>
              {unlink.isPending ? "Unlinking…" : S.unlinkButton}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}
