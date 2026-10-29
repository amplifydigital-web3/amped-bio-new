import { useQuery } from "@tanstack/react-query";
import { useChainId } from "wagmi";
import { TELEGRAM_GROUP_STRINGS } from "@repo/constants";
import { Tabs, TabsContent, TabsList, TabsTrigger, trpc } from "@repo/ui";
import { useEditor } from "@/contexts/EditorContext";
import { useDestinationTab } from "@/hooks/useDestinationTab";
import { CreatorPoolPanel } from "../createrewardpool/CreatorPoolPanel";
import { MESSAGES_ON } from "../messages/shared";
import { TelegramGroupsSection } from "../messages/TelegramGroups";
import { useTelegramGroups } from "../messages/telegramGroupsData";
import { BroadcastsTab } from "./BroadcastsTab";
import { BROADCAST_ON } from "./utils";

// Every tab this destination can show; the ones not available fall back to Overview
const TABS = ["overview", "broadcasts", "telegram"] as const;

/**
 * My Pool with a Broadcasts tab (Build Board #1, board br2) and a Telegram group
 * tab (Build Board #2, board tg5). Broadcasts shows when VITE_SHOW_BROADCAST is on
 * and the creator owns a pool on this network. Telegram group shows when the
 * server has groups on and the creator has a pool; creators without one get the
 * same card in Inbox, Settings. With neither, My Pool renders exactly as before.
 */
export function MyPoolDestination() {
  const chainId = useChainId().toString();
  const { profile } = useEditor();
  const [tab, setTab] = useDestinationTab(TABS);
  const overview = useQuery({
    ...trpc.broadcast.creator.overview.queryOptions({ chainId }),
    enabled: BROADCAST_ON,
    retry: 1,
  });
  const groups = useTelegramGroups();
  const settings = useQuery({
    ...trpc.messaging.creator.getSettings.queryOptions(),
    enabled: MESSAGES_ON && !!groups.data?.enabled,
    staleTime: 30_000,
  });

  const broadcastsOn = BROADCAST_ON && !!overview.data?.pool;
  const telegramOn = !!groups.data?.enabled && !!settings.data?.requirements.hasPool;
  if (!broadcastsOn && !telegramOn) return <CreatorPoolPanel />;

  const current =
    (tab === "broadcasts" && broadcastsOn) || (tab === "telegram" && telegramOn) ? tab : "overview";

  return (
    <Tabs value={current} onValueChange={setTab} className="flex flex-col">
      <div className="px-4 pt-5 md:px-6">
        <TabsList aria-label="My Pool sections">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          {broadcastsOn && <TabsTrigger value="broadcasts">Broadcasts</TabsTrigger>}
          {telegramOn && (
            <TabsTrigger value="telegram">{TELEGRAM_GROUP_STRINGS.tabLabel}</TabsTrigger>
          )}
        </TabsList>
      </div>
      <TabsContent value="overview" className="mt-0">
        <CreatorPoolPanel />
      </TabsContent>
      {broadcastsOn && (
        <TabsContent value="broadcasts" className="px-4 pb-8 md:px-6">
          <BroadcastsTab chainId={chainId} />
        </TabsContent>
      )}
      {telegramOn && (
        <TabsContent value="telegram" className="px-4 pb-8 md:px-6">
          <TelegramGroupsSection handle={profile.handle ?? ""} creatorName={profile.name} />
        </TabsContent>
      )}
    </Tabs>
  );
}
