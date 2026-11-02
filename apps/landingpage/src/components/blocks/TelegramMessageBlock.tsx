"use client";

import { useEffect, useRef, useState } from "react";
import { z } from "zod";
import { useQuery } from "@tanstack/react-query";
import { Check, Loader2, Send } from "lucide-react";
import {
  DEFAULT_TELEGRAM_MESSAGE_LABEL,
  DM_RULE_LABELS,
  TELEGRAM_APP_STRINGS as S,
  type DmRuleKind,
  type TelegramMessageBlock as TelegramMessageBlockType,
  type ThemeConfig,
  telegramPayload,
} from "@repo/constants";
import {
  Button,
  Checkbox,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  Notice,
} from "@repo/ui";
import { trpc, trpcClient } from "@/lib/trpc";
import { CreatorButton } from "./frame";

export type TelegramDoor = {
  open: boolean;
  ruleKind: DmRuleKind;
  botUsername: string | null;
  /** Creator's short code for the deep link (spec r3 3.5). Older servers omit it. */
  linkCode?: string | null;
};

const PREFS_KEY = "amped_tg_link_prefs";
const INTENT_KEY = "amped_message_intent";

// Session storage is user writable, so the shape is validated before use
const linkPrefsSchema = z.object({
  handle: z.string().max(64),
  updates: z.boolean(),
  username: z.boolean(),
});
type LinkPrefs = z.infer<typeof linkPrefsSchema>;

function readPrefs(handle: string): LinkPrefs | null {
  try {
    const raw = sessionStorage.getItem(PREFS_KEY);
    const prefs = raw ? (linkPrefsSchema.safeParse(JSON.parse(raw)).data ?? null) : null;
    return prefs?.handle === handle ? prefs : null;
  } catch {
    return null;
  }
}

function clearPrefs() {
  try {
    sessionStorage.removeItem(PREFS_KEY);
  } catch {
    /* noop */
  }
}

/** Read and drop ?message=1 and ?telegram= once; the values come back. */
function takeReturnParams(): { message: boolean; telegram: string | null } {
  const params = new URLSearchParams(window.location.search);
  const message = params.get("message") === "1";
  const telegram = params.get("telegram");
  if (!message && !telegram) return { message, telegram };
  params.delete("message");
  params.delete("telegram");
  const query = params.toString();
  window.history.replaceState(
    null,
    "",
    `${window.location.pathname}${query ? `?${query}` : ""}${window.location.hash}`
  );
  return { message, telegram };
}

/**
 * Message me on Telegram on the public page (Build Board #2, Screen Review 115 and
 * 122, boards tg4 public and tg11). The creator's button with the rule in one line
 * under it, in the creator's text color, never an amount. Nothing renders while the
 * creator's Fan messages are off.
 *
 * A signed out visitor goes to the fan sign up card ("Sign up to message {creator}
 * on Telegram") and comes back with ?message=1. A signed in visitor who has not
 * linked Telegram gets the fan link sheet (wizard B): one Link Telegram with two
 * unticked checkboxes, then Open Telegram with the creator selected. A linked fan
 * the creator's rule refuses sees the reason here; one it admits goes straight to
 * the bot. The bot checks the rule again.
 */
