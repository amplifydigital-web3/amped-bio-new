import { useQuery } from "@tanstack/react-query";
import { useSearchParams } from "react-router";
import { Tabs, TabsContent, TabsList, TabsTrigger, trpc } from "@repo/ui";
import { formatCount } from "../kit/format";
import { HoldersTab } from "../components/handles/HoldersTab";
import { LogTab } from "../components/handles/LogTab";
import { RedirectsTab } from "../components/handles/RedirectsTab";
import { ReservedTab } from "../components/handles/ReservedTab";

// Reserved handles admin (docs/features/reserved-handles.md 7.1, board RA1).
// Four peer views in ?tab=: Reserved, Holders, Redirects, Log. Holders shows
// the open count so a queue is visible from any tab.

type HandlesView = "reserved" | "holders" | "redirects" | "log";
const VIEWS: HandlesView[] = ["reserved", "holders", "redirects", "log"];

export function AdminHandles() {
  const [params, setParams] = useSearchParams();
  const asked = params.get("tab") as HandlesView | null;
  const tab: HandlesView = asked && VIEWS.includes(asked) ? asked : "reserved";
  const open = useQuery(trpc.admin.handles.holders.list.queryOptions({ state: "open", limit: 1 }));

  const go = (value: string) => {
    const next = new URLSearchParams(params);
    next.set("tab", value);
    setParams(next, { replace: true });
  };

  return (
    <Tabs value={tab} onValueChange={go} className="space-y-[13px]">
      <TabsList aria-label="Handles">
        <TabsTrigger value="reserved">Reserved</TabsTrigger>
        <TabsTrigger value="holders">
          Holders
          {!!open.data?.total && (
            <span className="ml-1 tabular-nums">{formatCount(open.data.total)}</span>
          )}
        </TabsTrigger>
        <TabsTrigger value="redirects">Redirects</TabsTrigger>
        <TabsTrigger value="log">Log</TabsTrigger>
      </TabsList>
      <TabsContent value="reserved">
        <ReservedTab />
      </TabsContent>
      <TabsContent value="holders">
        <HoldersTab onOpenRedirects={() => go("redirects")} />
      </TabsContent>
      <TabsContent value="redirects">
        <RedirectsTab />
      </TabsContent>
      <TabsContent value="log">
        <LogTab />
      </TabsContent>
    </Tabs>
  );
}
