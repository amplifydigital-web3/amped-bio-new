import { create } from "zustand";
import type {
  EditorState,
  UserProfile,
  Theme,
  ThemeConfig,
  Background,
  GalleryImage,
} from "../types/editor";
import {
  editUser,
  editBlocks,
  deleteBlock,
  addBlock as apiAddBlock,
} from "../api/api";
import initialState from "./defaults";
import { useAuthStore } from "./authStore";
import toast from "react-hot-toast";
import { BlockType } from "@/api/api.types";
import { formatOnelink, normalizeOnelink } from "@/utils/onelink";
import { trpcClient } from "@/utils/trpc";
import { exportThemeConfigAsJson, importThemeConfigFromJson } from "@/utils/theme";

interface EditorStore extends EditorState {
  changes: boolean;
  themeChanges: boolean; // New flag specifically for theme changes (appearance/effects)
  setUser: (onelink: string) => Promise<any>;
  setProfile: (profile: UserProfile) => void;
  addBlock: (block: BlockType) => Promise<BlockType>; // Updated return type
  removeBlock: (id: number) => void;
  updateBlock: (id: number, updatedConfig: BlockType["config"]) => void;
  reorderBlocks: (blocks: BlockType[]) => void;
  updateThemeConfig: (theme: Partial<ThemeConfig>) => void;
  setActivePanel: (panel: string) => void;
  setBackground: (background: Background) => void;
  setBackgroundForUpload: (background: Background) => void; // New function for uploads
  saveChanges: () => Promise<void>;
  setDefault: () => void;
  addToGallery: (image: GalleryImage) => void;
  removeFromGallery: (url: string) => void;
  setMarketplaceView: (view: "grid" | "list") => void;
  setMarketplaceFilter: (filter: string) => void;
  setMarketplaceSort: (sort: "popular" | "newest") => void;
  applyTheme: (theme: Theme) => void;
  selectedPoolId: string | null;
  setSelectedPoolId: (id: string | null) => void;
  exportTheme: (customFilename?: string) => void;
  importTheme: (file: File) => Promise<void>;
}

