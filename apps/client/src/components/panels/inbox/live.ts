import type { RouterOutputs } from "@repo/ui";

/**
 * The realtime stream's events for open screens (spec 7.3 item 3). The provider feeds
 * them in; an open conversation listens for its own. Kept outside React Query so a new
 * message shows at once without refetching the page.
 */
export type LiveMessage = RouterOutputs["messages"]["get"]["messages"][number];

export type LiveEvent =
  | {
      type: "message.new";
      conversationId: string;
      folder: "PRIMARY" | "REQUESTS";
      message: LiveMessage;
    }
  | { type: "message.unsent"; conversationId: string; messageId: string }
  | { type: "conversation.read"; conversationId: string; messageId: string | null; at: string }
  | { type: "conversation.updated"; conversationId: string; change: string }
  | { type: "typing"; conversationId: string; userId: number; seconds: number }
  | { type: "notification.new"; notificationId: string }
  | { type: "unread.changed"; conversations: number; requests: number }
  | { type: "resync" };

type Listener = (event: LiveEvent) => void;
const listeners = new Set<Listener>();

export function emitLive(event: LiveEvent) {
  for (const listener of listeners) listener(event);
}

export function onLive(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** The conversation on screen, so the toast and the bell skip it (spec 8.1 item 4). */
let openConversation: string | null = null;
export function setOpenConversation(id: string | null) {
  openConversation = id;
}
export function getOpenConversation() {
  return openConversation;
}

/** The stream is up: screens can trust live updates over polling. */
let connected = false;
const connectionListeners = new Set<(up: boolean) => void>();
export function setLiveConnected(up: boolean) {
  if (connected === up) return;
  connected = up;
  for (const listener of connectionListeners) listener(up);
}
export function isLiveConnected() {
  return connected;
}
export function onLiveConnection(listener: (up: boolean) => void): () => void {
  connectionListeners.add(listener);
  return () => connectionListeners.delete(listener);
}
