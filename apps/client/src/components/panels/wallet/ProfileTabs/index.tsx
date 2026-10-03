import { useEffect } from "react";
import { useSearchParams } from "react-router";
import { Tabs, TabsContent, TabsList, TabsTrigger, cn } from "@repo/ui";
import { useDestinationTab } from "@/hooks/useDestinationTab";
import { RNS_FLAGS } from "@/config/rns/flags";
import { RnsTab } from "../rns/RnsTab";
import { clearRnsParams } from "../rns/useRnsRoute";
import { ProfileTabsProps } from "./types";
import TokensTab from "./components/TokensTab";
import TabSkeletons, { EmptyState } from "./TabSkeletons";
import { ActivityTab } from "../activity/ActivityTab";

// Screen Review 057, 058 (D19). Wallet tabs: Tokens and Activity. Activity
// replaces the Transactions and Transfers tabs; its chips live in ?filter=.
// NFTs was a disabled tab with no content and is not rendered (D07).
// Screen Review 101 I01: RNS is the third tab, only with VITE_SHOW_RNS on.

const TABS = RNS_FLAGS.enabled
  ? (["tokens", "activity", "rns"] as const)
  : (["tokens", "activity"] as const);

// Old ?tab= values land on the Activity chip they became
const LEGACY_TABS: Record<string, string | null> = {
  transactions: null,
  transfers: "transfers",
};

export default function ProfileTabs({ isEmpty = false, loading = false }: ProfileTabsProps) {
  const [params, setParams] = useSearchParams();
  const [tab, setDestinationTab] = useDestinationTab(TABS);
  // Leaving the RNS tab drops its view params (name, address, flow)
  const setTab = (next: string) => {
    if (next !== "rns") {
      setParams(
        current => {
          const updated = new URLSearchParams(current);
          clearRnsParams(updated);
          updated.set("tab", next);
          return updated;
        },
        { replace: true }
      );
      return;
    }
    setDestinationTab(next);
  };

  useEffect(() => {
    const raw = params.get("tab");
    if (!raw || !(raw in LEGACY_TABS)) return;
    setParams(
      current => {
        const updated = new URLSearchParams(current);
        updated.set("tab", "activity");
        const filter = LEGACY_TABS[raw];
        if (filter) updated.set("filter", filter);
        return updated;
      },
      { replace: true }
    );
  }, [params, setParams]);

  return (
    <div
      className={cn(
        tab === "rns" ? "" : "rounded-lg border border-gray-200 bg-white p-4 shadow-sm sm:p-6"
      )}
    >
      <Tabs value={tab} onValueChange={setTab} className="flex flex-col gap-[21px]">
        <TabsList aria-label="Wallet sections" className="max-sm:w-full">
          <TabsTrigger value="tokens" className="max-sm:flex-1">
            Tokens
          </TabsTrigger>
          <TabsTrigger value="activity" className="max-sm:flex-1">
            Activity
          </TabsTrigger>
          {RNS_FLAGS.enabled && (
            <TabsTrigger value="rns" className="max-sm:flex-1">
              RNS
            </TabsTrigger>
          )}
        </TabsList>
        <TabsContent value="tokens" className="mt-0">
          {loading ? <TabSkeletons activeTab="tokens" /> : isEmpty ? <EmptyState /> : <TokensTab />}
        </TabsContent>
        <TabsContent value="activity" className="mt-0">
          <ActivityTab />
        </TabsContent>
        {RNS_FLAGS.enabled && (
          <TabsContent value="rns" className="mt-0">
            <RnsTab />
          </TabsContent>
        )}
      </Tabs>
    </div>
  );
}
