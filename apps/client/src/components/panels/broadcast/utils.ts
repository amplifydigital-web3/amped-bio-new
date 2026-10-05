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

/** Unread count for the Inbox button. Polls every 60 seconds and on focus (spec 3.2). */
export function useInboxUnread(enabled = true) {
  const query = useQuery({
    ...trpc.broadcast.inbox.unreadCount.queryOptions(),
    enabled: BROADCAST_ON && enabled,
    refetchInterval: 60_000,
    refetchOnWindowFocus: true,
    staleTime: 30_000,
  });
  return query.data?.count ?? 0;
}
