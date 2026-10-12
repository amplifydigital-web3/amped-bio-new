import type { DmRuleKind } from "@repo/constants";
import { env } from "../../env";
import { getBotUsername } from "../telegram/client";
import { getCreatorSettings, settingsOpen } from "./access";

/**
 * What a public page needs to render the Message me on Telegram block (Build Board
 * #2, Screen Review 115, spec 3.8 and 3.11b): whether the door is open, the rule as
 * a kind (the page shows its label, never an amount), and the bot to deep link to.
 * Never the creator's Telegram username or id.
 */
export type TelegramDoor = {
  open: boolean;
  ruleKind: DmRuleKind;
  botUsername: string | null;
};

export async function telegramDoor(creatorUserId: number): Promise<TelegramDoor> {
  if (!env.TELEGRAM_ENABLED) return { open: false, ruleKind: "FOLLOWER", botUsername: null };
  const [settings, botUsername] = await Promise.all([
    getCreatorSettings(creatorUserId),
    getBotUsername(),
  ]);
  return {
    open: settingsOpen(settings) && !!botUsername,
    ruleKind: (settings?.ruleKind ?? "FOLLOWER") as DmRuleKind,
    botUsername,
  };
}
