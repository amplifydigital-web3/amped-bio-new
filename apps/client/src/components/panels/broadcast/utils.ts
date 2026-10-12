import { useQuery } from "@tanstack/react-query";
import { trpc } from "@repo/ui";

/** Creator Pool Broadcast (Build Board #1). Behind VITE_SHOW_BROADCAST. */
export const BROADCAST_ON = import.meta.env.VITE_SHOW_BROADCAST === "true";

const sameDay = (a: Date, b: Date) => a.toDateString() === b.toDateString();

/** "9:12 a.m." today, "Yesterday", "Sep 30" this year, "Sep 30, 2025" before. */
export function shortTime(value: string | Date) {
  const d = new Date(value);
  const now = new Date();
  if (sameDay(d, now))
    return d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (sameDay(d, yesterday)) return "Yesterday";
  return d.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: d.getFullYear() === now.getFullYear() ? undefined : "numeric",
  });
}

export function longTime(value: string | Date) {
  const d = new Date(value);
  const time = d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  return sameDay(d, new Date()) ? `Today, ${time}` : `${shortTime(d)}, ${time}`;
}

/** Messaging on Telegram (#2): the inbox also holds conversations. Behind VITE_SHOW_TELEGRAM. */
const MESSAGES_ON = import.meta.env.VITE_SHOW_TELEGRAM === "true";

const POLL = { refetchInterval: 60_000, refetchOnWindowFocus: true, staleTime: 30_000 } as const;

/**
 * Unread count for the Inbox button: broadcasts plus messages from either side of
 * a conversation (spec 3.2, both kinds count). Polls every 60 seconds and on focus.
 */
export function useInboxUnread(enabled = true) {
  const updates = useQuery({
    ...trpc.broadcast.inbox.unreadCount.queryOptions(),
    enabled: BROADCAST_ON && enabled,
    ...POLL,
  });
  const asCreator = useQuery({
    ...trpc.messaging.creator.unreadCount.queryOptions(),
    enabled: MESSAGES_ON && enabled,
    ...POLL,
  });
  const asFan = useQuery({
    ...trpc.messaging.fan.unreadCount.queryOptions(),
    enabled: MESSAGES_ON && enabled,
    ...POLL,
  });
  return (updates.data?.count ?? 0) + (asCreator.data?.count ?? 0) + (asFan.data?.count ?? 0);
}

/** The inbox is on when either of its kinds is. */
export const INBOX_ON = BROADCAST_ON || MESSAGES_ON;
