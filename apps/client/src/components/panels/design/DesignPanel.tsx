import { useRef } from "react";
import { Download, MoreHorizontal, Upload } from "lucide-react";
import {
  Menu,
  MenuContent,
  MenuItem,
  MenuTrigger,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@repo/ui";
import { useEditor } from "../../../contexts/EditorContext";
import { useDestinationTab } from "@/hooks/useDestinationTab";
import { GalleryPanel } from "../gallery/GalleryPanel";
import { AppearanceTabContent } from "../profile/AppearanceTabContent";
import { EffectsTabContent } from "../profile/EffectsTabContent";

const TABS = ["themes", "style", "motion"] as const;

/**
 * Design destination (D02): Themes, Style and Motion as tabs, with theme file
 * export and import in the header overflow menu. PR 3 hosts the existing
 * pickers; PR 3a restyles them (rows 023 to 033).
 */
export function DesignPanel() {
  const [tab, setTab] = useDestinationTab(TABS);
  const { theme, exportTheme, importTheme } = useEditor();
  const fileInputRef = useRef<HTMLInputElement>(null);
  // Another creator's theme cannot be exported or overwritten by an import
  const isServerTheme = theme.user_id === null;

  const handleExport = () => {
    const filename = prompt("Enter a name for your theme file:", "My Theme");
    if (filename !== null) exportTheme((filename.trim() || "My Theme").replace(/\s+/g, "-"));
  };

  const handleImport = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      await importTheme(file);
    } catch {
      // importTheme already shows the error toast
    } finally {
      event.target.value = "";
    }
  };

  return (
    <Tabs value={tab} onValueChange={setTab} className="flex flex-col">
      <div className="flex items-center gap-2 px-6 pt-5">
        <TabsList aria-label="Design sections" className="flex-1">
          <TabsTrigger value="themes">Themes</TabsTrigger>
          <TabsTrigger value="style">Style</TabsTrigger>
          <TabsTrigger value="motion">Motion</TabsTrigger>
        </TabsList>
        <Menu>
          <MenuTrigger
            aria-label="More design actions"
            className="prism-icon-btn prism-focus shrink-0"
          >
            <MoreHorizontal aria-hidden className="h-[21px] w-[21px] text-prism-ink-2" />
          </MenuTrigger>
          <MenuContent align="end">
            <MenuItem disabled={isServerTheme} onSelect={handleExport}>
              <Download aria-hidden />
              Save theme file
            </MenuItem>
            <MenuItem disabled={isServerTheme} onSelect={() => fileInputRef.current?.click()}>
              <Upload aria-hidden />
              Import theme file
            </MenuItem>
          </MenuContent>
        </Menu>
        <input
          ref={fileInputRef}
          type="file"
          accept=".ampedtheme"
          className="hidden"
          onChange={handleImport}
        />
      </div>
      <TabsContent value="themes">
        <GalleryPanel />
      </TabsContent>
      <TabsContent value="style" className="p-6">
        <AppearanceTabContent />
      </TabsContent>
      <TabsContent value="motion" className="p-6">
        <EffectsTabContent />
      </TabsContent>
    </Tabs>
  );
}
