import { useMemo, useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { TRPCClientError } from "@trpc/client";
import { Bold, Italic, Link2, Send } from "lucide-react";
import {
  BROADCAST_ALTERNATIVES,
  BROADCAST_AUDIENCES,
  BROADCAST_LIMITS,
  BROADCAST_POLICY,
  TELEGRAM_APP_STRINGS,
  BROADCAST_UI,
  TESTNET_NOTICE,
  audienceHasPool,
  broadcastMentionsPool,
  checkBroadcastContent,
  type BroadcastAudience,
} from "@repo/constants";
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
  Notice,
  cn,
  trpc,
  trpcClient,
} from "@repo/ui";
import { toast } from "@/components/ui/toast";
import { BroadcastBody, BroadcastFooter, Avatar } from "./shared";
import { isFeatureOn } from "../../../config/featureFlags";

const TELEGRAM_ON = isFeatureOn("telegram");

export type AudienceCounts = { pool: number; followers: number; total: number };

/** How many people an audience reaches (Both is deduplicated on the server). */
export function reachOf(audience: BroadcastAudience, counts: AudienceCounts) {
  if (audience === "POOL_MEMBERS") return counts.pool;
  if (audience === "FOLLOWERS") return counts.followers;
  return counts.total;
}

interface ComposerProps {
  chainId: string;
  /** Null without a pool: only Followers can be picked */
  poolName: string | null;
  counts: AudienceCounts;
  initialAudience?: BroadcastAudience;
  creatorName: string;
  creatorAvatar?: string | null;
  leftToday: number;
  nextSendReviewed: boolean;
  /** Messaging on Telegram (#2), row 117. Absent or unavailable: no Telegram checkbox. */
  telegram?: { available: boolean; creatorLinked: boolean; reach: number };
  onCancel: () => void;
  onSent: (id: number) => void;
}

const newKey = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;

/**
 * Inbox, Broadcast, New broadcast (M9, spec 8.6 item 3). The audience picker sends to
 * pool stakers, followers, or both, with each count and the deduplicated total before
 * send. Phase 1 lands in the Amped.Bio inbox. The word list warns and never blocks
 * (Rob, 2026-10-04): a flagged message needs one extra confirm, then sends.
 */
