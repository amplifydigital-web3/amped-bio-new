"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Users } from "lucide-react";
import {
  DEFAULT_TELEGRAM_GROUP_LABEL,
  DM_RULE_LABELS,
  TELEGRAM_APP_STRINGS as S,
  type TelegramGroupBlock as TelegramGroupBlockType,
  type ThemeConfig,
  telegramPayload,
} from "@repo/constants";
import { trpc, trpcClient } from "@/lib/trpc";
import { CreatorButton } from "./frame";
import type { TelegramDoor } from "./TelegramMessageBlock";

const INTENT_KEY = "amped_message_intent";

/** The line that says what lets a visitor in (joinGroupHint), never an amount. */
function refusalLine(door: TelegramDoor, creatorName: string) {
  const hints = S.joinGroupHint;
  if (door.ruleKind === "PAID_MEMBER") return hints.PAID_MEMBER(creatorName);
  if (door.ruleKind === "POOL_MEMBER") return hints.POOL_MEMBER(creatorName);
  if (door.ruleKind === "STAKE_MIN") return hints.STAKE_MIN(creatorName);
  return hints.FOLLOWER(creatorName);
}

/**
 * Join my Telegram group on the public page (Build Board #2, phase 2, board tg13).
 * The creator's own button with the rule in one line under it, never an amount.
 * Nothing renders until the creator has a connected group.
 *
 * Each visitor goes down the one path that fits: signed out, the fan sign up card;
 * signed in without Telegram, Log In with Telegram, back to this page; linked but
 * not qualified, the line that says what lets them in; qualified, Telegram opens
 * the bot with the creator's code (j_{code}) and the bot sends the invite. The page
 * never holds the invite link, and the bot checks the rule again.
 */
export function TelegramGroupBlock({
  block,
  theme,
  door,
  handle,
  creatorUserId,
  creatorName,
  signedIn,
  authPending,
  isOwner,
}: {
  block: TelegramGroupBlockType;
  theme: ThemeConfig | undefined;
  door: TelegramDoor | null | undefined;
  handle: string;
  creatorUserId: number;
  creatorName: string;
  signedIn: boolean;
  authPending: boolean;
  isOwner: boolean;
}) {
  const open = !!door?.open && !!door.botUsername && !!door.linkCode;
  const viewerReady = open && signedIn && !authPending && !isOwner;
  const status = useQuery({
    ...trpc.telegram.link.status.queryOptions(),
    enabled: viewerReady,
    retry: false,
  });
  const verdict = useQuery({
    ...trpc.telegram.groups.canJoin.queryOptions({ creatorUserId }),
    enabled: viewerReady && !!status.data?.linked,
    retry: false,
  });
  const [line, setLine] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);

  if (!open || !door) return null;

  const label = block.config.label?.trim() || DEFAULT_TELEGRAM_GROUP_LABEL;
  const hint = door.ruleKind !== "ANYONE" ? DM_RULE_LABELS[door.ruleKind] : null;
  const joinLink = `https://t.me/${door.botUsername}?start=${telegramPayload.join(door.linkCode!)}`;

  const onTap = async () => {
    setLine(null);
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
    if (status.data && !status.data.linked) {
      if (!status.data.available) {
        setLine(S.fanLink.unavailable);
        return;
      }
      setStarting(true);
      try {
        const { url } = await trpcClient.telegram.link.start.mutate({
          returnTo: { to: "fan", handle },
        });
        window.location.assign(url);
      } catch {
        setLine(S.fanLink.unavailable);
        setStarting(false);
      }
      return;
    }
    if (verdict.data?.allowed === false) {
      setLine(refusalLine(door, creatorName));
      return;
    }
    // The check has not answered yet: the bot checks the rule anyway
    window.open(joinLink, "_blank", "noopener,noreferrer");
  };

  // A linked fan who qualifies gets a real link, so the new tab is not a popup
  const direct = viewerReady && !!status.data?.linked && verdict.data?.allowed === true;
  const textStyle = { color: theme?.fontColor, fontFamily: theme?.fontFamily };

  return (
    <div className="space-y-1.5" aria-busy={starting || undefined}>
      <CreatorButton
        theme={theme}
        icon={<Users className="h-[21px] w-[21px]" />}
        label={label}
        href={direct ? joinLink : undefined}
        onClick={direct ? undefined : () => void onTap()}
      />
      {hint && (
        <p className="text-center text-[13px] leading-4 opacity-80" style={textStyle}>
          {hint}
        </p>
      )}
      {line && (
        <p role="status" className="text-center text-[13px] leading-4" style={textStyle}>
          {line}
        </p>
      )}
    </div>
  );
}
