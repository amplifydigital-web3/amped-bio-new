import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router";
import { useChainId } from "wagmi";
import { Megaphone } from "lucide-react";
import { BROADCAST_UI, TELEGRAM_GROUP_STRINGS } from "@repo/constants";
import { Button, Tabs, TabsContent, TabsList, TabsTrigger, trpc } from "@repo/ui";
import { useEditor } from "@/contexts/EditorContext";
import { useDestinationTab } from "@/hooks/useDestinationTab";
import { CreatorPoolPanel } from "../createrewardpool/CreatorPoolPanel";
import { MESSAGES_ON } from "../messages/shared";
import { TelegramGroupsSection } from "../messages/TelegramGroups";
import { useTelegramGroups } from "../messages/telegramGroupsData";
import { BROADCAST_ON, shortTime } from "./utils";

// Every tab this destination can show; the ones not available fall back to Overview
const TABS = ["overview", "telegram"] as const;

/**
 * My Pool, Overview: one Broadcast card with the last broadcast and a Broadcast button
 * (M9, spec 8.6 item 4). The button opens Inbox, Broadcast, New broadcast with Pool
 * stakers picked. The Broadcasts tab moved to the Inbox.
 */
export function BroadcastCard({ chainId }: { chainId: string }) {
  const navigate = useNavigate();
  const overview = useQuery({
    ...trpc.broadcast.creator.overview.queryOptions({ chainId }),
    enabled: BROADCAST_ON,
    retry: 1,
  });
  if (!BROADCAST_ON || !overview.data?.pool) return null;
  const { last } = overview.data;
  const S = BROADCAST_UI.myPoolCard;

  return (
    <section
      aria-labelledby="my-pool-broadcast"
      className="prism-slab mx-4 mt-5 flex flex-wrap items-center justify-between gap-4 rounded-prism-21 p-5 md:mx-6"
    >
      <div className="flex min-w-0 items-start gap-3">
        <Megaphone
          aria-hidden
          className="mt-0.5 h-5 w-5 shrink-0 text-prism-nav"
          strokeWidth={1.5}
        />
        <div className="min-w-0">
          <h2 id="my-pool-broadcast" className="text-prism-label font-semibold text-prism-ink">
            {S.title}
          </h2>
          <p className="text-prism-meta text-prism-ink-2">
            {last ? (
              <>
                {S.last}: <span className="font-semibold text-prism-ink">{last.title}</span>,{" "}
                {shortTime(last.createdAt)}
              </>
            ) : (
              S.body
            )}
          </p>
        </div>
      </div>
      <Button onClick={() => navigate("/inbox/broadcast/new?audience=pool")}>
        <Megaphone aria-hidden />
        {S.button}
      </Button>
    </section>
  );
}

function Overview({ chainId }: { chainId: string }) {
  return (
    <div className="flex flex-col">
      <BroadcastCard chainId={chainId} />
      <CreatorPoolPanel />
    </div>
  );
}

/**
 * My Pool: Overview with the Broadcast card (M9), and the Telegram group tab (Build
 * Board #2, board tg5) when the server has groups on and the creator has a pool. The
 * Telegram code stays (Rob, 4 Nov) with its flags off in production.
 */
export function MyPoolDestination() {
  const chainId = useChainId().toString();
  const { profile } = useEditor();
  const [tab, setTab] = useDestinationTab(TABS);
  const groups = useTelegramGroups();
  const settings = useQuery({
    ...trpc.messaging.creator.getSettings.queryOptions(),
    enabled: MESSAGES_ON && !!groups.data?.enabled,
    staleTime: 30_000,
  });

  const telegramOn = !!groups.data?.enabled && !!settings.data?.requirements.hasPool;
  if (!telegramOn) return <Overview chainId={chainId} />;

  const current = tab === "telegram" ? tab : "overview";

  return (
    <Tabs value={current} onValueChange={setTab} className="flex flex-col">
      <div className="px-4 pt-5 md:px-6">
        <TabsList aria-label="My Pool sections">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="telegram">{TELEGRAM_GROUP_STRINGS.tabLabel}</TabsTrigger>
        </TabsList>
      </div>
      <TabsContent value="overview" className="mt-0">
        <Overview chainId={chainId} />
      </TabsContent>
      <TabsContent value="telegram" className="px-4 pb-8 md:px-6">
        <TelegramGroupsSection handle={profile.handle ?? ""} creatorName={profile.name} />
      </TabsContent>
    </Tabs>
  );
}
