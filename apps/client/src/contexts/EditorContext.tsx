import { createContext, useContext, useState, useCallback, ReactNode } from "react";
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
import { useAuth } from "./AuthContext";
import toast from "react-hot-toast";
import { BlockType } from "@ampedbio/constants";
import { formatHandle, normalizeHandle } from "@/utils/handle";
import { trpcClient } from "@/utils/trpc";
import { exportThemeConfigAsJson, importThemeConfigFromJson } from "@/utils/theme";
import { mergeTheme } from "@/utils/mergeTheme";
import { useNavigate, useLocation } from "react-router";

interface EditorContextType extends EditorState {
  changes: boolean;
  themeChanges: boolean;
  setUser: (handle: string) => Promise<any>;
  setProfile: (profile: UserProfile) => void;
  addBlock: (block: BlockType) => Promise<BlockType>;
  removeBlock: (id: number) => void;
  updateBlock: (id: number, updatedConfig: any) => void;
  reorderBlocks: (blocks: BlockType[]) => void;
  updateThemeConfig: (theme: Partial<ThemeConfig>) => void;
  setActivePanel: (panel: EditorPanelType) => void;
  setActivePanelAndNavigate: (panel: EditorPanelType, tabs?: string) => void;
  setBackground: (background: Background) => void;
  setBackgroundForUpload: (background: Background) => void;
  saveChanges: () => Promise<void>;
  clearRevoName: () => Promise<void>;
  setDefault: () => void;
  addToGallery: (image: GalleryImage) => void;
  removeFromGallery: (url: string) => void;
  setMarketplaceView: (view: "grid" | "list") => void;
  setMarketplaceFilter: (filter: string) => void;
  setMarketplaceSort: (sort: "popular" | "newest") => void;
  applyTheme: (theme: Theme) => void;
  setSelectedPoolId: (id: string | null) => void;
  exportTheme: (customFilename?: string) => void;
  importTheme: (file: File) => Promise<void>;
}

const EditorContext = createContext<EditorContextType | undefined>(undefined);

