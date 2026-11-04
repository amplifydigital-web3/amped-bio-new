"use client";

import { useEffect, useRef, useState } from "react";
import { z } from "zod";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Check, MessageCircle } from "lucide-react";
import {
  DEFAULT_MESSAGE_BLOCK_LABEL,
  MESSAGE_LIMITS,
  MESSAGE_RULE_LABELS,
  MESSAGE_UI,
  type MessageBlock as MessageBlockType,
  type MessageRuleKind,
  type ThemeConfig,
} from "@repo/constants";
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  Notice,
} from "@repo/ui";
import { trpc, trpcClient } from "@/lib/trpc";
import { useFollowContext } from "@/components/follow/FollowContext";
import { CreatorButton } from "./frame";

export type MessageDoor = { open: boolean; ruleKind: MessageRuleKind };

const S = MESSAGE_UI;
const D = MESSAGE_UI.door;
const DRAFT_KEY = "amped_message_draft";
const PANEL = process.env.NEXT_PUBLIC_PANEL_URL ?? "";

// Session storage is user writable, so the draft is validated before use
const draftSchema = z.object({
  handle: z.string().max(64),
  body: z.string().max(MESSAGE_LIMITS.bodyMax + 200),
});

function readDraft(handle: string): string {
  try {
    const raw = sessionStorage.getItem(DRAFT_KEY);
    const draft = raw ? (draftSchema.safeParse(JSON.parse(raw)).data ?? null) : null;
    return draft?.handle === handle ? draft.body : "";
  } catch {
    return "";
  }
}
function writeDraft(handle: string, body: string) {
  try {
    if (body) sessionStorage.setItem(DRAFT_KEY, JSON.stringify({ handle, body }));
    else sessionStorage.removeItem(DRAFT_KEY);
  } catch {
    /* noop */
  }
}

/** Read and drop ?message=1 once (the sign up card returns with it). */
function takeReturnParam(): boolean {
  const params = new URLSearchParams(window.location.search);
  if (params.get("message") !== "1") return false;
  params.delete("message");
  const query = params.toString();
  window.history.replaceState(
    null,
    "",
    `${window.location.pathname}${query ? `?${query}` : ""}${window.location.hash}`
  );
  return true;
}