export function Composer({
  chainId,
  poolName,
  counts,
  initialAudience,
  creatorName,
  creatorAvatar,
  leftToday,
  nextSendReviewed,
  telegram,
  onCancel,
  onSent,
}: ComposerProps) {
  const queryClient = useQueryClient();
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [policyOpen, setPolicyOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const showTelegram = TELEGRAM_ON && !!telegram?.available;
  const [sendTelegram, setSendTelegram] = useState(false);
  const keyRef = useRef(newKey());
  const bodyRef = useRef<HTMLTextAreaElement>(null);

  const hasPool = poolName !== null;
  const [audience, setAudience] = useState<BroadcastAudience>(() =>
    initialAudience && (hasPool || !audienceHasPool(initialAudience))
      ? initialAudience
      : hasPool
        ? "POOL_MEMBERS"
        : "FOLLOWERS"
  );
  const reach = reachOf(audience, counts);
  const flags = useMemo(() => checkBroadcastContent(title, body), [title, body]);
  const phrases = [...new Set(flags.map(f => f.phrase))];
  const memberLabel = BROADCAST_UI.people(reach);
  // bc-pool-terms: the Testnet notice shows for a pool audience or pool language
  const testnet = audienceHasPool(audience) || broadcastMentionsPool(title, body);

  const send = useMutation({
    mutationFn: (confirmFlags: boolean) =>
      trpcClient.broadcast.creator.send.mutate({
        chainId,
        audience,
        title,
        body,
        idempotencyKey: keyRef.current,
        confirmFlags,
        // A stale checked state must not send when the link went away mid-composition
        sendTelegram: showTelegram && sendTelegram && !!telegram?.creatorLinked,
      }),
    onSuccess: res => {
      setConfirmOpen(false);
      void queryClient.invalidateQueries({ queryKey: trpc.broadcast.creator.pathKey() });
      toast.add(
        res.status === "IN_REVIEW"
          ? {
              type: "info",
              title: "Sent for review",
              description: BROADCAST_UI.firstSend,
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
  const ready =
    title.trim() && body.trim() && !titleError && !bodyTooLong && leftToday > 0 && reach > 0;

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
        <fieldset>
          <legend className="block text-prism-label font-semibold text-prism-ink">
            {BROADCAST_UI.audienceLegend}
          </legend>
          <div className="mt-2 grid gap-2 sm:grid-cols-3">
            {BROADCAST_AUDIENCES.map(value => {
              const disabled = audienceHasPool(value) && !hasPool;
              const n = reachOf(value, counts);
              return (
                <label
                  key={value}
                  className={cn(
                    "flex min-h-touch focus-within:ring-2 focus-within:ring-prism-nav cursor-pointer flex-col gap-1 rounded-prism-13 px-4 py-3",
                    audience === value ? "prism-lens-thumb" : "prism-row",
                    disabled && "cursor-not-allowed opacity-60"
                  )}
                >
                  <span className="flex items-center gap-2">
                    <input
                      type="radio"
                      name="broadcast-audience"
                      value={value}
                      checked={audience === value}
                      disabled={disabled}
                      onChange={() => setAudience(value)}
                      aria-label={BROADCAST_UI.audience[value].label}
                      aria-describedby={`broadcast-audience-${value}`}
                      className="h-5 w-5 accent-prism-nav"
                    />
                    <span className="text-prism-label font-semibold text-prism-ink">
                      {BROADCAST_UI.audience[value].label}
                    </span>
                  </span>
                  <span
                    id={`broadcast-audience-${value}`}
                    className="text-prism-meta tabular-nums text-prism-ink-2"
                  >
                    {disabled ? BROADCAST_UI.noPool : BROADCAST_UI.people(n)}
                  </span>
                </label>
              );
            })}
          </div>
          <p className="mt-2 text-prism-meta text-prism-ink-2" aria-live="polite">
            {BROADCAST_UI.audienceHelp[audience]}{" "}
            {reach > 0 ? BROADCAST_UI.total(reach) : BROADCAST_UI.emptyAudience[audience]}
          </p>
        </fieldset>

        {showTelegram && telegram && (
          <div>
            <Checkbox
              checked={sendTelegram && telegram.creatorLinked}
              disabled={!telegram.creatorLinked}
              onCheckedChange={setSendTelegram}
              helper={
                !telegram.creatorLinked
                  ? TELEGRAM_APP_STRINGS.composerNotLinked
                  : telegram.reach > 0
                    ? TELEGRAM_APP_STRINGS.composerReach(telegram.reach)
                    : TELEGRAM_APP_STRINGS.composerReachZero
              }
            >
              {TELEGRAM_APP_STRINGS.composerChannelLabel}
            </Checkbox>
            {sendTelegram && phrases.length > 0 && (
              <p className="mt-1 text-prism-meta text-prism-ink-2">
                {TELEGRAM_APP_STRINGS.composerFlaggedNote}
              </p>
            )}
          </div>
        )}

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
              placeholder="An update about your work."
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
            It still sends if you choose. Try &ldquo;{BROADCAST_ALTERNATIVES[2]}&rdquo; or &ldquo;
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
            {send.isPending ? "Sending…" : BROADCAST_UI.sendTo(reach)}
          </Button>
        </div>
        <p className="text-right text-prism-meta text-prism-ink-3">
          {leftToday > 0
            ? `${leftToday} ${leftToday === 1 ? "send" : "sends"} left today.`
            : "No sends left today. You can send again tomorrow."}
          {nextSendReviewed && ` ${BROADCAST_UI.firstSend}`}
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
                {BROADCAST_UI.audience[audience].line}, now
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
              Your message shows here as people will see it.
            </p>
          )}
          {testnet && (
            <p className="text-prism-meta font-semibold text-prism-warning-ink">{TESTNET_NOTICE}</p>
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
              broadcast word list. Everyone in the audience gets the message as written. Amped keeps
              a record of flagged broadcasts and can remove one that breaks the policy.
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
