import { useRef, useState } from "react";
import { BookOpen, Download, MoreHorizontal, Upload } from "lucide-react";
import {
  BottomSheet,
  BottomSheetContent,
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Menu,
  MenuContent,
  MenuItem,
  MenuSeparator,
  MenuTrigger,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  importThemeConfigFromJson,
  themeFileName,
} from "@repo/ui";
import { useEditor } from "@/contexts/EditorContext";
import { useDestinationTab } from "@/hooks/useDestinationTab";
import { PHONE_QUERY, useMediaQuery } from "@/hooks/useMediaQuery";
import { toast } from "@/components/ui/toast";
import { useThemeActions } from "./kit/useThemeActions";
import { StyleTab, MotionTab } from "./StyleMotionTabs";
import { ThemesTab } from "./themes/ThemesTab";

const TABS = ["themes", "style", "motion"] as const;

const THEME_FILES_ARTICLE =
  "https://amplifydigital.freshdesk.com/support/solutions/articles/154000227742-how-to-export-and-import-themes-in-amped-bio";

const INVALID_FILE = "This isn't a theme file. Choose a .ampedtheme file saved from Amped.Bio.";
const LOCKED_SAVE = "Locked themes can't be saved as a file.";

/**
 * Design destination (D02, Screen Review 031): Themes, Style and Motion tabs,
 * with theme files in the header overflow menu (a bottom sheet on phones).
 */
