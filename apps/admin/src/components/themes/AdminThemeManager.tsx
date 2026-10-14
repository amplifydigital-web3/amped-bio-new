import { useSearchParams } from "react-router";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@repo/ui";
import { ThemesTab } from "./ThemesTab";
import { CollectionsTab } from "./CollectionsTab";

// Screen Review 088 I01. Two peer views, Themes | Collections, in ?tab=.
// Creating moved out of the tabs: New theme opens /themes/new, New
// collection opens the shared Dialog.
type ThemesView = "themes" | "collections";

export function AdminThemeManager() {
  const [params, setParams] = useSearchParams();
  const tab: ThemesView = params.get("tab") === "collections" ? "collections" : "themes";

  return (
    <Tabs
      value={tab}
      onValueChange={value => {
        const next = new URLSearchParams(params);
        next.set("tab", value);
        setParams(next, { replace: true });
      }}
      className="space-y-[13px]"
    >
      <TabsList aria-label="Themes and collections">
        <TabsTrigger value="themes">Themes</TabsTrigger>
        <TabsTrigger value="collections">Collections</TabsTrigger>
      </TabsList>
      <TabsContent value="themes">
        <ThemesTab />
      </TabsContent>
      <TabsContent value="collections">
        <CollectionsTab />
      </TabsContent>
    </Tabs>
  );
}
