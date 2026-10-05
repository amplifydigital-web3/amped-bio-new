import { useMemo, useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { TRPCClientError } from "@trpc/client";
import { Bold, Inbox, Italic, Link2, Send } from "lucide-react";
import {
  BROADCAST_ALTERNATIVES,
  BROADCAST_LIMITS,
  BROADCAST_POLICY,
  checkBroadcastContent,
} from "@repo/constants";
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Notice,
  trpc,
  trpcClient,
} from "@repo/ui";
import { toast } from "@/components/ui/toast";
import { BroadcastBody, BroadcastFooter, Avatar } from "./shared";

interface ComposerProps {
  chainId: string;
  poolName: string;
  members: number;
  creatorName: string;
  creatorAvatar?: string | null;
  leftToday: number;
  nextSendReviewed: boolean;
  onCancel: () => void;
  onSent: (id: number) => void;
}

const newKey = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;

/**
 * Board br1: My Pool, New broadcast. Phase 1 sends to all members' Amped
 * inbox. The word list warns and never blocks (Rob, 2026-10-04): a flagged
 * message needs one extra confirm, then sends.
 */
export function Composer({
  chainId,
  poolName,
  members,
  creatorName,
  creatorAvatar,
  leftToday,
  nextSendReviewed,
  onCancel,
  onSent,
}: ComposerProps) {
  const queryClient = useQueryClient();
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [policyOpen, setPolicyOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const keyRef = useRef(newKey());
  const bodyRef = useRef<HTMLTextAreaElement>(null);

  const flags = useMemo(() => checkBroadcastContent(title, body), [title, body]);
  const phrases = [...new Set(flags.map(f => f.phrase))];
  const memberLabel = `${members.toLocaleString()} ${members === 1 ? "member" : "members"}`;

  const send = useMutation({
    mutationFn: (confirmFlags: boolean) =>
      trpcClient.broadcast.creator.send.mutate({
        chainId,
        title,
        body,
        idempotencyKey: keyRef.current,
        confirmFlags,
      }),
    onSuccess: res => {
      setConfirmOpen(false);
      void queryClient.invalidateQueries({ queryKey: trpc.broadcast.creator.pathKey() });
      toast.add(
        res.status === "IN_REVIEW"
          ? {
              type: "info",
              title: "Sent for review",
              description: "Amped reviews your first broadcast before it reaches members.",
            }
          : { type: "success", title: `Sending to ${memberLabel}` }
      );
      onSent(res.id);
    },
    onError: e => {
      setConfirmOpen(false);
      setError(
        e instanceof TRPCClientError ? e.message : "Your broadcast was not sent. Try again."
      );
    },
  });

  const titleError =
    title.length > BROADCAST_LIMITS.titleMax
      ? `Titles are ${BROADCAST_LIMITS.titleMax} characters or fewer.`
      : undefined;
  const bodyTooLong = body.length > BROADCAST_LIMITS.bodyMax;
  const ready = title.trim() && body.trim() && !titleError && !bodyTooLong && leftToday > 0;

  // Wrap the selection in Markdown markers (bold, italic) or a link
  const wrap = (before: string, after: string, placeholder: string) => {
    const el = bodyRef.current;
    if (!el) return;
    const { selectionStart: s, selectionEnd: e } = el;
    const picked = body.slice(s, e) || placeholder;
    const next = body.slice(0, s) + before + picked + after + body.slice(e);
    setBody(next);
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(s + before.length, s + before.length + picked.length);
    });
  };

  const submit = () => {
    setError(null);
    if (phrases.length > 0) setConfirmOpen(true);
    else send.mutate(false);
  };

  const toolbarBtn =
    "prism-focus inline-flex h-touch w-touch items-center justify-center rounded-prism-13 text-prism-ink-2 hover:bg-white/60";

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,420px)]">
      <form
        className="prism-slab flex min-w-0 flex-col gap-5 rounded-prism-21 p-5"
        onSubmit={e => {
          e.preventDefault();
          if (ready) submit();
        }}
      >
        <div>
          <span className="block text-prism-label font-semibold text-prism-ink">Send to</span>
          <div className="prism-lens-thumb mt-2 flex items-start gap-3 rounded-prism-13 px-4 py-3">
            <Inbox
              aria-hidden
              className="mt-0.5 h-5 w-5 shrink-0 text-prism-nav"
              strokeWidth={1.5}
            />
            <div className="min-w-0">
              <span className="block text-prism-label font-semibold text-prism-ink">
                All members
              </span>
              <span className="block text-prism-meta font-normal text-prism-ink-2">
                Everyone with a stake in {poolName}. {memberLabel} get it in their Amped inbox.
              </span>
            </div>
          </div>
        </div>

        <Input
          label="Title"
          value={title}
          onChange={e => setTitle(e.target.value)}
          maxLength={BROADCAST_LIMITS.titleMax + 20}
          error={titleError}
          labelAction={
            <span className="text-prism-meta tabular-nums text-prism-ink-3">
              {title.length} of {BROADCAST_LIMITS.titleMax}
            </span>
          }
        />

        <div className="space-y-2">
          <div className="flex items-baseline justify-between gap-3">
            <label
              htmlFor="broadcast-body"
              className="text-prism-label font-semibold text-prism-ink"
            >
              Message
            </label>
            <span
              className={`text-prism-meta tabular-nums ${bodyTooLong ? "text-prism-danger" : "text-prism-ink-3"}`}
            >
              {body.length.toLocaleString()} of {BROADCAST_LIMITS.bodyMax.toLocaleString()}
            </span>
          </div>
          <div className="prism-well overflow-hidden rounded-prism-13">
            <div
              role="toolbar"
              aria-label="Formatting"
              className="flex gap-1 border-b border-prism-line px-2 py-1"
            >
              <button
                type="button"
                className={toolbarBtn}
                aria-label="Bold"
                onClick={() => wrap("**", "**", "bold text")}
              >
                <Bold aria-hidden className="h-5 w-5" strokeWidth={1.75} />
              </button>
              <button
                type="button"
                className={toolbarBtn}
                aria-label="Italic"
                onClick={() => wrap("_", "_", "italic text")}
              >
                <Italic aria-hidden className="h-5 w-5" strokeWidth={1.75} />
              </button>
              <button
                type="button"
                className={toolbarBtn}
                aria-label="Link"
                onClick={() => wrap("[", "](https://)", "link text")}
              >
                <Link2 aria-hidden className="h-5 w-5" strokeWidth={1.75} />
              </button>
            </div>
            <textarea
              id="broadcast-body"
              ref={bodyRef}
              value={body}
              onChange={e => setBody(e.target.value)}
              rows={8}
              aria-describedby="broadcast-body-help"
              className="block w-full resize-y bg-transparent px-4 py-3 font-prism text-prism-body text-prism-ink outline-none placeholder:text-prism-ink-3"
              placeholder="An update about your work for the members of your pool."
            />
          </div>
          <p id="broadcast-body-help" className="text-prism-meta text-prism-ink-3">
            Bold, italic and up to {BROADCAST_LIMITS.linksMax} links starting with https://. A blank
            line starts a new paragraph.
          </p>
        </div>

        {phrases.length > 0 && (
          <Notice
            variant="warning"
            title={`${phrases.map(p => `"${p}"`).join(", ")} ${phrases.length === 1 ? "is" : "are"} on the broadcast word list.`}
          >
            Members still get it if you send. Try &ldquo;{BROADCAST_ALTERNATIVES[2]}&rdquo; or
            &ldquo;
            {BROADCAST_ALTERNATIVES[3]}&rdquo; instead.{" "}
            <button
              type="button"
              className="prism-focus rounded-prism-5 font-semibold text-prism-nav underline underline-offset-4"
              aria-expanded={policyOpen}
              onClick={() => setPolicyOpen(o => !o)}
            >
              Broadcast policy
            </button>
            {policyOpen && <span className="mt-2 block">{BROADCAST_POLICY}</span>}
          </Notice>
        )}

        {error && (
          <Notice variant="error" role="alert">
            {error}
          </Notice>
        )}

        <div className="mt-auto flex flex-wrap items-center justify-between gap-3 pt-2">
          <Button type="button" variant="secondary" onClick={onCancel}>
            Cancel
          </Button>
          <Button type="submit" size="lg" disabled={!ready || send.isPending}>
            <Send aria-hidden />
            {send.isPending ? "Sending…" : `Send to ${memberLabel}`}
          </Button>
        </div>
        <p className="text-right text-prism-meta text-prism-ink-3">
          {leftToday > 0
            ? `${leftToday} ${leftToday === 1 ? "send" : "sends"} left today.`
            : "No sends left today. You can send again tomorrow."}
          {nextSendReviewed && " Your first broadcast is reviewed before it goes out."}
        </p>
      </form>

      <aside aria-label="Inbox preview" className="min-w-0 space-y-3">
        <span className="block text-prism-eyebrow uppercase text-prism-ink-2">Inbox preview</span>
        <div className="prism-slab space-y-4 rounded-prism-21 p-5">
          <div className="flex items-center gap-3">
            <Avatar name={creatorName} src={creatorAvatar} />
            <div className="min-w-0">
              <span className="block truncate text-prism-label font-semibold text-prism-ink">
                {creatorName}
              </span>
              <span className="block truncate text-prism-meta text-prism-ink-2">
                {poolName}, now
              </span>
            </div>
          </div>
          <h2 className="text-prism-panel-title text-prism-ink [text-wrap:balance]">
            {title.trim() || "Your title"}
          </h2>
          {body.trim() ? (
            <BroadcastBody body={body} />
          ) : (
            <p className="text-prism-body text-prism-ink-3">
              Your message shows here as members will see it.
            </p>
          )}
          <BroadcastFooter creatorName={creatorName} />
        </div>
      </aside>

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Send with these words?</DialogTitle>
            <DialogDescription>
              {phrases.map(p => `"${p}"`).join(", ")} {phrases.length === 1 ? "is" : "are"} on the
              broadcast word list. Members get the message as written. Amped keeps a record of
              flagged broadcasts and can remove one that breaks the policy.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="secondary" onClick={() => setConfirmOpen(false)}>
              Edit message
            </Button>
            <Button onClick={() => send.mutate(true)} disabled={send.isPending}>
              {send.isPending ? "Sending…" : "Send anyway"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
