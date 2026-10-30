import { useSearchParams } from "react-router";
import { TELEGRAM_APP_STRINGS, telegramPayload, type DmRuleKind } from "@repo/constants";

// Messaging on Telegram (Build Board #2), phase 1 client (PR 4). Behind
// VITE_SHOW_TELEGRAM, like the Account row (row 112) and the composer (row 117).
export const MESSAGES_ON = import.meta.env.VITE_SHOW_TELEGRAM === "true";

/** `?wizard=telegram` on any editor route opens wizard A (spec 3.11a). */
export const WIZARD_PARAM = "wizard";
export const WIZARD_VALUE = "telegram";

/** Opens wizard A from any entry point: Home, the block picker, the inbox empty state. */
export function useOpenTelegramWizard() {
  const [, setParams] = useSearchParams();
  return () =>
    setParams(current => {
      const next = new URLSearchParams(current);
      next.set(WIZARD_PARAM, WIZARD_VALUE);
      return next;
    });
}

/**
 * The bot deep link that opens Telegram with this creator selected. The payload carries
 * the creator's short code, never the handle (spec r3 3.5).
 */
export function telegramDmLink(botUsername: string, linkCode: string) {
  return `https://t.me/${botUsername}?start=${telegramPayload.message(linkCode)}`;
}

/** One key per send attempt, reused when the same text is retried (spec 3.4). */
export function newIdempotencyKey() {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2, 12)}`;
}

/** The message of a tRPC error when the server sent product copy, else the fallback. */
export function errorMessage(error: unknown, fallback: string) {
  const data = (error as { data?: { code?: string } } | null)?.data;
  const message = (error as Error | null)?.message;
  const productCodes = ["FORBIDDEN", "PRECONDITION_FAILED", "BAD_REQUEST", "TOO_MANY_REQUESTS"];
  return data?.code && productCodes.includes(data.code) && message ? message : fallback;
}

/** The rule picked in Settings or the wizard; stakeMin is a whole number of tREVO as text. */
export type RuleValue = { ruleKind: DmRuleKind; stakeMin: string };

/** A whole number of tREVO above zero, as the server checks it. */
export function stakeMinError(value: RuleValue): string | null {
  if (value.ruleKind !== "STAKE_MIN") return null;
  return /^0*[1-9]\d{0,29}$/.test(value.stakeMin)
    ? null
    : TELEGRAM_APP_STRINGS.messagingSettingsErrors.stakeMin;
}
