import {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
  useRef,
  ReactNode,
} from "react";
import type {
  EditorState,
  UserProfile,
  Theme,
  ThemeConfig,
  Background,
  GalleryImage,
  EditorPanelType,
} from "../types/editor";
import initialState from "../store/defaults";
import { useAuth } from "@repo/ui";
import toast from "react-hot-toast";
import { BlockType } from "@repo/constants";
import { formatHandle, normalizeHandle } from "@repo/ui";
import { queryClient, trpcClient } from "@repo/ui";
import { exportThemeConfigAsJson } from "@repo/ui";
import { mergeTheme } from "@/utils/mergeTheme";
import {
  announceSessionEnded,
  isSessionEnded,
  stashUnsavedEdits,
  takeUnsavedEdits,
} from "./unsavedEdits";
import { useNavigate, useLocation } from "react-router";
import { MY_PAGE_IDENTITY_KEY } from "@/components/panels/page/rns/useMyPageIdentity";

/**
 * Autosave status shown in the top bar (Screen Review 002 I02, D11).
 * idle: nothing edited since load. saved: the last edit is stored.
 * saving: a save is in flight. error: the last save failed (Retry).
 * offline: edits wait for the connection to come back.
 */
export type SaveStatus = "idle" | "saving" | "saved" | "error" | "offline";

/**
 * A look shown in the live preview without applying it: hovering or focusing
 * a Design option or theme card (Screen Review 023 to 033, 006 I11).
 */
export interface PreviewOverride {
  config: Partial<ThemeConfig>;
  /** Shown in the preview frame, for example "Previewing Paper. Not applied yet." */
  label?: string;
}

/** Debounce after the last edit before autosave runs (D11). */
export const AUTOSAVE_DELAY_MS = 800;

interface EditorContextType extends EditorState {
  changes: boolean;
  themeChanges: boolean;
  saveStatus: SaveStatus;
  /** True while an edit is not stored yet (pending, in flight, failed or offline). */
  hasUnsavedChanges: boolean;
  /** Save now instead of waiting for the debounce. Resolves true when stored. */
  flushSave: () => Promise<boolean>;
  /**
   * 081 I09: keep the edits not stored yet in this tab before a sign in
   * redirect. Returns true when there were edits and they were kept.
   */
  keepUnsavedEdits: () => boolean;
  previewOverride: PreviewOverride | null;
  setPreviewOverride: (override: PreviewOverride | null) => void;
  setUser: (handle: string) => Promise<any>;
  setProfile: (profile: UserProfile) => void;
  addBlock: (block: BlockType) => Promise<BlockType>;
  removeBlock: (id: number) => Promise<void>;
  /** The block row open in the Page list; the preview sets it on a click (D10, 036 I13). */
  selectedBlockId: number | null;
  selectBlock: (id: number | null) => void;
  updateBlock: (id: number, updatedConfig: any) => void;
  reorderBlocks: (blocks: BlockType[]) => void;
  updateThemeConfig: (theme: Partial<ThemeConfig>) => void;
  setActivePanel: (panel: EditorPanelType) => void;
  /**
   * Go to a destination. `tabs` is the legacy ?t= value (RNS views);
   * `options.tab` sets the destination tab (?tab=, D02 and D29).
   */
  setActivePanelAndNavigate: (
    panel: EditorPanelType,
    tabs?: string,
    options?: { tab?: string; open?: string }
  ) => void;
  setBackground: (background: Background) => void;
  setBackgroundForUpload: (background: Background) => void;
  saveChanges: () => Promise<boolean>;
  /** Clears the page RNS name on the server (108 I01), e.g. after a transfer */
  clearRevoName: () => Promise<void>;
  /** The page RNS name as stored, set by the Page RNS section after a save. Not an edit. */
  setSavedRevoName: (name: string) => void;
  setDefault: () => void;
  addToGallery: (image: GalleryImage) => void;
  removeFromGallery: (url: string) => void;
  applyTheme: (theme: Theme) => void;
  setSelectedPoolId: (id: string | null) => void;
  /** Download the theme as a .ampedtheme file. Throws on a locked theme. */
  exportTheme: (customFilename?: string) => void;
  /** Replace the whole theme config (theme file import and its Undo, 031). */
  replaceThemeConfig: (config: ThemeConfig) => void;
}

