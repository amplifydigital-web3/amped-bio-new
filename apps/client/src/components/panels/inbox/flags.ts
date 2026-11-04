import { isFeatureOn } from "../../../config/featureFlags";

/**
 * Amped Messages (Build Board #2 r4, PR M5). The native Inbox, the rail item, the bell
 * center and Account, Messages. Behind the `messages` feature flag (admin Feature flags):
 * on in development and staging, off in production until staging sign off. Off keeps the
 * Telegram era inbox.
 */
export const MESSAGES_V2 = isFeatureOn("messages");

/** Inbox URL state: ?tab=, ?c= (open conversation), ?filter=, ?archived=1 */
export const INBOX_TABS = ["primary", "requests", "broadcast"] as const;
export type InboxTab = (typeof INBOX_TABS)[number];