function newKey() {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2, 12)}`;
}

function productMessage(error: unknown, fallback: string) {
  const data = (error as { data?: { code?: string } } | null)?.data;
  const message = (error as Error | null)?.message;
  const codes = [
    "FORBIDDEN",
    "PRECONDITION_FAILED",
    "BAD_REQUEST",
    "TOO_MANY_REQUESTS",
    "NOT_FOUND",
  ];
  return data?.code && codes.includes(data.code) && message ? message : fallback;
}

/**
 * Message me on the public page (Build Board #2 r4, PR M6, spec 8.4, board m6). The
 * creator's button with the rule in one line under it, never an amount. Nothing renders
 * while the door is closed (No one, paused, or messaging off).
 *
 * The tap opens a composer sheet over the page. Signed in: `messages.canMessage` answers
 * first, so a refusal shows in the sheet before anything is written; Send writes the
 * message and points to the Inbox. Signed out: the text waits in session storage, the
 * fan sign up card opens, and the person comes back with ?message=1 to the same sheet
 * with the text still there. In app browsers keep the sheet in place.
 */
export function MessageBlock({
  block,
  theme,
  door,
  handle,
  creatorName,
  creatorAvatar,
  signedIn,
  authPending,
  isOwner,
}: {
  block: Pick<MessageBlockType, "config">;
  theme: ThemeConfig | undefined;
  door: MessageDoor | null | undefined;
  handle: string;
  creatorName: string;
  creatorAvatar: string | null;
  signedIn: boolean;
  authPending: boolean;
  isOwner: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [body, setBody] = useState("");
  const [sent, setSent] = useState<{ conversationId: string; folder: string } | null>(null);
  const returned = useRef(false);
  const follow = useFollowContext();

  const doorOpen = !!door?.open;
  const viewerReady = doorOpen && open && signedIn && !authPending && !isOwner;
  const can = useQuery({
    ...trpc.messages.canMessage.queryOptions({ handle }),
    enabled: viewerReady,
    retry: false,
    staleTime: 15_000,
  });

  // Following from the refusal opens the door: ask again once the follow lands
  const following = follow?.state.status?.viewer?.following;
  useEffect(() => {
    if (following && viewerReady) void can.refetch();
  }, [following]); // eslint-disable-line react-hooks/exhaustive-deps

  // Back from sign up: reopen the sheet with the text kept
  useEffect(() => {
    if (returned.current || !doorOpen || authPending) return;
    returned.current = true;
    if (takeReturnParam()) {
      setBody(readDraft(handle));
      setOpen(true);
    }
  }, [doorOpen, authPending, handle]);

  const send = useMutation({
    mutationFn: (text: string) =>
      trpcClient.messages.send.mutate({ to: handle, body: text, idempotencyKey: newKey() }),
    onSuccess: result => {
      writeDraft(handle, "");
      setBody("");
      setSent({ conversationId: result.conversationId, folder: result.folder });
      void can.refetch();
    },
  });

  if (!doorOpen) return null;

  const label = block.config.label?.trim() || DEFAULT_MESSAGE_BLOCK_LABEL;
  const hint = door && door.ruleKind !== "ANYONE" ? MESSAGE_RULE_LABELS[door.ruleKind] : null;
  const trimmed = body.trim();
  const over = body.length > MESSAGE_LIMITS.bodyMax;
  const refusal = can.data && !can.data.allowed ? can.data : null;
  const toRequests = can.data?.allowed && can.data.folder === "REQUESTS";

  const submit = () => {
    if (!trimmed || over) return;
    if (!signedIn) {
      writeDraft(handle, body);
      window.location.href = `/register?intent=message&creator=${encodeURIComponent(handle)}`;
      return;
    }
    send.mutate(trimmed);
  };

  const inboxUrl = sent ? `${PANEL}/inbox/${sent.conversationId}` : `${PANEL}/inbox`;

  return (
    <div className="space-y-1.5">
      <CreatorButton
        theme={theme}
        icon={<MessageCircle className="h-[21px] w-[21px]" />}
        label={label}
        onClick={() => {
          setSent(null);
          send.reset();
          if (!body) setBody(readDraft(handle));
          setOpen(true);
        }}
      />
      {hint && (
        <p
          className="text-center text-[13px] leading-4 opacity-80"
          style={{ color: theme?.fontColor, fontFamily: theme?.fontFamily }}
        >
          {hint}
        </p>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-[520px]">
          {isOwner ? (
            <DialogHeader>
              <DialogTitle>{D.ownerTitle}</DialogTitle>
              <DialogDescription>{D.ownerBody}</DialogDescription>
              <Button asChild variant="secondary" className="mt-[13px] self-start">
                <a href={`${PANEL}/inbox`}>{D.openInbox}</a>
              </Button>
            </DialogHeader>
          ) : sent ? (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <Check aria-hidden className="h-[21px] w-[21px] text-prism-success" />
                  {D.sentTitle}
                </DialogTitle>
                <DialogDescription>
                  {sent.folder === "REQUESTS"
                    ? D.requestBody(creatorName)
                    : D.sentBody(creatorName)}
                </DialogDescription>
              </DialogHeader>
              <Button asChild size="lg" className="w-full">
                <a href={inboxUrl}>{D.openInbox}</a>
              </Button>
            </>
          ) : (
            <>
              <DialogHeader>
                <div className="flex items-center gap-3">
                  {creatorAvatar ? (
                    <img
                      src={creatorAvatar}
                      alt=""
                      width={44}
                      height={44}
                      className="h-[44px] w-[44px] shrink-0 rounded-full object-cover"
                    />
                  ) : null}
                  <div className="min-w-0">
                    <DialogTitle className="truncate">{D.sheetTitle(creatorName)}</DialogTitle>
                    <p className="truncate text-prism-meta text-prism-ink-2">@{handle}</p>
                  </div>
                </div>
                <DialogDescription className={signedIn ? "sr-only" : undefined}>
                  {signedIn ? D.fieldLabel(creatorName) : D.signedOutLine}
                </DialogDescription>
              </DialogHeader>

              {refusal ? (
                <Notice variant={refusal.reason === "sender_cap" ? "warning" : "info"}>
                  <p>{refusal.message}</p>
                  {refusal.reason === "not_follower" && follow && !follow.isOwner && (
                    <Button
                      className="mt-[13px]"
                      disabled={follow.state.busy}
                      onClick={() => follow.state.startFollow("block")}
                    >
                      {S.refusalFollow}
                    </Button>
                  )}
                </Notice>
              ) : (
                <form
                  onSubmit={e => {
                    e.preventDefault();
                    submit();
                  }}
                  className="space-y-[13px]"
                >
                  {toRequests && (
                    <p className="text-prism-meta text-prism-ink-2">{S.goesToRequests(handle)}</p>
                  )}
                  <label htmlFor="message-door-body" className="sr-only">
                    {D.fieldLabel(creatorName)}
                  </label>
                  <textarea
                    id="message-door-body"
                    autoFocus
                    rows={4}
                    value={body}
                    placeholder={S.composerPlaceholder}
                    onChange={e => {
                      setBody(e.target.value);
                      if (!signedIn) writeDraft(handle, e.target.value);
                    }}
                    aria-invalid={over || undefined}
                    aria-describedby={
                      body.length >= MESSAGE_LIMITS.bodyCountFrom ? "message-door-count" : undefined
                    }
                    className="prism-well prism-focus block max-h-[240px] w-full resize-y rounded-prism-13 px-4 py-3 font-prism text-[16px] leading-6 text-prism-ink placeholder:text-prism-ink-3"
                  />
                  {body.length >= MESSAGE_LIMITS.bodyCountFrom && (
                    <p
                      id="message-door-count"
                      aria-live="polite"
                      className={
                        over
                          ? "text-right text-prism-meta font-semibold tabular-nums text-prism-danger"
                          : "text-right text-prism-meta tabular-nums text-prism-ink-2"
                      }
                    >
                      {S.charsLeft(MESSAGE_LIMITS.bodyMax - body.length)}
                    </p>
                  )}
                  {send.isError && (
                    <Notice variant="error">{productMessage(send.error, D.failed)}</Notice>
                  )}
                  <Button
                    type="submit"
                    size="lg"
                    className="w-full"
                    disabled={
                      !trimmed ||
                      over ||
                      send.isPending ||
                      (signedIn && (authPending || can.isLoading))
                    }
                  >
                    {!signedIn
                      ? D.continue
                      : send.isPending
                        ? D.sending
                        : can.isLoading
                          ? D.checking
                          : D.send}
                  </Button>
                </form>
              )}
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