export function TelegramMessageBlock({
  block,
  theme,
  door,
  handle,
  creatorUserId,
  creatorName,
  creatorAvatar,
  signedIn,
  authPending,
  isOwner,
}: {
  block: TelegramMessageBlockType;
  theme: ThemeConfig | undefined;
  door: TelegramDoor | null | undefined;
  handle: string;
  creatorUserId: number;
  creatorName: string;
  creatorAvatar: string | null;
  signedIn: boolean;
  authPending: boolean;
  isOwner: boolean;
}) {
  const open = !!door?.open && !!door.botUsername;
  const viewerReady = open && signedIn && !authPending && !isOwner;
  const status = useQuery({
    ...trpc.telegram.link.status.queryOptions(),
    enabled: viewerReady,
    retry: false,
  });
  const verdict = useQuery({
    ...trpc.messaging.fan.canMessage.queryOptions({ creatorUserId }),
    enabled: viewerReady && !!status.data?.linked,
    retry: false,
  });
  const [sheet, setSheet] = useState<"link" | "linked" | null>(null);
  const [linkError, setLinkError] = useState<string | null>(null);
  const [refusal, setRefusal] = useState<string | null>(null);
  const [updates, setUpdates] = useState(false);
  const [username, setUsername] = useState(false);
  const [starting, setStarting] = useState(false);
  // Back from sign up: open the link sheet once the link status is known
  const [resumeTap, setResumeTap] = useState(false);
  const returned = useRef(false);

  const label = block.config.label?.trim() || DEFAULT_TELEGRAM_MESSAGE_LABEL;
  const hint = door && door.ruleKind !== "ANYONE" ? DM_RULE_LABELS[door.ruleKind] : null;
  const dmLink = door?.botUsername
    ? `https://t.me/${door.botUsername}?start=${
        door.linkCode ? telegramPayload.message(door.linkCode) : `dm_${encodeURIComponent(handle)}`
      }`
    : null;

  // Back from Telegram (?telegram=) or from sign up (?message=1), once
  useEffect(() => {
    if (returned.current || !open || authPending) return;
    returned.current = true;
    const { message, telegram } = takeReturnParams();
    if (!message && !telegram) return;
    let intended = false;
    try {
      intended = sessionStorage.getItem(INTENT_KEY) === handle;
      sessionStorage.removeItem(INTENT_KEY);
    } catch {
      /* noop */
    }
    if (telegram === "linked") {
      const prefs = readPrefs(handle);
      if (prefs && (prefs.updates || prefs.username)) {
        // The choices survive until the server confirms, so a failed save can be retried
        void trpcClient.telegram.link.setPreferences
          .mutate({
            ...(prefs.updates ? { telegramBroadcasts: true } : {}),
            ...(prefs.username ? { shareUsername: true } : {}),
          })
          .then(clearPrefs)
          .catch(error => {
            console.error("[telegram] preference save failed", error);
            setLinkError(S.errors.declined);
          });
      } else {
        clearPrefs();
      }
      // A fan who tapped Message me before the link continues into the thread
      // instead of stopping at the linked sheet
      if (message && intended) setResumeTap(true);
      void status.refetch();
      setSheet("linked");
    } else if (telegram) {
      setLinkError(telegram === "conflict" ? S.errors.alreadyLinked : S.errors.declined);
      setSheet("link");
    } else if (message && intended && signedIn) {
      setResumeTap(true);
    }
  }, [open, authPending, signedIn, handle, status]);
  useEffect(() => {
    if (!resumeTap || !status.data) return;
    if (!status.data.linked) {
      setResumeTap(false);
      setSheet("link");
      return;
    }
    // Linked: wait for the messaging verdict before presenting the action
    if (!verdict.data) return;
    setResumeTap(false);
    if (!verdict.data.allowed) setRefusal(verdict.data.message);
    else if (dmLink) window.open(dmLink, "_blank", "noopener,noreferrer");
  }, [resumeTap, status.data, verdict.data, dmLink]);

  if (!open) return null;

  const startLink = async () => {
    setLinkError(null);
    setStarting(true);
    try {
      sessionStorage.setItem(PREFS_KEY, JSON.stringify({ handle, updates, username }));
    } catch {
      /* noop */
    }
    try {
      const { url } = await trpcClient.telegram.link.start.mutate({
        returnTo: { to: "fan", handle },
      });
      window.location.assign(url);
    } catch {
      setLinkError(S.fanLink.unavailable);
      setStarting(false);
    }
  };

  const onTap = () => {
    setRefusal(null);
    if (isOwner) return;
    if (!signedIn) {
      try {
        sessionStorage.setItem(INTENT_KEY, handle);
      } catch {
        /* noop */
      }
      window.location.href = `/register?intent=message&creator=${encodeURIComponent(handle)}`;
      return;
    }
    if (!status.data?.linked) {
      setSheet("link");
      return;
    }
    if (verdict.data && !verdict.data.allowed) setRefusal(verdict.data.message);
    // The rule check has not answered yet: the bot checks it anyway
    else if (!verdict.data && dmLink) window.open(dmLink, "_blank", "noopener,noreferrer");
  };

  // A linked fan the rule admits gets a real link, so the new tab is not a popup
  const direct = viewerReady && !!status.data?.linked && verdict.data?.allowed === true;

  return (
    <div className="space-y-1.5">
      <CreatorButton
        theme={theme}
        icon={<Send className="h-[21px] w-[21px]" />}
        label={label}
        href={direct && dmLink ? dmLink : undefined}
        onClick={direct ? undefined : onTap}
      />
      {hint && (
        <p
          className="text-center text-[13px] leading-4 opacity-80"
          style={{ color: theme?.fontColor, fontFamily: theme?.fontFamily }}
        >
          {hint}
        </p>
      )}
      {refusal && (
        <p
          role="status"
          className="text-center text-[13px] leading-4"
          style={{ color: theme?.fontColor, fontFamily: theme?.fontFamily }}
        >
          {refusal}
        </p>
      )}

      <Dialog open={sheet !== null} onOpenChange={next => !next && setSheet(null)}>
        <DialogContent>
          {sheet === "linked" ? (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <Check aria-hidden className="h-[21px] w-[21px] text-prism-success" />
                  {S.fanLink.linkedTitle}
                </DialogTitle>
                <DialogDescription>{S.fanLink.linkedLine(creatorName)}</DialogDescription>
              </DialogHeader>
              {dmLink && (
                <Button size="lg" className="w-full" asChild>
                  <a
                    href={dmLink}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={() => setSheet(null)}
                  >
                    <Send aria-hidden />
                    {S.fanLink.openTelegram}
                  </a>
                </Button>
              )}
              {linkError && <Notice variant="error">{linkError}</Notice>}
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
                  <p className="text-prism-label font-semibold text-prism-ink">
                    {S.fanLink.cardLine(creatorName)}
                  </p>
                </div>
                <DialogTitle>{S.fanLink.title}</DialogTitle>
                <DialogDescription>{S.fanLink.footnote}</DialogDescription>
              </DialogHeader>
              {status.data && !status.data.available ? (
                <Notice variant="info">{S.fanLink.unavailable}</Notice>
              ) : (
                <>
                  <div>
                    <Checkbox checked={updates} onCheckedChange={setUpdates}>
                      {S.fanLink.updatesCheckbox}
                    </Checkbox>
                    <Checkbox checked={username} onCheckedChange={setUsername}>
                      {S.fanLink.usernameCheckbox}
                    </Checkbox>
                  </div>
                  {linkError && <Notice variant="error">{linkError}</Notice>}
                  <Button
                    size="lg"
                    className="w-full"
                    onClick={() => void startLink()}
                    disabled={starting}
                    aria-busy={starting}
                  >
                    {starting && (
                      <Loader2 aria-hidden className="animate-spin motion-reduce:animate-none" />
                    )}
                    {S.linkButton}
                  </Button>
                </>
              )}
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
