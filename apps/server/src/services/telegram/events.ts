/**
 * Messaging on Telegram (Build Board #2), spec 3.10. Product events for the
 * Telegram and messaging KPIs.
 *
 * There is no server side product analytics sink in the repo yet (the analytics
 * plan in #11 picks one). Until then each event is one structured log line,
 * `[telegram:event] {...}`, which the log pipeline can count. Events carry
 * Amped ids and counts only: never a Telegram id, a username or a message body.
 */

export type TelegramEventName =
  | "dm_rule_set"
  | "dm_thread_started"
  | "dm_message_sent"
  | "dm_reply_latency"
  | "dm_refused"
  | "dm_blocked"
  | "dm_reported"
  | "group_connected"
  | "group_join_decided"
  | "group_member_removed"
  | "inline_card_shown"
  | "inline_card_picked";

type EventValue = string | number | boolean | null;

export function emitTelegramEvent(name: TelegramEventName, props: Record<string, EventValue> = {}) {
  if (process.env.NODE_ENV === "test") return;
  console.info(
    `[telegram:event] ${JSON.stringify({ event: name, at: new Date().toISOString(), ...props })}`
  );
}