export const EditorProvider = ({ children }: { children: ReactNode }) => {
  const [state, setState] = useState<EditorState>(initialState);
  const [changes, setChanges] = useState(false);
  const [themeChanges, setThemeChanges] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();

  const { authUser } = useAuth();

  const setUser = useCallback(async (handle: string) => {
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
      const { id, name, email, revoName, description, image } = user;
      const normalizedHandle = normalizeHandle(handle);
      const formattedHandle = formatHandle(handle);
      // console.info("👤 User data loaded:", { name, email, blocks: blocks_raw, theme });

      const blocks = blocks_raw.sort((a, b) => a.order - b.order);

      setState(prevState => ({
        ...prevState,
        profile: {
          id,
          name,
          handle: normalizedHandle,
          handleFormatted: formattedHandle,
          revoName: revoName ?? "",
          email,
          bio: description ?? "",
          photoUrl: image ?? "",
        },
        theme: mergeTheme(prevState.theme, theme as unknown as Theme),
        blocks: blocks as unknown as BlockType[],
        hasCreatorPool,
      }));
      // console.info("✅ User setup complete");
      // console.groupEnd();
      return onlinkData;
    } catch (error) {
      console.info("❌ Error getting user:", error);
      return;
    }
  }, []);

  const setProfile = useCallback((profile: UserProfile) => {
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
    setChanges(true);
    console.info(
      "✅ Profile updated with handle:",
      updatedProfile.handle,
      "and formatted handle:",
      updatedProfile.handleFormatted
    );
    console.groupEnd();
  }, []);

  const addBlock = useCallback(
    async (block: BlockType): Promise<BlockType> => {
      console.group("➕ Adding Block");
      console.info("Block data:", block);

      let newBlock = block;

      try {
        const blockOrder = state.blocks.length;

        console.info("🔄 Adding block to server...");
        const response = await trpcClient.blocks.addBlock.mutate({
          type: block.type,
          config: block.config,
        });
        console.info("✅ Block added to server:", response);

        if (response?.result) {
          newBlock = {
            ...block,
            id: response.result.id,
            order: blockOrder,
          };
        }

        setState(prevState => ({
          ...prevState,
          blocks: [...prevState.blocks, newBlock],
        }));
        setChanges(false);

        toast.success("Block added successfully");
        console.info("✅ Block added to state");
      } catch (error) {
        console.info("❌ Error adding block:", error);
        toast.error("Error adding block");
        setChanges(true);
      }

      console.groupEnd();
      return newBlock;
    },
    [authUser, state.blocks.length]
  );

  const removeBlock = useCallback(
    async (id: number) => {
      console.group(`🗑️ Removing Block: ${id}`);
      try {
        if (authUser === null) {
          console.info("❌ Remove Block Error: No user logged in");
          toast.error("Authentication error");
          console.groupEnd();
          return;
        }

        console.info("🔄 Deleting block from server...");
        await trpcClient.blocks.deleteBlock.mutate({ id });
        console.info("✅ Block deleted from server");

        setState(prevState => ({
          ...prevState,
          blocks: prevState.blocks.filter(block => block.id !== id),
        }));
        console.info("✅ Block removed from state");
        console.groupEnd();
      } catch (error) {
        console.info("❌ Error deleting block:", error);
        console.groupEnd();
      }
    },
    [authUser]
  );

  const updateBlock = useCallback((id: number, updatedConfig: any) => {
    console.group(`🔄 Updating Block: ${id}`);
    console.info("Update data:", updatedConfig);
    setState(prevState => ({
      ...prevState,
      blocks: prevState.blocks.map(block =>
        block.id === id ? { ...block, config: updatedConfig } : block
      ),
    }));
    setChanges(true);
    console.info("✅ Block updated");
    console.groupEnd();
  }, []);

  const reorderBlocks = useCallback((blocks: BlockType[]) => {
    console.group("🔀 Reordering Blocks");
    console.info(`Reordering ${blocks.length} blocks`);
    setState(prevState => ({
      ...prevState,
      blocks,
    }));
    setChanges(true);
    console.info("✅ Blocks reordered");
    console.groupEnd();
  }, []);

  const updateThemeConfig = useCallback((config: Partial<ThemeConfig>) => {
    console.group("🎨 Updating Theme Config");
    console.info("New config:", config);
    setState(prevState => ({
      ...prevState,
      theme: { ...prevState.theme, config: { ...prevState.theme.config, ...config } },
    }));
    setChanges(true);
    setThemeChanges(true);
    console.info("✅ Theme config updated");
    console.groupEnd();
  }, []);

  const setActivePanel = useCallback((activePanel: EditorPanelType) => {
    setState(prevState => ({
      ...prevState,
      activePanel,
    }));
  }, []);

  const setActivePanelAndNavigate = useCallback(
    (activePanel: EditorPanelType, tabs?: string) => {
      setActivePanel(activePanel);

      // Update the URL with the panel and tabs parameters
      const searchParams = new URLSearchParams(location.search);
      searchParams.set("p", activePanel);

      if (tabs) {
        searchParams.set("t", tabs);
      } else {
        // Remove the t parameter if tabs is not provided
        searchParams.delete("t");
      }

      navigate(`${location.pathname}?${searchParams.toString()}`, { replace: true });
    },
    [navigate, location]
  );

  const setBackground = useCallback((background: Background) => {
    console.group("🖼️ Setting Background");
    console.info("Background:", background);
    setState(prevState => ({
      ...prevState,
      theme: {
        ...prevState.theme,
        config: { ...prevState.theme.config, background },
      },
    }));
    setChanges(true);
    setThemeChanges(true);
    console.info("✅ Background updated");
    console.groupEnd();
  }, []);

  const setBackgroundForUpload = useCallback((background: Background) => {
    console.group("📁 Setting Background for Upload");
    console.info("Background:", background);
    setState(prevState => ({
      ...prevState,
      theme: {
        ...prevState.theme,
        config: { ...prevState.theme.config, background },
      },
    }));
    setChanges(true);
    console.info("✅ Background updated for upload (no theme change marked)");
    console.groupEnd();
  }, []);

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

  const setMarketplaceView = useCallback((marketplaceView: "grid" | "list") => {
    console.group("🛒 Setting Marketplace View");
    console.info(`View: ${marketplaceView}`);
    setState(prevState => ({
      ...prevState,
      marketplaceView,
    }));
    console.info("✅ Marketplace view updated");
    console.groupEnd();
  }, []);

  const setMarketplaceFilter = useCallback((marketplaceFilter: string) => {
    console.group("🔍 Setting Marketplace Filter");
    console.info(`Filter: ${marketplaceFilter}`);
    setState(prevState => ({
      ...prevState,
      marketplaceFilter,
    }));
    console.info("✅ Marketplace filter updated");
    console.groupEnd();
  }, []);

  const setMarketplaceSort = useCallback((marketplaceSort: "popular" | "newest") => {
    console.group("📊 Setting Marketplace Sort");
    console.info(`Sort: ${marketplaceSort}`);
    setState(prevState => ({
      ...prevState,
      marketplaceSort,
    }));
    console.info("✅ Marketplace sort updated");
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

  const saveChanges = useCallback(async () => {
    console.group("💾 Saving Changes");
    console.info("Starting save process...");
    const { profile, theme, blocks } = state;
    try {
      if (authUser === null || authUser.email !== profile.email) {
        console.info("❌ Save Error: No user logged in or email mismatch");
        toast.error("Authentication error");
        console.groupEnd();
        return;
      }

      let theme_status_id = theme.id;

      if (themeChanges) {
        console.info("🎨 Saving theme...");
        const theme_status = await trpcClient.theme.editTheme.mutate({
          id: theme.id,
          theme: {
            name: theme.name,
            share_level: theme.share_level,
            share_config: theme.share_config,
            config: theme.config,
          },
        });
        console.info("Theme status:", theme_status);
        console.info("Theme", theme);
        theme_status_id = theme_status.id;
      } else {
        console.info("🎨 Skipping theme save - no theme changes detected");
      }

      console.info("📦 Saving blocks...");
      const blocks_status = await trpcClient.blocks.editBlocks.mutate({ blocks });

      if (themeChanges && theme.id !== theme_status_id) {
        console.info("🆕 New theme created, updating ID");
        setState(prevState => ({
          ...prevState,
          theme: { ...prevState.theme, id: theme_status_id },
        }));
      }

      console.info("👤 Saving user profile...");
      const status = await trpcClient.user.edit.mutate({
        name: profile.name,
        description: profile.bio,
        revo_name: profile.revoName || "",
        image: profile.photoUrl || "",
        reward_business_id: "",
        theme: theme_status_id,
      });

      if (!status) {
        console.info("❌ User Save failed");
        console.info(status);
        console.groupEnd();
        return;
      }
      if (!blocks_status) {
        console.info("❌ Blocks Save failed");
        console.info(blocks_status);
        console.groupEnd();
        return;
      }
      console.info("✅ Save success");
      toast.success("Changes saved successfully");
      setChanges(false);
      setThemeChanges(false);
      console.groupEnd();
    } catch (error) {
      console.info("❌ Save failed:", error);
      toast.error("Error saving changes");
      console.groupEnd();
    }
  }, [state, authUser, themeChanges]);

  const clearRevoName = useCallback(async () => {
    const { profile, theme } = state;
    try {
      await trpcClient.user.edit.mutate({
        name: profile.name,
        description: profile.bio,
        revo_name: "",
        image: profile.photoUrl || "",
        reward_business_id: "",
        theme: theme.id,
      });
      setState(prevState => ({
        ...prevState,
        profile: { ...prevState.profile, revoName: "" },
      }));
    } catch (error) {
      console.error("❌ Failed to clear revoName:", error);
      toast.error("Failed to update profile");
    }
  }, [state]);

  const setDefault = useCallback(() => {
    console.group("🔄 Resetting to Default");
    setState(initialState);
    setChanges(false);
    setThemeChanges(false);
    console.info("✅ Reset to default state");
    console.groupEnd();
  }, []);

  const exportTheme = useCallback(
    (customFilename?: string) => {
      console.group("🎨 Exporting Theme Configuration");
      const { theme } = state;
      console.info("Theme config:", theme.config);

      if (theme.user_id === null) {
        console.warn("❌ Export blocked: Cannot export server theme");
        toast.error(
          "Cannot export themes from other user. Please create or select your own theme first."
        );
        console.groupEnd();
        return;
      }

      try {
        exportThemeConfigAsJson(theme, customFilename);
        toast.success("Theme configuration exported successfully");
        console.info("✅ Theme configuration exported");
      } catch (error) {
        console.error("❌ Theme configuration export failed:", error);
        toast.error("Failed to export theme configuration");
      }

      console.groupEnd();
    },
    [state]
  );

  const importTheme = useCallback(
    async (file: File) => {
      console.group("🎨 Importing Theme Configuration");
      console.info("File:", file.name);

      const { theme } = state;

      if (theme.user_id === null) {
        console.warn("❌ Import blocked: Cannot import over other user theme");
        toast.error(
          "Cannot import themes while using a server theme. Please create or select your own theme first."
        );
        console.groupEnd();
        throw new Error("Cannot import themes while using a server theme");
      }

      try {
        const importedThemeConfig = await importThemeConfigFromJson(file);
        console.info("Imported theme config:", importedThemeConfig);

        setState(prevState => ({
          ...prevState,
          theme: {
            ...prevState.theme,
            config: importedThemeConfig,
          },
        }));
        setChanges(true);
        setThemeChanges(true);

        toast.success("Theme configuration imported successfully");
        console.info("✅ Theme configuration imported");
        console.groupEnd();
      } catch (error) {
        console.error("❌ Theme configuration import failed:", error);
        toast.error("Failed to import theme configuration");
        console.groupEnd();
        throw error;
      }
    },
    [state]
  );

  const value: EditorContextType = {
    ...state,
    changes,
    themeChanges,
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
    setDefault,
    addToGallery,
    removeFromGallery,
    setMarketplaceView,
    setMarketplaceFilter,
    setMarketplaceSort,
    applyTheme,
    setSelectedPoolId,
    exportTheme,
    importTheme,
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