export function DesignPanel() {
  const [tab, setTab] = useDestinationTab(TABS);
  const { theme, profile, exportTheme, replaceThemeConfig } = useEditor();
  const { storeOwnTheme, restoreTheme, refetch, makeEditableCopy, ensureSaved, pending } =
    useThemeActions();
  const mobile = useMediaQuery(PHONE_QUERY);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [saveOpen, setSaveOpen] = useState(false);
  const [fileName, setFileName] = useState("");
  const locked = theme.user_id === null;

  const defaultFileName = () =>
    themeFileName(
      theme.name && theme.name !== "Applied Theme" ? theme.name : `${profile.handle}-theme`
    );

  const openSave = () => {
    setSheetOpen(false);
    setFileName(defaultFileName());
    setSaveOpen(true);
  };

  const save = () => {
    try {
      exportTheme(fileName.trim() || defaultFileName());
      setSaveOpen(false);
      toast.add({ type: "success", title: "Theme file saved." });
    } catch {
      toast.add({ type: "error", title: locked ? LOCKED_SAVE : "Theme file was not saved." });
    }
  };

  const openImport = () => {
    setSheetOpen(false);
    fileInputRef.current?.click();
  };

  const handleImport = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    let config;
    try {
      config = await importThemeConfigFromJson(file);
    } catch {
      toast.add({ type: "error", title: INVALID_FILE });
      return;
    }

    const name =
      file.name
        .replace(/\.ampedtheme$/i, "")
        .replace(/[-_]+/g, " ")
        .trim() || "theme";
    const previous = theme;

    if (locked) {
      // A locked theme cannot take new values: the file becomes the creator's own theme
      try {
        await ensureSaved();
        await storeOwnTheme(name, config);
        await refetch();
      } catch {
        toast.add({
          type: "error",
          title: `${name} was not imported.`,
          actionProps: { children: "Retry", onClick: openImport },
        });
        return;
      }
      toast.add({
        type: "success",
        title: `Imported ${name}`,
        duration: 8000,
        actionProps: {
          children: "Undo",
          onClick: () =>
            void restoreTheme(previous, false).catch(() =>
              toast.add({ type: "error", title: "Could not undo. Pick your theme again." })
            ),
        },
      });
      return;
    }

    // Own theme: replace the config; autosave stores it (D11)
    const before = previous.config;
    replaceThemeConfig(config);
    toast.add({
      type: "success",
      title: `Imported ${name}`,
      duration: 8000,
      actionProps: { children: "Undo", onClick: () => replaceThemeConfig(before) },
    });
  };

  const copy = async () => {
    try {
      await makeEditableCopy();
      setSaveOpen(false);
    } catch {
      toast.add({ type: "error", title: "Could not make an editable copy" });
    }
  };

  const openArticle = () => {
    setSheetOpen(false);
    window.open(THEME_FILES_ARTICLE, "_blank", "noopener,noreferrer");
  };

  const trigger = <MoreHorizontal aria-hidden className="h-[21px] w-[21px] text-prism-ink-2" />;

  return (
    <Tabs value={tab} onValueChange={setTab} className="flex flex-col">
      <div className="flex items-center gap-2 px-4 pt-5 md:px-6">
        <TabsList aria-label="Design sections" className="flex-1">
          <TabsTrigger value="themes">Themes</TabsTrigger>
          <TabsTrigger value="style">Style</TabsTrigger>
          <TabsTrigger value="motion">Motion</TabsTrigger>
        </TabsList>

        {mobile ? (
          <>
            <button
              type="button"
              aria-label="Theme files"
              className="prism-icon-btn prism-focus shrink-0"
              onClick={() => setSheetOpen(true)}
            >
              {trigger}
            </button>
            <BottomSheet open={sheetOpen} onOpenChange={setSheetOpen}>
              <BottomSheetContent title="Theme files">
                <div className="flex flex-col py-2">
                  <SheetRow icon={Download} onClick={openSave}>
                    Save theme file
                  </SheetRow>
                  <SheetRow icon={Upload} onClick={openImport}>
                    Import theme file
                  </SheetRow>
                  <hr className="my-2 border-prism-line" />
                  <SheetRow icon={BookOpen} onClick={openArticle}>
                    How theme files work
                  </SheetRow>
                </div>
              </BottomSheetContent>
            </BottomSheet>
          </>
        ) : (
          <Menu>
            <MenuTrigger aria-label="Theme files" className="prism-icon-btn prism-focus shrink-0">
              {trigger}
            </MenuTrigger>
            <MenuContent align="end">
              <MenuItem onSelect={openSave}>
                <Download aria-hidden />
                Save theme file
              </MenuItem>
              <MenuItem onSelect={openImport}>
                <Upload aria-hidden />
                Import theme file
              </MenuItem>
              <MenuSeparator />
              <MenuItem onSelect={openArticle}>
                <BookOpen aria-hidden />
                How theme files work
              </MenuItem>
            </MenuContent>
          </Menu>
        )}

        <input
          ref={fileInputRef}
          type="file"
          accept=".ampedtheme,application/json"
          className="hidden"
          aria-hidden
          tabIndex={-1}
          onChange={handleImport}
        />
      </div>

      <TabsContent value="themes" className="mt-0 px-4 pb-6 pt-[21px] md:px-6">
        <ThemesTab onEditStyle={() => setTab("style")} />
      </TabsContent>
      <TabsContent value="style" className="mt-0 px-4 pb-6 pt-[21px] md:px-6">
        <StyleTab />
      </TabsContent>
      <TabsContent value="motion" className="mt-0 px-4 pb-6 pt-[21px] md:px-6">
        <MotionTab />
      </TabsContent>

      <Dialog open={saveOpen} onOpenChange={setSaveOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Save theme file</DialogTitle>
            {locked && <DialogDescription>{LOCKED_SAVE}</DialogDescription>}
          </DialogHeader>
          {locked ? (
            <DialogFooter>
              <Button variant="secondary" onClick={() => setSaveOpen(false)}>
                Cancel
              </Button>
              <Button disabled={pending} aria-busy={pending} onClick={() => void copy()}>
                Make an editable copy
              </Button>
            </DialogFooter>
          ) : (
            <form
              onSubmit={event => {
                event.preventDefault();
                save();
              }}
              className="space-y-5"
            >
              <Input
                label="File name"
                value={fileName}
                onChange={event => setFileName(event.target.value)}
                helper="Saves a .ampedtheme file you can import later."
                autoFocus
              />
              <DialogFooter>
                <Button type="button" variant="secondary" onClick={() => setSaveOpen(false)}>
                  Cancel
                </Button>
                <Button type="submit">Save file</Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </Tabs>
  );
}

function SheetRow({
  icon: Icon,
  onClick,
  children,
}: {
  icon: typeof Download;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="prism-focus flex h-touch items-center gap-3 rounded-prism-13 px-3 text-left font-prism text-prism-label text-prism-ink hover:bg-white/60"
    >
      <Icon aria-hidden className="h-5 w-5 text-prism-ink-2" />
      {children}
    </button>
  );
}