const EditorContext = createContext<EditorContextType | undefined>(undefined);

export const EditorProvider = ({ children }: { children: ReactNode }) => {
  const [state, setState] = useState<EditorState>(initialState);
  const [changes, setChanges] = useState(false);
  const [themeChanges, setThemeChanges] = useState(false);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle");
  const [previewOverride, setPreviewOverride] = useState<PreviewOverride | null>(null);
  const [selectedBlockId, selectBlock] = useState<number | null>(null);
  // Autosave bookkeeping. `revision` counts edits; `savedRevision` is the last
  // edit stored on the server. A save that finishes while newer edits exist
  // leaves them dirty, so nothing typed during a save is lost.
  const revision = useRef(0);
  const savedRevision = useRef(0);
  const stateRef = useRef(state);
  stateRef.current = state;
  const themeChangesRef = useRef(themeChanges);
  themeChangesRef.current = themeChanges;
  const markDirty = useCallback(() => {
    revision.current += 1;
    setChanges(true);
  }, []);
  // Theme edits get their own counter, so a save that started before a theme edit
  // does not clear themeChanges for it (that edit would never reach the server).
  const themeRevision = useRef(0);
  const markThemeDirty = useCallback(() => {
    themeRevision.current += 1;
    themeChangesRef.current = true;
    setThemeChanges(true);
  }, []);
  const navigate = useNavigate();
  const location = useLocation();

  const { authUser } = useAuth();

  const setUser = useCallback(
    async (handle: string) => {
      // console.group(`🔍 Setting User: ${handle}`);
      // console.info("🚀 Loading user data...");
      try {
        const onlinkData = await trpcClient.handle.getHandle.query({ handle });

        if (!onlinkData) {
          // console.info("❌ User not found:", handle);
          // console.groupEnd();
          return;
        }
        const { user, theme, blocks: blocks_raw, hasCreatorPool } = onlinkData;
        const { id, name, description, image } = user;
        const normalizedHandle = normalizeHandle(handle);
        const formattedHandle = formatHandle(handle);

        const blocks = blocks_raw.sort((a, b) => a.order - b.order);

        setState(prevState => ({
          ...prevState,
          profile: {
            id,
            name,
            handle: normalizedHandle,
            handleFormatted: formattedHandle,
            // 108 I02: the stored RNS name is private. The Page RNS section
            // reads it from rns.getMyPageIdentity and sets it here.
            revoName: "",
            // getHandle is public and does not return email. The signed in owner's
            // email comes from the session (authUser) where it is needed.
            email: "",
            bio: description ?? "",
            photoUrl: image ?? "",
          },
          theme: mergeTheme(prevState.theme, theme as unknown as Theme),
          blocks: blocks as unknown as BlockType[],
          hasCreatorPool,
        }));
        // 108 I02: the stored RNS name comes from the owner's private read.
        // Wallet name pages compare against it.
        if (import.meta.env.VITE_SHOW_RNS === "true") {
          void queryClient
            .fetchQuery({
              queryKey: MY_PAGE_IDENTITY_KEY,
              queryFn: () => trpcClient.rns.getMyPageIdentity.query(),
              staleTime: 30_000,
            })
            .then(data =>
              setState(prevState => ({
                ...prevState,
                profile: { ...prevState.profile, revoName: data.name ?? "" },
              }))
            )
            .catch(() => undefined);
        }
        // 081 I09: edits kept when the last session ended go back in, and
        // autosave stores them
        const kept = takeUnsavedEdits(id);
        if (kept) {
          setState(prevState => ({
            ...prevState,
            profile: { ...prevState.profile, ...kept.profile },
            blocks: kept.blocks,
            theme: kept.themeConfig
              ? { ...prevState.theme, config: kept.themeConfig }
              : prevState.theme,
          }));
          if (kept.themeConfig) markThemeDirty();
          markDirty();
        }
        // console.info("✅ User setup complete");
        // console.groupEnd();
        return onlinkData;
      } catch (error) {
        console.info("❌ Error getting user:", error);
        return;
      }
    },
    [markDirty, markThemeDirty]
  );

  const setProfile = useCallback(
    (profile: UserProfile) => {
      console.group("👤 Setting Profile");
      console.info("New profile data:", profile);

      const updatedProfile = { ...profile };

      if (
        "handle" in profile &&
        (!profile.handleFormatted || profile.handleFormatted !== formatHandle(profile.handle))
      ) {
        updatedProfile.handleFormatted = formatHandle(profile.handle);
      }

      if (
        "handleFormatted" in profile &&
        (!profile.handle || profile.handle !== normalizeHandle(profile.handleFormatted))
      ) {
        updatedProfile.handle = normalizeHandle(profile.handleFormatted);
      }

      setState(prevState => ({
        ...prevState,
        profile: updatedProfile,
      }));
      markDirty();
      console.info(
        "✅ Profile updated with handle:",
        updatedProfile.handle,
        "and formatted handle:",
        updatedProfile.handleFormatted
      );
      console.groupEnd();
    },
    [markDirty]
  );

  // Creates the block on the server and appends it. No toasts: the new row
  // opening inline is the confirmation (Screen Review 034 I10); callers show
  // failures where the action happened. Throws on failure.
  const addBlock = useCallback(
    async (block: BlockType): Promise<BlockType> => {
      const response = await trpcClient.blocks.addBlock.mutate({
        type: block.type,
        config: block.config,
      });
      const newBlock = {
        ...block,
        id: response?.result?.id ?? block.id,
        order: stateRef.current.blocks.length,
      } as BlockType;
      setState(prevState => ({
        ...prevState,
        blocks: [...prevState.blocks, newBlock],
      }));
      // The server stores new blocks at order 0; the next autosave writes the
      // real order, and any other unsaved edits stay dirty (037 I13)
      markDirty();
      return newBlock;
    },
    [markDirty]
  );

  // Deletes on the server, then locally. Throws on failure (036 I07 restores).
  const removeBlock = useCallback(async (id: number) => {
    await trpcClient.blocks.deleteBlock.mutate({ id });
    setState(prevState => ({
      ...prevState,
      blocks: prevState.blocks.filter(block => block.id !== id),
    }));
  }, []);

  const updateBlock = useCallback(
    (id: number, updatedConfig: any) => {
      console.group(`🔄 Updating Block: ${id}`);
      console.info("Update data:", updatedConfig);
      setState(prevState => ({
        ...prevState,
        blocks: prevState.blocks.map(block =>
          block.id === id ? { ...block, config: updatedConfig } : block
        ),
      }));
      markDirty();
      console.info("✅ Block updated");
      console.groupEnd();
    },
    [markDirty]
  );

  const reorderBlocks = useCallback(
    (blocks: BlockType[]) => {
      console.group("🔀 Reordering Blocks");
      console.info(`Reordering ${blocks.length} blocks`);
      setState(prevState => ({
        ...prevState,
        blocks,
      }));
      markDirty();
      console.info("✅ Blocks reordered");
      console.groupEnd();
    },
    [markDirty]
  );

  const updateThemeConfig = useCallback(
    (config: Partial<ThemeConfig>) => {
      console.group("🎨 Updating Theme Config");
      console.info("New config:", config);
      setState(prevState => ({
        ...prevState,
        theme: { ...prevState.theme, config: { ...prevState.theme.config, ...config } },
      }));
      markDirty();
      markThemeDirty();
      console.info("✅ Theme config updated");
      console.groupEnd();
    },
    [markDirty, markThemeDirty]
  );

  const setActivePanel = useCallback((activePanel: EditorPanelType) => {
    setState(prevState => ({
      ...prevState,
      activePanel,
    }));
  }, []);

  const setActivePanelAndNavigate = useCallback(
    (activePanel: EditorPanelType, tabs?: string, options?: { tab?: string; open?: string }) => {
      setActivePanel(activePanel);

      // Panels live as path segments (e.g. /gallery); tabs stay as ?t=
      const basePath = "";
      const searchParams = new URLSearchParams(location.search);
      searchParams.delete("p");

      if (tabs) {
        searchParams.set("t", tabs);
      } else {
        // Remove the t parameter if tabs is not provided
        searchParams.delete("t");
      }
      // A destination tab belongs to one destination; never carry it over
      searchParams.delete("tab");
      if (options?.tab) searchParams.set("tab", options.tab);
      // ?open= opens one row of the destination (Account, 020 I01)
      searchParams.delete("open");
      if (options?.open) searchParams.set("open", options.open);

      const query = searchParams.toString();
      navigate(`${basePath}/${activePanel}${query ? `?${query}` : ""}`, { replace: true });
    },
    [navigate, location, setActivePanel]
  );

  const setBackground = useCallback(
    (background: Background) => {
      console.group("🖼️ Setting Background");
      console.info("Background:", background);
      setState(prevState => ({
        ...prevState,
        theme: {
          ...prevState.theme,
          config: { ...prevState.theme.config, background },
        },
      }));
      markDirty();
      markThemeDirty();
      console.info("✅ Background updated");
      console.groupEnd();
    },
    [markDirty, markThemeDirty]
  );

  const setBackgroundForUpload = useCallback(
    (background: Background) => {
      console.group("📁 Setting Background for Upload");
      console.info("Background:", background);
      setState(prevState => ({
        ...prevState,
        theme: {
          ...prevState.theme,
          config: { ...prevState.theme.config, background },
        },
      }));
      markDirty();
      console.info("✅ Background updated for upload (no theme change marked)");
      console.groupEnd();
    },
    [markDirty]
  );

  const addToGallery = useCallback((image: GalleryImage) => {
    console.group("🖼️ Adding to Gallery");
    console.info("Image:", image);
    setState(prevState => ({
      ...prevState,
      gallery: [...prevState.gallery, image],
    }));
    console.info("✅ Image added to gallery");
    console.groupEnd();
  }, []);

  const removeFromGallery = useCallback((url: string) => {
    console.group("🗑️ Removing from Gallery");
    console.info("URL:", url);
    setState(prevState => ({
      ...prevState,
      gallery: prevState.gallery.filter(image => image.url !== url),
    }));
    console.info("✅ Image removed from gallery");
    console.groupEnd();
  }, []);

  const applyTheme = useCallback((theme: Theme) => {
    console.group("🎨 Applying Theme");
    console.info("Theme:", theme.name);
    setState(prevState => ({
      ...prevState,
      theme,
    }));
    console.info("✅ Theme applied");
    console.groupEnd();
  }, []);

  const setSelectedPoolId = useCallback((id: string | null) => {
    console.group("🏊 Setting Selected Pool ID");
    console.info(`Pool ID: ${id}`);
    setState(prevState => ({
      ...prevState,
      selectedPoolId: id,
    }));
    console.info("✅ Selected pool ID updated");
    console.groupEnd();
  }, []);

  // Stores the current profile, theme and blocks. Reads the latest state from
  // refs so the autosave timer never saves a stale snapshot. Returns true when
  // everything was stored. Autosave never toasts success (D11); failures show
  // in the top bar status with Retry instead of a toast.
  const saveChanges = useCallback(async (): Promise<boolean> => {
    const { profile, theme, blocks } = stateRef.current;
    const saveTheme = themeChangesRef.current;
    const themeRevisionAtStart = themeRevision.current;
    if (authUser === null || authUser.id !== profile.id) {
      toast.error("Authentication error");
      return false;
    }

    let themeId = theme.id;
    if (saveTheme) {
      const themeStatus = await trpcClient.theme.editTheme.mutate({
        id: theme.id,
        theme: {
          name: theme.name,
          share_level: theme.share_level,
          share_config: theme.share_config,
          config: theme.config,
        },
      });
      themeId = themeStatus.id;
    }

    const blocksStatus = await trpcClient.blocks.editBlocks.mutate({ blocks });

    if (saveTheme && theme.id !== themeId) {
      // Editing a shared theme creates the creator's own copy. Update the ref
      // right away too, so a save that starts before the next render edits the
      // copy instead of creating a second one.
      stateRef.current = {
        ...stateRef.current,
        theme: { ...stateRef.current.theme, id: themeId },
      };
      setState(prevState => ({
        ...prevState,
        theme: { ...prevState.theme, id: themeId },
      }));
    }

    // 108 I01: the RNS name has its own validated write (user.setRnsName)
    const userStatus = await trpcClient.user.edit.mutate({
      name: profile.name,
      description: profile.bio,
      image: profile.photoUrl || "",
      reward_business_id: "",
      theme: themeId,
    });

    if (!userStatus || !blocksStatus) return false;
    // A theme edit made during this save stays dirty for the next one
    if (saveTheme && themeRevision.current === themeRevisionAtStart) {
      themeChangesRef.current = false;
      setThemeChanges(false);
    }
    return true;
  }, [authUser]);

  // Autosave engine (Screen Review 002 I02 and I03, D11).
  const inFlight = useRef<Promise<boolean> | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const runSave = useCallback(async (): Promise<boolean> => {
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
    // One save at a time: wait for the running one, then save what is left.
    // A loop, not a single await: when several callers wait on the same save,
    // the first to resume starts the next save and the others must wait for it.
    while (inFlight.current) await inFlight.current;
    if (revision.current === savedRevision.current) return true;
    if (typeof navigator !== "undefined" && !navigator.onLine) {
      setSaveStatus("offline");
      return false;
    }

    const target = revision.current;
    setSaveStatus("saving");
    const attempt = saveChanges().catch(error => {
      console.error("Autosave failed:", error);
      // 081 I09: a 401 during a session opens Your session ended
      if (isSessionEnded(error)) announceSessionEnded();
      return false;
    });
    inFlight.current = attempt;
    const ok = await attempt;
    inFlight.current = null;

    if (!ok) {
      setSaveStatus(typeof navigator !== "undefined" && !navigator.onLine ? "offline" : "error");
      return false;
    }
    savedRevision.current = Math.max(savedRevision.current, target);
    if (revision.current === savedRevision.current) {
      setChanges(false);
      setSaveStatus("saved");
    }
    return true;
  }, [saveChanges]);

  const flushSave = useCallback(() => runSave(), [runSave]);

  // Debounce: save 800ms after the last edit
  const currentRevision = revision.current;
  useEffect(() => {
    if (!changes || currentRevision === savedRevision.current) return;
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      void runSave();
    }, AUTOSAVE_DELAY_MS);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [changes, currentRevision, runSave]);

  // Save right away when a field loses focus, and when the connection returns
  useEffect(() => {
    const onBlur = () => {
      if (revision.current !== savedRevision.current) void runSave();
    };
    const onOnline = () => {
      if (revision.current !== savedRevision.current) void runSave();
    };
    const onOffline = () => {
      if (revision.current !== savedRevision.current) setSaveStatus("offline");
    };
    document.addEventListener("focusout", onBlur);
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    return () => {
      document.removeEventListener("focusout", onBlur);
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
    };
  }, [runSave]);

  // Save right away on a destination change (D11)
  const activePanel = state.activePanel;
  useEffect(() => {
    if (revision.current !== savedRevision.current) void runSave();
  }, [activePanel, runSave]);

  // A preview belongs to the destination that set it
  useEffect(() => {
    setPreviewOverride(null);
  }, [activePanel]);

  // `changes` turns false only once the newest edit is stored
  const hasUnsavedChanges = changes;

  const keepUnsavedEdits = useCallback(() => {
    if (revision.current === savedRevision.current) return false;
    const { profile, blocks, theme } = stateRef.current;
    if (!profile.id) return false;
    return stashUnsavedEdits({
      userId: profile.id,
      profile: { name: profile.name, bio: profile.bio, photoUrl: profile.photoUrl ?? "" },
      blocks,
      themeConfig: themeChangesRef.current ? theme.config : undefined,
    });
  }, []);

  // Leave page guard: the browser asks only while an edit is not stored (I03)
  useEffect(() => {
    if (!hasUnsavedChanges) return;
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [hasUnsavedChanges]);

  const setSavedRevoName = useCallback((name: string) => {
    stateRef.current = {
      ...stateRef.current,
      profile: { ...stateRef.current.profile, revoName: name },
    };
    setState(prevState => ({ ...prevState, profile: { ...prevState.profile, revoName: name } }));
  }, []);

  const clearRevoName = useCallback(async () => {
    try {
      await trpcClient.user.setRnsName.mutate({ label: null });
      setSavedRevoName("");
      void queryClient.invalidateQueries({ queryKey: MY_PAGE_IDENTITY_KEY });
    } catch (error) {
      console.error("❌ Failed to clear the RNS name:", error);
      toast.error("We could not remove the RNS name from your page. Try again.");
    }
  }, [setSavedRevoName]);

  const setDefault = useCallback(() => {
    console.group("🔄 Resetting to Default");
    setState(initialState);
    setChanges(false);
    setThemeChanges(false);
    revision.current = 0;
    savedRevision.current = 0;
    setSaveStatus("idle");
    console.info("✅ Reset to default state");
    console.groupEnd();
  }, []);

  const exportTheme = useCallback((customFilename?: string) => {
    const { theme } = stateRef.current;
    // Another creator's theme cannot be saved as a file (031 I04)
    if (theme.user_id === null) throw new Error("Locked themes can't be saved as a file.");
    exportThemeConfigAsJson(theme, customFilename);
  }, []);

  const replaceThemeConfig = useCallback(
    (config: ThemeConfig) => {
      setState(prevState => ({
        ...prevState,
        theme: { ...prevState.theme, config },
      }));
      markDirty();
      markThemeDirty();
    },
    [markDirty, markThemeDirty]
  );

  const value: EditorContextType = {
    ...state,
    changes,
    themeChanges,
    saveStatus,
    hasUnsavedChanges,
    flushSave,
    keepUnsavedEdits,
    previewOverride,
    setPreviewOverride,
    selectedBlockId,
    selectBlock,
    setUser,
    setProfile,
    addBlock,
    removeBlock,
    updateBlock,
    reorderBlocks,
    updateThemeConfig,
    setActivePanel,
    setActivePanelAndNavigate,
    setBackground,
    setBackgroundForUpload,
    saveChanges,
    clearRevoName,
    setSavedRevoName,
    setDefault,
    addToGallery,
    removeFromGallery,
    applyTheme,
    setSelectedPoolId,
    exportTheme,
    replaceThemeConfig,
  };

  return <EditorContext.Provider value={value}>{children}</EditorContext.Provider>;
};

// eslint-disable-next-line react-refresh/only-export-components
export const useEditor = () => {
  const context = useContext(EditorContext);
  if (context === undefined) {
    throw new Error("useEditor must be used within an EditorProvider");
  }
  return context;
};
