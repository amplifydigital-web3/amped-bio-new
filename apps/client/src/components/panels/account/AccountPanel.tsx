import { Tabs, TabsContent, TabsList, TabsTrigger } from "@repo/ui";
import { useDestinationTab } from "@/hooks/useDestinationTab";
import { AccountSettings } from "./AccountSettings";
import { DeveloperPanel } from "../developer/DeveloperPanel";

const TABS = ["settings", "developers"] as const;

/**
 * Account destination (D04, D30), reached from the avatar menu. Settings holds
 * email, public URL, password and two factor; Developers holds the OAuth apps
 * moved out of the rail (001 I12). Settings is restyled in PR 3c (019, 020);
 * 021 and 098 restyle Two factor and Developers.
 */
export function AccountPanel() {
  const [tab, setTab] = useDestinationTab(TABS);
  return (
    <Tabs value={tab} onValueChange={setTab} className="flex flex-col">
      <div className="px-4 pt-5 md:px-6">
        <TabsList aria-label="Account sections">
          <TabsTrigger value="settings">Settings</TabsTrigger>
          <TabsTrigger value="developers">Developers</TabsTrigger>
        </TabsList>
      </div>
      <TabsContent value="settings" className="mt-0 px-4 pb-6 pt-[21px] md:px-6">
        <AccountSettings />
      </TabsContent>
      {/* Not restyled yet (098): keeps a white surface on the room */}
      <TabsContent
        value="developers"
        className="mx-4 mb-6 mt-[21px] overflow-hidden rounded-prism-21 bg-white shadow-prism-e3 md:mx-6"
      >
        <DeveloperPanel />
      </TabsContent>
    </Tabs>
  );
}