export const useEditorStore = create<EditorStore>()(set => ({
  changes: false,
  themeChanges: false, // Initialize themeChanges flag
  ...initialState,
  setUser: async (onelink: string) => {
    console.group(`🔍 Setting User: ${onelink}`);
    console.info("🚀 Loading user data...");
    try {
      const onlinkData = await trpcClient.onelink.getOnelink.query({ onelink });

      if (!onlinkData) {
        console.info("❌ User not found:", onelink);
        console.groupEnd();
        return;
      }
      const { user, theme, blocks: blocks_raw } = onlinkData;
      const { name, email, description, image } = user;
      // Normalize the onelink (remove @) and also create a formatted version (with @)
      const normalizedOnelink = normalizeOnelink(onelink);
      const formattedOnelink = formatOnelink(onelink);
      console.info("👤 User data loaded:", { name, email, blocks: blocks_raw, theme });

      set({
        profile: {
          name,
          onelink: normalizedOnelink,
          onelinkFormatted: formattedOnelink,
          email,
          bio: description ?? "",
          photoUrl: image ?? "",
        },
      });
      console.info("🎨 Setting theme...");
      // @ts-ignore
      set({ theme: { ...initialState.theme, ...theme } });
      const blocks = blocks_raw.sort((a, b) => a.order - b.order);
      console.info(`📦 Setting ${blocks.length} blocks...`);
      // @ts-ignore
      set({ blocks: blocks });
      console.info("✅ User setup complete");
      console.groupEnd();
      return onlinkData;
    } catch (error) {
      console.info("❌ Error getting user:", error);
      console.groupEnd();
      return;
    }
  },
  setProfile: profile => {
    console.group("👤 Setting Profile");
    console.info("New profile data:", profile);

    // Ensure both onelink formats are consistently maintained
    const updatedProfile = { ...profile };

    // If onelink was updated but onelinkFormatted wasn't updated in sync
    if (
      "onelink" in profile &&
      (!profile.onelinkFormatted || profile.onelinkFormatted !== formatOnelink(profile.onelink))
    ) {
      updatedProfile.onelinkFormatted = formatOnelink(profile.onelink);
    }

    // If onelinkFormatted was updated but onelink wasn't updated in sync
    if (
      "onelinkFormatted" in profile &&
      (!profile.onelink || profile.onelink !== normalizeOnelink(profile.onelinkFormatted))
    ) {
      updatedProfile.onelink = normalizeOnelink(profile.onelinkFormatted);
    }
    set({ profile: updatedProfile, changes: true });
    console.info(
      "✅ Profile updated with onelink:",
      updatedProfile.onelink,
      "and formatted onelink:",
      updatedProfile.onelinkFormatted
    );
    console.groupEnd();
  },
  addBlock: async (block: BlockType): Promise<BlockType> => {
    console.group("➕ Adding Block");
    console.info("Block data:", block);

    const { authUser } = useAuthStore.getState();
    let newBlock = block; // Initialize with the original block

    try {
      if (authUser === null) {
        console.info("❌ Add Block Error: No user logged in");
        toast.error("Authentication error");
        console.groupEnd();

        // Still add to local state even if not authenticated
        set(state => ({
          blocks: [...state.blocks, block],
          changes: true,
        }));
        return block; // Return original block
      }

      const blockOrder = useEditorStore.getState().blocks.length;

      console.info("🔄 Adding block to server...");
      const response = await apiAddBlock(block);
      console.info("✅ Block added to server:", response);

      // Update block with server-generated ID if available
      if (response?.result) {
        newBlock = {
          ...block,
          id: response.result.id,
          order: blockOrder,
        };
      }

      set(state => ({
        blocks: [...state.blocks, newBlock],
        changes: false, // No changes needed since we just saved to the server
      }));

      toast.success("Block added successfully");
      console.info("✅ Block added to state");
    } catch (error) {
      console.info("❌ Error adding block:", error);
      toast.error("Error adding block");

      // Still add to local state on error
      set(state => ({
        blocks: [...state.blocks, block],
        changes: true,
      }));
    }

    console.groupEnd();
    return newBlock; // Return the block with server-generated ID if available
  },
  removeBlock: async (id: number) => {
    console.group(`🗑️ Removing Block: ${id}`);
    const { authUser } = useAuthStore.getState();
    try {
      if (authUser === null) {
        console.info("❌ Remove Block Error: No user logged in");
        toast.error("Authentication error");
        console.groupEnd();
        return;
      }

      console.info("🔄 Deleting block from server...");
      await deleteBlock(id);
      console.info("✅ Block deleted from server");

      set(state => ({
        blocks: state.blocks.filter(block => block.id !== id),
      }));
      console.info("✅ Block removed from state");
      console.groupEnd();
    } catch (error) {
      console.info("❌ Error deleting block:", error);
      console.groupEnd();
    }
  },
  updateBlock: (id: number, updatedConfig: BlockType["config"]) => {
    console.group(`🔄 Updating Block: ${id}`);
    console.info("Update data:", updatedConfig);
    set(
      state =>
        ({
          blocks: state.blocks.map(block =>
            block.id === id ? { ...block, config: updatedConfig } : block
          ),
          changes: true,
        }) as Partial<EditorStore>
    );
    console.info("✅ Block updated");
    console.groupEnd();
  },
  reorderBlocks: (blocks: BlockType[]) => {
    console.group("🔀 Reordering Blocks");
    console.info(`Reordering ${blocks.length} blocks`);
    set({ blocks, changes: true });
    console.info("✅ Blocks reordered");
    console.groupEnd();
  },
  updateThemeConfig: config => {
    console.group("🎨 Updating Theme Config");
    console.info("New config:", config);
    set(state => ({
      theme: { ...state.theme, config: { ...state.theme.config, ...config } },
      changes: true,
      themeChanges: true, // Mark that theme-specific changes occurred
    }));
    console.info("✅ Theme config updated");
    console.groupEnd();
  },
  setActivePanel: (activePanel: string) => {
    console.group("📋 Setting Active Panel");
    console.info(`Panel: ${activePanel}`);
    set({ activePanel });
    console.info("✅ Active panel set");
    console.groupEnd();
  },
  setBackground: (background: Background) => {
    console.group("🖼️ Setting Background");
    console.info("Background:", background);
    set(state => ({
      theme: {
        ...state.theme,
        config: { ...state.theme.config, background },
      },
      changes: true,
      themeChanges: true, // Mark that theme-specific changes occurred
    }));
    console.info("✅ Background updated");
    console.groupEnd();
  },
  setBackgroundForUpload: (background: Background) => {
    console.group("📁 Setting Background for Upload");
    console.info("Background:", background);
    set(state => ({
      theme: {
        ...state.theme,
        config: { ...state.theme.config, background },
      },
      changes: true,
      // Note: NOT setting themeChanges to true for uploads
    }));
    console.info("✅ Background updated for upload (no theme change marked)");
    console.groupEnd();
  },
  addToGallery: image => {
    console.group("🖼️ Adding to Gallery");
    console.info("Image:", image);
    set(state => ({
      gallery: [...state.gallery, image],
    }));
    console.info("✅ Image added to gallery");
    console.groupEnd();
  },
  removeFromGallery: url => {
    console.group("🗑️ Removing from Gallery");
    console.info("URL:", url);
    set(state => ({
      gallery: state.gallery.filter(image => image.url !== url),
    }));
    console.info("✅ Image removed from gallery");
    console.groupEnd();
  },
  setMarketplaceView: marketplaceView => {
    console.group("🛒 Setting Marketplace View");
    console.info(`View: ${marketplaceView}`);
    set({ marketplaceView });
    console.info("✅ Marketplace view updated");
    console.groupEnd();
  },
  setMarketplaceFilter: marketplaceFilter => {
    console.group("🔍 Setting Marketplace Filter");
    console.info(`Filter: ${marketplaceFilter}`);
    set({ marketplaceFilter });
    console.info("✅ Marketplace filter updated");
    console.groupEnd();
  },
  setMarketplaceSort: marketplaceSort => {
    console.group("📊 Setting Marketplace Sort");
    console.info(`Sort: ${marketplaceSort}`);
    set({ marketplaceSort });
    console.info("✅ Marketplace sort updated");
    console.groupEnd();
  },
  applyTheme: theme => {
    console.group("🎨 Applying Theme");
    console.info("Theme:", theme.name);
    set({ 
      theme,
      // Don't mark as changes since backend already applied the theme
    });
    console.info("✅ Theme applied");
    console.groupEnd();
  },
  selectedPoolId: null,
  setSelectedPoolId: id => {
    console.group("🏊 Setting Selected Pool ID");
    console.info(`Pool ID: ${id}`);
    set({ selectedPoolId: id });
    console.info("✅ Selected pool ID updated");
    console.groupEnd();
  },
  saveChanges: async () => {
    console.group("💾 Saving Changes");
    console.info("Starting save process...");
    const { profile, theme, blocks, themeChanges } = useEditorStore.getState();
    const { authUser } = useAuthStore.getState();
    try {
      if (authUser === null || authUser.email !== profile.email) {
        console.info("❌ Save Error: No user logged in or email mismatch");
        toast.error("Authentication error");
        console.groupEnd();
        return;
      }

      let theme_status_id = theme.id; // Default to current theme ID

      // Only save theme if there are theme changes
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
      const blocks_status = await editBlocks(blocks);

      if (themeChanges && theme.id !== theme_status_id) {
        console.info("🆕 New theme created, updating ID");
        set(state => ({
          theme: { ...state.theme, id: theme_status_id },
        }));
      }

      console.info("👤 Saving user profile...");
      const status = await editUser({
        name: profile.name,
        email: profile.email,
        onelink: profile.onelink.replace(/@/g, ""),
        description: profile.bio,
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
      set({ changes: false, themeChanges: false }); // Reset both flags
      console.groupEnd();
    } catch (error) {
      console.info("❌ Save failed:", error);
      toast.error("Error saving changes");
      console.groupEnd();
    }
  },
  setDefault: () => {
    console.group("🔄 Resetting to Default");
    set({ ...initialState, changes: false, themeChanges: false });
    console.info("✅ Reset to default state");
    console.groupEnd();
  },
  exportTheme: (customFilename?: string) => {
    console.group("🎨 Exporting Theme Configuration");
    const { theme } = useEditorStore.getState();
    console.info("Theme config:", theme.config);

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
  importTheme: async (file: File) => {
    console.group("🎨 Importing Theme Configuration");
    console.info("File:", file.name);

    try {
      const importedThemeConfig = await importThemeConfigFromJson(file);
      console.info("Imported theme config:", importedThemeConfig);

      set(state => ({
        theme: {
          ...state.theme,
          config: importedThemeConfig,
        },
        changes: true,
        themeChanges: true, // Mark that theme-specific changes occurred
      }));

      toast.success("Theme configuration imported successfully");
      console.info("✅ Theme configuration imported");
      console.groupEnd();
    } catch (error) {
      console.error("❌ Theme configuration import failed:", error);
      toast.error("Failed to import theme configuration");
      console.groupEnd();
      throw error; // Rethrow to handle in the UI
    }
  },
}));
