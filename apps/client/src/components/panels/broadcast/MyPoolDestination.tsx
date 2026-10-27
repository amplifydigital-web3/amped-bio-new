import { useQuery } from "@tanstack/react-query";
import { useChainId } from "wagmi";
import { Tabs, TabsContent, TabsList, TabsTrigger, trpc } from "@repo/ui";
import { useDestinationTab } from "@/hooks/useDestinationTab";
import { CreatorPoolPanel } from "../createrewardpool/CreatorPoolPanel";
import { BroadcastsTab } from "./BroadcastsTab";
import { BROADCAST_ON } from "./utils";

const TABS = ["overview", "broadcasts"] as const;

/**
 * My Pool with a Broadcasts tab (Build Board #1, board br2). The tab shows
 * only when VITE_SHOW_BROADCAST is on and the creator owns a pool on this
 * network; otherwise My Pool renders exactly as before. The pool screens
 * themselves are untouched, so the Prism My Pool batches merge cleanly.
 */
export function MyPoolDestination() {
  const chainId = useChainId().toString();
  const [tab, setTab] = useDestinationTab(TABS);
  const overview = useQuery({
    ...trpc.broadcast.creator.overview.queryOptions({ chainId }),
    enabled: BROADCAST_ON,
    retry: 1,
  });

  if (!BROADCAST_ON || !overview.data?.pool) return <CreatorPoolPanel />;

  return (
    <Tabs value={tab} onValueChange={setTab} className="flex flex-col">
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
