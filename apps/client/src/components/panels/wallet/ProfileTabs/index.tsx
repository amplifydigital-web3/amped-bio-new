import { useEffect } from "react";
import { useSearchParams } from "react-router";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@repo/ui";
import { useDestinationTab } from "@/hooks/useDestinationTab";
import { RNS_FLAGS } from "@/config/rns/flags";
import { RnsTab } from "../rns/RnsTab";
import { clearRnsParams } from "../rns/useRnsRoute";
import TokensTab from "./components/TokensTab";
import { ActivityTab } from "../activity/ActivityTab";

// Screen Review 057, 058 (D19). Wallet tabs: Tokens and Activity. Activity
// replaces the Transactions and Transfers tabs; its chips live in ?filter=.
// NFTs was a disabled tab with no content and is not rendered (D07).
// Screen Review 101 I01: RNS is the third tab, only with VITE_SHOW_RNS on.
// Screen Review 055 I01: the tabs container and each view sit on the room;
// the Tokens view handles its own loading, zero and error states.

const TABS = RNS_FLAGS.enabled
  ? (["tokens", "activity", "rns"] as const)
  : (["tokens", "activity"] as const);

// Old ?tab= values land on the Activity chip they became
const LEGACY_TABS: Record<string, string | null> = {
  transactions: null,
  transfers: "transfers",
};

export default function ProfileTabs() {
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

  // 077 I01: ?tab=names (the Names tab in the 077 boards) lands on the RNS
  // tab and keeps its name, address and flow params.
  useEffect(() => {
    if (params.get("tab") !== "names" || !RNS_FLAGS.enabled) return;
    setParams(
      current => {
        const updated = new URLSearchParams(current);
        updated.set("tab", "rns");
        return updated;
      },
      { replace: true }
    );
  }, [params, setParams]);

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
    <div>
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
          <TokensTab />
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
