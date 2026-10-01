import { Tabs, TabsContent, TabsList, TabsTrigger } from "@repo/ui";
import { useDestinationTab } from "@/hooks/useDestinationTab";
import { AccountSettings } from "../profile/ProfileSections";
import { DeveloperPanel } from "../developer/DeveloperPanel";

const TABS = ["settings", "developers"] as const;

/**
 * Account destination (D04, D30), reached from the avatar menu. Settings holds
 * email, public URL, password and two factor; Developers holds the OAuth apps
 * moved out of the rail (001 I12). Rows 019 to 021 and 098 restyle it.
 */
export function AccountPanel() {
  const [tab, setTab] = useDestinationTab(TABS);
  return (
    <Tabs value={tab} onValueChange={setTab} className="flex flex-col">
      <div className="px-6 pt-5">
        <TabsList aria-label="Account sections">
          <TabsTrigger value="settings">Settings</TabsTrigger>
          <TabsTrigger value="developers">Developers</TabsTrigger>
        </TabsList>
      </div>
      <TabsContent value="settings" className="max-w-[720px] space-y-8 p-6">
        <AccountSettings />
      </TabsContent>
      <TabsContent value="developers">
        <DeveloperPanel />
      </TabsContent>
    </Tabs>
  );
}
