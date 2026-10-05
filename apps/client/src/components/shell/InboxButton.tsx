import { Bell } from "lucide-react";
import { cn } from "@repo/ui";
import { useEditor } from "@/contexts/EditorContext";
import { useShellNavigation } from "./ShellNavigation";
import { BROADCAST_ON, useInboxUnread } from "../panels/broadcast/utils";

/**
 * Inbox entry in the top bar (Build Board #1, board br3): a 44 icon button
 * with an unread dot. Muted creators do not count. Behind VITE_SHOW_BROADCAST.
 */
export function InboxButton() {
  const { activePanel } = useEditor();
  const { go } = useShellNavigation();
  const unread = useInboxUnread();
  if (!BROADCAST_ON) return null;
  const label = unread > 0 ? `Inbox, ${unread} unread` : "Inbox";
  return (
    <button
      type="button"
      aria-label={label}
      aria-current={activePanel === "inbox" ? "page" : undefined}
      onClick={() => go("inbox")}
      className={cn(
        "prism-icon-btn prism-focus relative shrink-0",
        activePanel === "inbox" && "prism-lens-thumb"
      )}
    >
      <Bell aria-hidden className="h-[21px] w-[21px] text-prism-ink-2" strokeWidth={1.5} />
      {unread > 0 && (
        <span
          aria-hidden
          className="absolute right-[9px] top-[9px] h-[10px] w-[10px] rounded-full bg-prism-nav shadow-[0_0_0_2px_#FFFFFF]"
        />
      )}
    </button>
  );
}
