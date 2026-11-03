import { useQuery } from "@tanstack/react-query";
import { useChainId } from "wagmi";
import { Tabs, TabsContent, TabsList, TabsTrigger, trpc } from "@repo/ui";
import { useDestinationTab } from "@/hooks/useDestinationTab";
import { CreatorPoolPanel } from "../createrewardpool/CreatorPoolPanel";
import { BroadcastsTab } from "./BroadcastsTab";
import { BROADCAST_ON } from "./utils";

// Every tab this destination can show; the ones not available fall back to Overview
const TABS = ["overview", "broadcasts"] as const;

/**
 * My Pool with a Broadcasts tab (Build Board #1, board br2). Broadcasts shows when
 * VITE_SHOW_BROADCAST is on and the creator owns a pool on this network; without it
 * My Pool renders exactly as before. The Telegram group tab ended in PR M8.
 */
export function MyPoolDestination() {
  const chainId = useChainId().toString();
  const [tab, setTab] = useDestinationTab(TABS);
  const overview = useQuery({
    ...trpc.broadcast.creator.overview.queryOptions({ chainId }),
    enabled: BROADCAST_ON,
    retry: 1,
  });

  const broadcastsOn = BROADCAST_ON && !!overview.data?.pool;
  if (!broadcastsOn) return <CreatorPoolPanel />;

  const current = tab === "broadcasts" ? tab : "overview";

  return (
    <Tabs value={current} onValueChange={setTab} className="flex flex-col">
      <div className="px-4 pt-5 md:px-6">
        <TabsList aria-label="My Pool sections">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="broadcasts">Broadcasts</TabsTrigger>
        </TabsList>
      </div>
      <TabsContent value="overview" className="mt-0">
        <CreatorPoolPanel />
      </TabsContent>
      <TabsContent value="broadcasts" className="px-4 pb-8 md:px-6">
        <BroadcastsTab chainId={chainId} />
      </TabsContent>
    </Tabs>
  );
}
