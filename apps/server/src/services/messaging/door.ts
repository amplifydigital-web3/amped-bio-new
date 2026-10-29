import type { DmRuleKind } from "@repo/constants";
import { env } from "../../env";
import { getBotUsername } from "../telegram/client";
import { getOrCreateLinkCode } from "../telegram/linkCodes";
import { getCreatorSettings, settingsOpen } from "./access";
import { primaryGroup } from "../telegram/groups";

/**
 * What a public page needs to render the Message me on Telegram block (Build Board
 * #2, Screen Review 115, spec 3.8 and 3.11b): whether the door is open, the rule as
 * a kind (the page shows its label, never an amount), the bot to deep link to, and the
 * creator's short link code for the payload (spec r3 3.5). Never the creator's
 * Telegram username or id.
 */
export type TelegramDoor = {
  open: boolean;
  ruleKind: DmRuleKind;
  botUsername: string | null;
  /** Deep link code: t.me/<bot>?start=m_{linkCode}. Null while the door is closed. */
  linkCode: string | null;
};

export async function telegramDoor(creatorUserId: number): Promise<TelegramDoor> {
  if (!env.TELEGRAM_ENABLED)
    return { open: false, ruleKind: "FOLLOWER", botUsername: null, linkCode: null };
  const [settings, botUsername] = await Promise.all([
    getCreatorSettings(creatorUserId),
    getBotUsername(),
  ]);
  const open = settingsOpen(settings) && !!botUsername;
  return {
    open,
    ruleKind: (settings?.ruleKind ?? "FOLLOWER") as DmRuleKind,
    botUsername,
    linkCode: open ? await getOrCreateLinkCode(creatorUserId) : null,
  };
}

/**
 * The Join group block's view (board tg13, spec r3 3.2): open when groups are on and the
 * creator has a connected group with an invite link. The rule as a kind, never an
 * amount; the deep link carries the creator's code (j_{code}), never the invite link,
 * so the bot checks the rule before anyone gets in.
 */
export async function telegramGroupDoor(creatorUserId: number): Promise<TelegramDoor> {
  const closed = {
    open: false,
    ruleKind: "FOLLOWER" as DmRuleKind,
    botUsername: null,
    linkCode: null,
  };
  if (!env.TELEGRAM_ENABLED || !env.TELEGRAM_GROUPS) return closed;
  const [group, botUsername] = await Promise.all([primaryGroup(creatorUserId), getBotUsername()]);
  if (!group?.inviteLink || !botUsername) return closed;
  return {
    open: true,
    ruleKind: group.ruleKind as DmRuleKind,
    botUsername,
    linkCode: await getOrCreateLinkCode(creatorUserId),
  };
}
