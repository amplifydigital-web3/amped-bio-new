import { useQuery } from "@tanstack/react-query";
import { TELEGRAM_GROUP_STRINGS as G } from "@repo/constants";
import { trpc } from "@repo/ui";
import { useEditor } from "@/contexts/EditorContext";
import { MESSAGES_ON } from "./shared";
import { TelegramGroupsSection } from "./TelegramGroups";
import { useTelegramGroups } from "./telegramGroupsData";

/**
 * Inbox, Settings, Telegram group (board tg5): the group card for creators without a
 * pool. Creators with a pool find it in My Pool, Telegram group.
 */
export function InboxTelegramGroups() {
  const { profile } = useEditor();
  const groups = useTelegramGroups();
  const settings = useQuery({
    ...trpc.messaging.creator.getSettings.queryOptions(),
    enabled: MESSAGES_ON && !!groups.data?.enabled,
    staleTime: 30_000,
  });
  if (!groups.data?.enabled || !settings.data || settings.data.requirements.hasPool) return null;
  return (
    <section aria-labelledby="inbox-tg-group" className="space-y-[13px]">
      <h2 id="inbox-tg-group" className="text-prism-card-title text-prism-ink">
        {G.tabLabel}
      </h2>
      <TelegramGroupsSection handle={profile.handle ?? ""} creatorName={profile.name} />
    </section>
  );
}
