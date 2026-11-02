import { CountBadge } from "@repo/ui";
import { useMessagesUnread } from "../panels/inbox/useMessagesUnread";

/**
 * The rail and dock count on Inbox (spec 8.1 item 1): unread conversations only.
 * Requests and broadcasts count on their tab and on the bell. The badge is decorative;
 * the link's sr-only text carries the number.
 */
export function InboxBadge() {
  const { conversations } = useMessagesUnread();
  if (conversations <= 0) return null;
  return (
    <>
      <CountBadge
        count={conversations}
        className="absolute right-[6px] top-[4px] shadow-[0_0_0_2px_#FFFFFF]"
      />
      <span className="sr-only">, {conversations > 99 ? "99+" : conversations} unread</span>
    </>
  );
}
